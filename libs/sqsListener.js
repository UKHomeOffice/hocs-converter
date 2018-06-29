const {EventEmitter} = require('events');

class SQSListener extends EventEmitter {
    constructor(options) {
        super();
        if (options) {
            this.messageHandler = options.messageHandler;
            this.sqs = options.sqs;
            this.queueUrl = options.queueUrl;
            this.maxNumberOfMessages = options.maxNumberOfMessages || 1;
            this.waitTimeSeconds = options.waitTimeSeconds || 20;
            this.logger = options.logger;
            this.isRunning = false;

            this.start = this.start.bind(this);
            this.stop = this.stop.bind(this);
            this.listen = this.listen.bind(this);
            this.processMessage = this.processMessage.bind(this);
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
        if (this.isRunning) {
            this.sqs.receiveMessage({
                QueueUrl: this.queueUrl,
                MaxNumberOfMessages: this.maxNumberOfMessages,
                WaitTimeSeconds: this.waitTimeSeconds
            }, this.processMessage)
        }
    }

    processMessage(err, res) {
        if (err) {
            if (err.message.includes('AWS.SimpleQueueService.NonExistentQueue')) {
                this.logger.error('Queue does no exist, stopping SQS Listener');
                return this.stop();
            }
            return this.listen();
        }

        if (res && res.Messages && res.Messages.length > 0) {
            this.logger.debug(`${res.Messages.length} message(s) retrieved from queue`);
            res.Messages.map(message => {
                this.messageHandler(message, () => {
                    const params = {
                        QueueUrl: this.queueUrl,
                        ReceiptHandle: message.ReceiptHandle
                    };
                    this.sqs.deleteMessage(params, (err, data) => {
                        if (err) {
                            this.logger.error(`Failed to remove original request from SQS: ${err.stack}`);
                        } else {
                            this.logger.debug('Original message removed from the queue');
                        }
                    });
                    return this.listen();
                });
            });

        } else if (res && !res.Messages) {
            this.logger.debug('No messages in queue');
            return this.listen();
        }
    }
}

module.exports = SQSListener;