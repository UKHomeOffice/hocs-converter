const aws = require('aws-sdk');
const logger = require('./logger');
const uuid = require('uuid/v4');
const {
    AWS: {
        S3: {
            S3_ACCESS_KEY,
            S3_SECRET_ACCESS_KEY,
            S3_REGION,
            S3_ENDPOINT
        },
        SQS: {
            SQS_ACCESS_KEY,
            SQS_SECRET_ACCESS_KEY,
            SQS_REGION
        }
    }
} = require('../config');

const isProduction = process.env.NODE_ENV === 'production';

const s3Client = new aws.S3({
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    sslEnabled: isProduction,
    s3ForcePathStyle: !isProduction
});

const sqsClient = new aws.SQS({
    accessKeyId: SQS_ACCESS_KEY,
    secretAccessKey: SQS_SECRET_ACCESS_KEY,
    region: SQS_REGION,
    sslEnabled: isProduction
});

module.exports = {
    sqsClient,
    s3Client
};