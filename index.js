const express = require('express');
const logger = require('./libs/logger');
const {PORT, AWS: {SQS: {INSECURE_QUEUE}}} = require('./config');
const {sqsClient} = require('./libs/aws');
const SQSListener = require('./libs/sqsListener');
const {handler} = require('./libs/convert');

const port = PORT;

const app = express();

app.get('/health', (req, res) => {
    return res.sendStatus(200);
});

const sqsListener = new SQSListener({
    sqs: sqsClient,
    queueUrl: INSECURE_QUEUE,
    messageHandler: handler,
    logger
});

sqsListener.start();

app.listen(port, (err) => {
    if (err) {
        logger.error('Failed to load application');
    }
    logger.info(`Application listening on port ${port}`);
});