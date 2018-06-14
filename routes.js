const router = require('express').Router();
const multer = require('multer');
const uuid = require('uuid/v4');
const spawn = require('child_process').spawn;
const logger = require('./libs/logger');
const fs = require('fs');

const converter_timeout = process.env.CONVERTER_TIMEOUT || 300000;

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, '/tmp');
    },
    filename: (req, file, callback) => {
        callback(null, uuid());
    }
});

const upload = multer({storage}).single('file');

const createJob = (file, res) => {
    const childProcess = spawn('unoconv', [
        '--stdout',
        '--no-launch',
        file
    ]);

    childProcess.on('exit', code => {
        logger.info('unoconv child process exited with code: ', code);
        fs.unlink(file);
    });

    childProcess.on('error', err => {
        logger.error('unoconv child process failed: ', err);
        res.status(500).send(err);
    });

    childProcess.stdout.pipe(res);
};

const convertDocument = (req, res) => {
    req.setTimeout(converter_timeout);
    const {mimetype, path} = req.file;

    return createJob(path, res);
};

router.post('/', upload, convertDocument);

module.exports = router;