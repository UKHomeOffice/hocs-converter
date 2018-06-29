const mimeDb = require('mime-db');
const mmm = require('mmmagic');
const magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE);
const {SUPPORTED_TYPES} = require('../config');

const mimeTypes = Object.keys(mimeDb).reduce((reducer, key) => {
    const type = mimeDb[key];
    if (type.extensions && type.extensions.length > 0) {
        type.extensions.map(extension => reducer[extension] = key);
    }
    return reducer;
}, {});

const supported_types = SUPPORTED_TYPES.split(',');

const supported_mime_types = supported_types.reduce((reducer, extension) => {
    reducer.push(mimeTypes[extension]);
    return reducer;
}, []);

const detectFile = (file, callback) => {
    magic.detectFile(file, (err, result) => {
        callback(err, result);
    });
};

module.exports = {
    supported_types,
    supported_mime_types,
    detectFile
};
