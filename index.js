const express = require('express');
const logger = require('./libs/logger');
const apiRouter = require('./routes');

const port = process.env.PORT || 8080;

const app = express();

app.use('/api', apiRouter);

app.listen(port, (err) => {
    if (err) {
        logger.error('Failed to load application');
    }
    logger.info(`Application listening on port ${port}`);
});