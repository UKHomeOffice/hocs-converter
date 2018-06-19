const express = require('express');
const logger = require('./libs/logger');
const apiRouter = require('./routes');
const config = require('./config');

const port = process.env.PORT || config.PORT;

const app = express();

app.get('/health', (req, res) => {
   return res.sendStatus(200);
});

app.use('/api', apiRouter);

app.listen(port, (err) => {
    if (err) {
        logger.error('Failed to load application');
    }
    logger.info(`Application listening on port ${port}`);
});