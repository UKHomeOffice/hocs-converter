const router = require('express').Router();
const multer = require('multer');
const uuid = require('uuid/v4');
const spawn = require('child_process').spawn;
const logger = require('./libs/logger');
const fs = require('fs');
const path = require('path');
const errors = require('./libs/errors');
const {supported_types, supported_mime_types, detectFile} = require('./libs/mime');
const config = require('./config');
const request = require('request');

const converter_timeout = process.env.CONVERTER_TIMEOUT || config.CONVERTER_TIMEOUT;
const max_size = process.env.MAX_FILESIZE || config.MAX_FILESIZE;

logger.info(`Converter request timeout: ${converter_timeout / 1000} seconds`);
logger.info(`Supported file types: ${supported_types}`);
logger.info(`Supported mime types: ${supported_mime_types}`);
logger.info(`Max filesize: ${max_size / 1e6}MB`);

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, '/tmp');
    },
    filename: (req, file, callback) => {
        callback(null, uuid());
    }
});

const upload = multer({storage}).single('file');

const deleteFile = (req, callback) => {
    fs.unlink(req.file.path, err => {
        if (err) {
            logger.error(`${req.correlationId} - failed to delete file`);
        } else {
            logger.debug(`${req.correlationId} - deleted file`);
        }
        callback();
    });
};

const processDocument = (req, res, next) => {
    if (req.file) {
        req.correlationId = req.get('X-Correlation-ID') || req.file.originalname;
    } else {
        logger.warn(errors.NO_FILE);
        res.status(400);
        res.state = (errors.NO_FILE);
        return next('route');
    }
    next();
};

const validateDocument = (req, res, next) => {

    const {path: file, originalname, size} = req.file;

    try {
        detectFile(file, (err, result) => {
            logger.debug(`${req.correlationId} - validating file (${originalname}) ${result}, ${size} bytes`);
            const extension = path.extname(originalname).slice(1);
            if (size > max_size) {
                logger.warn(`${req.correlationId} - ${errors.FILE_TOO_LARGE}`);
                return deleteFile(req, () => {
                    res.status(400);
                    res.state = errors.FILE_TOO_LARGE; // ${size}
                    return next('route');
                });
            }
            if (!supported_types.includes(extension)) {
                logger.warn(`${req.correlationId} - ${errors.UNSUPPORTED_TYPE}`);
                return deleteFile(req, () => {
                    res.status(400);
                    res.state = errors.UNSUPPORTED_TYPE; // ${extension}
                    next('route');
                });
            }
            if (!supported_mime_types.includes(result)) {
                logger.warn(`${req.correlationId} - ${errors.UNSUPPORTED_TYPE}`);
                return deleteFile(req, () => {
                    res.status(400);
                    res.state = errors.UNSUPPORTED_TYPE; // ${result}
                    next('route');
                });
            }
            next();
        });
    } catch (e) {
        logger.error(`${req.correlationId} - ${errors.FAILED_TO_VALIDATE} ${e}`);
        deleteFile(req, () => {
            res.status(500);
            res.state = errors.FAILED_TO_VALIDATE; // ${e}
            next('route');
        });
    }
};

const createJob = (req, res, next, processStartTime) => {
    logger.info(`${req.correlationId} - unoconv child process starting`);
    const childProcess = spawn('unoconv', [
        '--stdout',
        '--no-launch',
        req.file.path
    ]);

    childProcess.on('exit', code => {
        logger.info(`${req.correlationId} - unoconv child process exited with code: ${code}`);
        deleteFile(req, () => {
            logger.debug(`${req.correlationId} - execution time ${process.hrtime(processStartTime)}ms`);
            if (!process.env.OUTPUT_PDF) return next('route');
        });
    });

    childProcess.on('error', err => {
        logger.error(`${req.correlationId} - unoconv child process failed: ${err}`);
        res.state = errors.CONVERSION_ERROR;
        res.status(500);
        next('route');
    });

    if (process.env.OUTPUT_PDF) {
        res.set('Content-Type', 'application/pdf');
        childProcess.stdout.pipe(res);
    }
    res.state = errors.CONVERSION_OK;

};

const convertDocument = (req, res, next) => {
    req.setTimeout(converter_timeout);
    return createJob(req, res, next, process.hrtime());
};

const malwareScanDocument = (req, res, next) => {
    if (!process.env.CLAMAV_HOST) {
        logger.warn('CLAMAV_HOST not configured -- skipping virus scan!');
        return next();
    }
    // Borrowed from https://github.com/UKHomeOffice/file-vault/blob/3069b0b/controllers/file.js#L64 (Crown Copyright)
    const suspectFile = {
        name: req.file.originalname,
        file: fs.createReadStream(req.file.path)
    };

    request.post({
        uri: process.env.CLAMAV_HOST + '/scan',
        formData: suspectFile,
        timeout: 30 * 1000
    }, (err, httpResponse, body) => {
        if (err || httpResponse.statusCode !== 200) {
            logger.error(`Problem sending data to malware checker - ${err ? err : httpResponse.statusCode}`);
            res.status(500);
            res.state = errors.MALWARE_CHECK_ERROR;
            return next('route');
        } else if (body.indexOf('false') !== -1) {
            logger.info('Malware found - ' + body);
            res.state = errors.MALWARE_FOUND;
            return next('route');
        }
        logger.info('Malware check passed - ' + body);
        return next();
    });
};

const outputJson = (req, res) => {
    let output = {
        caseUUID: null,
        documentUUID: req.file ? req.file.filename : null,
        documentDisplayName: req.file ? req.file.originalname : null,
        documentType: req.file ? req.file.mimetype : null,
        s3OrigLink: null,
        s3PdfLink: null,
        status: res.state ? res.state : null
    };
    return res.json(output);
};

router.post('/', upload, processDocument, malwareScanDocument, validateDocument, convertDocument);

router.post('/', outputJson);

module.exports = router;
