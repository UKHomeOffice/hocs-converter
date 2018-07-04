const {EventEmitter} = require('events');

class SQSListener extends EventEmitter {
    constructor(options) {
        super();
        if (options) {
            this.messageHandler = options.messageHandler;
            this.sqs = options.sqs;
            this.queueUrl = options.queueUrl;
            this.maxNumberOfMessages = options.maxNumberOfMessages || 10;
            this.waitTimeSeconds = options.waitTimeSeconds || 20;
            this.logger = options.logger;
            this.isRunning = false;
            this.isProcessing = false;

            this.start = this.start.bind(this);
            this.stop = this.stop.bind(this);
            this.listen = this.listen.bind(this);
            this.processMessage = this.processMessages.bind(this);
        } else {
            throw new Error('Failed to create listener, no configuration provided')
        }
    }

    start() {
        if (!this.isRunning) {
            this.logger.info('SQS Listener started');
            this.isRunning = true;
            this.listen();
        }
    };

    stop() {
        this.logger.info('SQS Listener stopped');
        this.isRunning = false;
    }

    listen() {
        this.logger.debug(`Listening...`);
        if (this.isRunning) {
            if (!this.isProcessing) {
                this.sqs.receiveMessage({
                    QueueUrl: this.queueUrl,
                    MaxNumberOfMessages: this.maxNumberOfMessages,
                    WaitTimeSeconds: this.waitTimeSeconds
                }, (err, res) => {
                    if (err) {
                        if (err.message.includes('AWS.SimpleQueueService.NonExistentQueue')) {
                            this.logger.error('Queue does no exist, stopping SQS Listener');
                        }
                        return this.stop();
                    }
                    if (res && res.Messages && res.Messages.length > 0) {
                        this.processMessages(res.Messages).then(() => {
                            this.isProcessing = false;
                            return this.listen();
                        });
                    } else {
                        if (res && !res.Messages) {
                            this.logger.debug('No messages in queue');
                            return this.listen();
                        }
                    }
                })
            }
        }
    }

    processMessages(messages) {
        return new Promise((resolve, reject) => {
            this.logger.debug(`${messages.length} message(s) retrieved from queue`);
            this.isProcessing = true;
            this.messageHandler(messages)
                .then(() => {
                    this.logger.debug(`Deleting original messages from inbound queue`);
                    messages.map(message => {
                        const params = {
                            QueueUrl: this.queueUrl,
                            ReceiptHandle: message.ReceiptHandle
                        };
                        this.sqs.deleteMessage(params, (err, data) => {
                            if (err) {
                                this.logger.error(`Failed to remove original request from SQS: ${err.stack}`);
                            } else {
                                this.logger.debug(`Original message removed from the queue`);
                            }
                        });
                    });
                    resolve();
                });
        });
    }
}

module.exports = SQSListener;