module.exports = {
    MAX_FILESIZE: 1e7,
    CONVERTER_TIMEOUT: 3e5,
    SUPPORTED_TYPES: 'doc,docx,txt,rtf,html,pdf',
    PORT: 9999,
    AWS: {
        S3: {
            INSECURE_BUCKET: process.env.INSECURE_BUCKET || 'hocs-untrusted-bucket',
            SECURE_BUCKET: process.env.SECURE_BUCKET || 'hocs-secure-bucket',
            S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || 'UNSET',
            S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ||  'UNSET',
            S3_REGION: process.env.S3_REGION || 'eu-west-2',
            S3_ENDPOINT: process.env.S3_ENDPOINT || 'http://localstack:4572'
        },
        SQS: {
            INSECURE_QUEUE: process.env.INSECURE_QUEUE || 'http://localstack:4576/queue/hocs-documents-insecure',
            SECURE_QUEUE: process.env.SECURE_QUEUE || 'http://localstack:4576/queue/hocs-documents-secure',
            SQS_ACCESS_KEY: process.env.SQS_ACCESS_KEY || 'UNSET',
            SQS_SECRET_ACCESS_KEY: process.env.SQS_SECRET_ACCESS_KEY || 'UNSET',
            SQS_REGION: process.env.SQS_REGION || 'eu-west-2'
        }
    },
    CLAMAV_HOST: null
};