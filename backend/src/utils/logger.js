const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'booking-service' },
    transports: [
        // Console with colorized output
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // Combined log (all levels)
        new winston.transports.File({
            filename: path.join(__dirname, '../../combined.log')
        }),
        // Error-only log
        new winston.transports.File({
            filename: path.join(__dirname, '../../error.log'),
            level: 'error'
        })
    ],
});

module.exports = logger;
