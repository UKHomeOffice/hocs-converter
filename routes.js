const router = require('express').Router();
const multer = require('multer');
const uuid = require('uuid/v4');
const spawn = require('child_process').spawn;
const logger = require('./libs/logger');
const fs = require('fs');

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
        logger.info('Unoconv spawn child exited with code', code);
        fs.unlink(file);
    });

    childProcess.stdout.pipe(res);
};

const convertDocument = (req, res) => {
    const {mimetype, path} = req.file;

    return createJob(path, res);
};

router.post('/', upload, convertDocument);

module.exports = router;