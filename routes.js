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
        callback(null, file.originalname);
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
    req.file ? req.correlationId = req.get('X-Correlation-ID') || req.file.originalname : 'NO FILE';
    next();
};

const validateDocument = (req, res, next) => {
    if (!req.file) {
        logger.warn(errors.NO_FILE);
        return res.status(400).send(errors.NO_FILE);
    }

    const {path: file, originalname, size} = req.file;

    try {
        detectFile(file, (err, result) => {
            logger.debug(`${req.correlationId} - validating file (${originalname}) ${result}, ${size} bytes`);
            const extension = path.extname(originalname).slice(1);
            if (size > max_size) {
                logger.warn(`${req.correlationId} - ${errors.FILE_TOO_LARGE}`);
                return deleteFile(req, () => {
                    res.status(400).send(`${errors.FILE_TOO_LARGE} ${size}`);
                });
            }
            if (!supported_types.includes(extension)) {
                logger.warn(`${req.correlationId} - ${errors.UNSUPPORTED_TYPE}`);
                return deleteFile(req, () => {
                    res.status(400).send(`${errors.UNSUPPORTED_TYPE} ${extension}`);
                });
            }
            if (!supported_mime_types.includes(result)) {
                logger.warn(`${req.correlationId} - ${errors.UNSUPPORTED_TYPE}`);
                return deleteFile(req, () => {
                    res.status(400).send(`${errors.UNSUPPORTED_TYPE} ${result}`);
                });
            }
            next();
        });
    } catch (e) {
        logger.error(`${req.correlationId} - ${errors.FAILED_TO_VALIDATE} ${e}`);
        deleteFile(req, () => {
            return res.status(500).send(`${errors.FAILED_TO_VALIDATE} - ${e}`);
        });
    }
};

const createJob = (req, res, processStartTime) => {
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
        });
    });

    childProcess.on('error', err => {
        logger.error(`${req.correlationId} - unoconv child process failed: ${err}`);
        res.status(500).send(err);
    });

    res.set('Content-Type', 'application/pdf');
    childProcess.stdout.pipe(res);
};

const convertDocument = (req, res) => {
    req.setTimeout(converter_timeout);
    return createJob(req, res, process.hrtime());
};

router.post('/', upload, processDocument, validateDocument, convertDocument);

module.exports = router;