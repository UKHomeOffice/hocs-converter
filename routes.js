const router = require('express').Router();
const multer = require('multer');
const uuid = require('uuid/v4');
const logger = require('./libs/logger');

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, '/tmp');
    },
    filename: (req, file, callback) => {
        callback(null, uuid());
    }
});

const upload = multer({storage});

const convertDocument = (req, res, next) => {

};

router.post('/', upload.single('file'), convertDocument());

module.exports = router;