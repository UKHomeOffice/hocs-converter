const uuid = require('uuid/v4');
const spawn = require('child_process').spawn;
const fs = require('fs');
const path = require('path');
const request = require('request');
const logger = require('./logger');
const {MAX_FILESIZE, CLAMAV_HOST, AWS: {S3: {INSECURE_BUCKET, SECURE_BUCKET}, SQS: {SECURE_QUEUE}}} = require('../config');
const {FILE_TOO_LARGE, UNSUPPORTED_TYPE, CONVERSION_OK, CONVERSION_ERROR, MALWARE_CHECK_ERROR, MALWARE_FOUND} = require('./status');
const {supported_types, supported_mime_types, detectFile} = require('./mime');
const {s3Client, sqsClient} = require('./aws');

const max_size = MAX_FILESIZE;

logger.info(`Supported file types: ${supported_types}`);
logger.info(`Supported mime types: ${supported_mime_types}`);
logger.info(`Max filesize: ${max_size / 1e6}MB`);

const deleteFile = (req, callback) => {

    fs.unlink(req.file.filePath, err => {
        if (err) {
            logger.error(`${req.documentUUID} - failed to delete file`);
        } else {
            logger.debug(`${req.documentUUID} - deleted file`);
        }
        callback();
    });
};

const validateDocument = (req, res, callback) => {
    const {size, filePath, documentDisplayName} = req.file;
    detectFile(filePath, (err, result) => {
        logger.debug(`${req.documentUUID} - validating file (${filePath}) ${result} ${size} bytes`);
        if (size > max_size) {
            logger.warn(`${req.documentUUID} - ${FILE_TOO_LARGE}`);
            deleteFile(req, () => {
                res.status = FILE_TOO_LARGE;
                return callback();
            });
        }
        if (documentDisplayName) {
            req.extension = path.extname(documentDisplayName).slice(1);
            if (!supported_types.includes(req.extension)) {
                logger.warn(`${req.documentUUID} - ${UNSUPPORTED_TYPE}`);
                deleteFile(req, () => {
                    res.status = UNSUPPORTED_TYPE;
                    return callback();
                });
            }
        }

        if (!supported_mime_types.includes(result)) {
            logger.warn(`${req.documentUUID} - ${UNSUPPORTED_TYPE}`);
            deleteFile(req, () => {
                res.status = UNSUPPORTED_TYPE;
                return callback();
            });
        }
        return callback();
    });
};

const createJob = (req, res, processStartTime, callback) => {
    const {filePath} = req.file;
    logger.info(`${req.documentUUID} - unoconv child process starting`);
    const childProcess = spawn('unoconv', [
        '--stdout',
        '--no-launch',
        filePath
    ]);

    let buffer = new Buffer(0);

    childProcess.stdout
        .on('data', chunk => {
            buffer = Buffer.concat([buffer, chunk])
        })
        .on('end', () => {
            logger.debug('Converted');
            return callback(buffer);
        });

    childProcess.on('exit', code => {
        logger.info(`${req.documentUUID} - unoconv child process exited with code: ${code}`);
        deleteFile(req, () => {
            logger.debug(`${req.documentUUID} - execution time ${process.hrtime(processStartTime)}ms`);
        });
    });

    childProcess.on('error', err => {
        logger.error(`${req.documentUUID} - unoconv child process failed: ${err}`);
        res.status = CONVERSION_ERROR;
    });

};

const convertDocument = (request, response, callback) => {
    createJob(request, response, process.hrtime(), callback);
};

const malwareScanDocument = (req, res, callback) => {
    if (!CLAMAV_HOST) {
        logger.warn('CLAMAV_HOST not configured -- skipping virus scan!');
        return callback();
    }
    // Borrowed from https://github.com/UKHomeOffice/file-vault/blob/3069b0b/controllers/file.js#L64 (Crown Copyright)
    const suspectFile = {
        name: req.documentUUID,
        file: fs.createReadStream(req.file.filePath)
    };

    request.post({
        uri: CLAMAV_HOST + '/scan',
        formData: suspectFile,
        timeout: 3e4
    }, (err, httpResponse, body) => {
        if (err || httpResponse.statusCode !== 200) {
            logger.error(`Problem sending data to malware checker - ${err ? err : httpResponse.statusCode}`);
            res.status = MALWARE_CHECK_ERROR;
        } else if (body.indexOf('false') !== -1) {
            logger.info('Malware found - ' + body);
            res.status = MALWARE_FOUND;
        }
        return callback();
    });
};

const handler = (message, callback) => {
    const req = JSON.parse(message.Body);
    logger.debug(`Message passed to handler: ${req.caseUUID}, ${req.documentUUID}, ${req.s3UntrustedUrl}`);
    const filePath = `/tmp/${req.documentUUID}`;
    const fileWriteStream = fs.createWriteStream(filePath);
    logger.debug(`Retrieving file from S3`);
    s3Client.getObject({
        Bucket: INSECURE_BUCKET,
        Key: req.s3UntrustedUrl
    })
        .on('error', err => {
            logger.error(`Failed to retrieve file from S3: ${err.stack}`);
        })
        .on('httpData', chunk => {
            fileWriteStream.write(chunk);
        })
        .on('httpDone', () => {
            logger.debug('Retrieved file from S3');
            fileWriteStream.end();
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    logger.warn('Unable to get file stats');
                }
                req.file = {
                    filePath,
                    displayName: req.documentDisplayName,
                    size: stats.size
                };
                const res = {
                    caseUUID: req.caseUUID,
                    documentUUID: req.documentUUID,
                    s3trustedUrl: null,
                    s3PdfUrl: null,
                    status: CONVERSION_OK
                };
                malwareScanDocument(req, res, () => {
                    if (res.status === CONVERSION_OK) {
                        validateDocument(req, res, () => {
                            if (res.status === CONVERSION_OK) {
                                const s3trustedUUID = uuid();
                                const params = {
                                    Bucket: SECURE_BUCKET,
                                    CopySource: `/${INSECURE_BUCKET}/${req.s3UntrustedUrl}`,
                                    Key: s3trustedUUID
                                };
                                s3Client.copyObject(params, (err, data) => {
                                    if (err) {
                                        logger.error(`Failed to store original document in S3: ${err.stack}`);
                                    }
                                    else {
                                        logger.info('Stored original document in S3');
                                        // TODO: Set to actual URL
                                        res.s3trustedUrl = s3trustedUUID;
                                    }
                                    convertDocument(req, res, (file) => {
                                        if (res.status === CONVERSION_OK) {
                                            const s3PdfUUID = uuid();
                                            const params = {
                                                Body: file,
                                                Bucket: SECURE_BUCKET,
                                                Key: s3PdfUUID,
                                                Tagging: `caseId=${req.caseUUID}`
                                            };
                                            s3Client.putObject(params, (err, data) => {
                                                if (err) {
                                                    logger.error(`Failed to store converted document in S3: ${err.stack}`);
                                                }
                                                else {
                                                    logger.info('Stored converted document in S3');
                                                    // TODO: Set to actual URL
                                                    res.s3PdfUrl = s3trustedUUID;
                                                    logger.debug(JSON.stringify(res));
                                                    const params = {
                                                        DelaySeconds: 10,
                                                        MessageAttributes: {
                                                            "Type": {
                                                                DataType: "String",
                                                                StringValue: "AddDocumentResponse"
                                                            }
                                                        },
                                                        MessageBody: JSON.stringify(res),
                                                        QueueUrl: SECURE_QUEUE
                                                    };

                                                    sqsClient.sendMessage(params, (err, data) => {
                                                        if (err) {
                                                            logger.error(`Failed to post response to SQS: ${err.stack}`);
                                                        } else {
                                                            logger.info(`Posted response to SQS: ${data.MessageId}`);
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                        return callback();
                                    });
                                });
                            }
                        });
                    }
                });
            })
        })
        .send();
};

module.exports = {
    handler
};
