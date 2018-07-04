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

const initialiseJob = (message) => {
    return new Promise((resolve, reject) => {
        const req = JSON.parse(message.Body);
        logger.info(`${req.documentUUID} - Message passed to handler`);
        const filePath = `/tmp/${req.documentUUID}`;
        const fileWriteStream = fs.createWriteStream(filePath);
        logger.debug(`${req.documentUUID} - Retrieving file from S3`);
        const params = {
            Bucket: INSECURE_BUCKET,
            Key: req.s3UntrustedUrl
        };
        const s3Stream = s3Client.getObject(params).createReadStream();
        s3Stream.on('error', err => {
            return reject(`${req.documentUUID} - Failed to retrieve file from the untrusted bucket: ${err.stack}`);
        });
        s3Stream.pipe(fileWriteStream);
        fileWriteStream.on('close', () => {
            logger.debug(`${req.documentUUID} - Retrieved file from the untrusted bucket`);
            fileWriteStream.end();
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    reject(`${req.documentUUID} - Unable to get file stats`);
                }
                req.file = {
                    filePath,
                    documentDisplayName: req.documentDisplayName,
                    size: stats.size
                };
                const res = {
                    caseUUID: req.caseUUID,
                    documentUUID: req.documentUUID,
                    s3trustedUrl: null,
                    s3PdfUrl: null,
                    status: CONVERSION_OK
                };
                resolve({req, res});
            });
        });
    });
};

const malwareScanDocument = ({req, res}) => {
    return new Promise((resolve, reject) => {
        if (!CLAMAV_HOST) {
            logger.warn('CLAMAV_HOST not configured - skipping virus scan!');
            return resolve({req, res});
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
                logger.error(`${req.documentUUID} - Document malware scan failed - ${err ? err : httpResponse.statusCode}`);
                res.status = MALWARE_CHECK_ERROR;
            } else if (body.indexOf('false') !== -1) {
                logger.info(`${req.documentUUID} - Malware detected - ${body}`);
                res.status = MALWARE_FOUND;
            }
            return callback();
        });
        if (res.status === CONVERSION_OK) {
            resolve({req, res});
        } else {
            reject(res.status);
        }
    });
};


const validateDocument = ({req, res}) => {
    return new Promise((resolve, reject) => {
        const {size, filePath, documentDisplayName} = req.file;
        detectFile(filePath, (err, result) => {
            logger.debug(`${req.documentUUID} - validating file (${filePath}) ${result} ${size} bytes`);
            if (size > MAX_FILESIZE) {
                logger.warn(`${req.documentUUID} - ${FILE_TOO_LARGE}`);
                deleteFile(req, () => {
                    res.status = FILE_TOO_LARGE;
                    return reject(res.status);
                });
            }
            if (documentDisplayName) {
                req.extension = path.extname(documentDisplayName).slice(1);
                if (!supported_types.includes(req.extension)) {
                    logger.warn(`${req.documentUUID} - ${UNSUPPORTED_TYPE}`);
                    deleteFile(req, () => {
                        res.status = UNSUPPORTED_TYPE;
                        return reject(res.status);
                    });
                }
            }

            if (!supported_mime_types.includes(result)) {
                logger.warn(`${req.documentUUID} - ${UNSUPPORTED_TYPE}`);
                deleteFile(req, () => {
                    res.status = UNSUPPORTED_TYPE;
                    return reject(res.status);
                });
            }

            if (res.status === CONVERSION_OK) {
                const s3trustedUUID = uuid();
                const params = {
                    Bucket: SECURE_BUCKET,
                    CopySource: `/${INSECURE_BUCKET}/${req.s3UntrustedUrl}`,
                    Key: s3trustedUUID
                };
                s3Client.copyObject(params, (err, data) => {
                    if (err) {
                        return reject(`${req.documentUUID} - Failed to store original document in the trusted bucket: ${err.stack}`);
                    }
                    else {
                        logger.info(`${req.documentUUID} - Stored original document in the trusted bucket`);
                        // TODO: Set to actual URL
                        res.s3trustedUrl = s3trustedUUID;
                        return resolve({req, res});
                    }
                });
            } else {
                return reject();
            }
        });
    });
};

const createConversionInstance = (req, res, processStartTime) => {
    return new Promise((resolve, reject) => {
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
                logger.debug(`${req.documentUUID} - Converted`);
                return resolve(buffer);
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
            return reject(err);
        });
        resolve('Some Text');
    });
};

const convertDocument = ({req, res}) => {
    return new Promise((resolve, reject) => {
        createConversionInstance(req, res, process.hrtime()).then(file => {
            if (res.status === CONVERSION_OK) {
                const s3PdfUUID = uuid();
                res.s3PdfUrl = s3PdfUUID;
                const params = {
                    Body: file,
                    Bucket: SECURE_BUCKET,
                    Key: s3PdfUUID,
                    Tagging: `caseId=${req.caseUUID}`
                };
                s3Client.putObject(params, (err, data) => {
                    if (err) {
                        return reject(`${req.documentUUID} - Failed to store converted document in the trusted bucket: ${err.stack}`);
                    }
                    else {
                        logger.info(`${req.documentUUID} - Stored converted document in the trusted bucket`);
                        return resolve({req, res, queue: SECURE_QUEUE});
                    }
                });
            }
        }).catch(err => logger.error(err));
    });
};

const createJob = (queue, message) => {
    let job = initialiseJob(message);
    queue.push(job);
    return queue;
};

const postResponseToQueue = ({req, res, queue}) => {
    return new Promise((resolve, reject) => {
        logger.debug(`RESPONSE @ ${queue}: ${JSON.stringify(res)}`);
        const params = {
            DelaySeconds: 10,
            MessageAttributes: {
                "Type": {
                    DataType: "String",
                    StringValue: "AddDocumentResponse"
                }
            },
            MessageBody: JSON.stringify(res),
            QueueUrl: queue
        };
        sqsClient.sendMessage(params, (err, data) => {
            if (err) {
                return reject(`${req.documentUUID} - Failed to post response to outbound queue: ${err.stack}`);
            } else {
                logger.info(`${req.documentUUID} - Posted response to outbound queue: ${data.MessageId}`);
                return resolve();
            }
        });
    });
};

const processJobs = (jobs) => {
    let index = 0;
    return new Promise((resolve, reject) => {
        const next = () => {
            if (index < jobs.length) {
                jobs[index++]
                    .then(job => malwareScanDocument(job))
                    .then(job => validateDocument(job))
                    .then(job => convertDocument(job))
                    .then(response => postResponseToQueue(response))
                    .then(() => next())
                    .catch(err => {
                        logger.warn(`${err}`);
                        next();
                    });
            } else {
                logger.debug(`Jobs complete, resolving`);
                return resolve();
            }
        };
        next();
    });
};

const messageHandler = (messages) => {
    return new Promise((resolve, reject) => {
        if (messages) {
            let jobs = messages.reduce(createJob, []);
            processJobs(jobs)
                .then(output => {
                    logger.debug(`Handing back to listener`);
                    return resolve();
                })
                .catch(err => logger.warn(`Unable to hand back to listener ${err.stack}`));
        } else {
            return reject();
        }
    });
};

module.exports = {
    messageHandler
};
