const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const faucetService = require('./services/faucetService');
const logger = require('./utils/logger');
const { validateAddress, sanitizeInput } = require('./utils/validation');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            process.env.FRONTEND_URL
        ];
        
        if (process.env.NODE_ENV === 'production') {
            allowedOrigins.push(
                /^https:\/\/.*\.vercel\.app$/,
                /^https:\/\/.*\.netlify\.app$/
            );
        }
        
        if (!origin || allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') return allowed === origin;
            if (allowed instanceof RegExp) return allowed.test(origin);
            return false;
        })) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 10 * 60 * 1000, // 10 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 3, // limit each IP to 3 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '10 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to faucet endpoint
app.use('/api/faucet', limiter);

// Validation middleware
const validateFaucetRequest = [
    body('address')
        .isString()
        .trim()
        .isLength({ min: 42, max: 42 })
        .matches(/^0x[a-fA-F0-9]{40}$/)
        .withMessage('Invalid Ethereum address format'),
];

// Routes
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Monad Faucet Backend'
    });
});

app.post('/api/faucet/send', validateFaucetRequest, async (req, res) => {
    try {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn('Validation failed', { 
                errors: errors.array(), 
                ip: req.ip 
            });
            return res.status(400).json({
                success: false,
                message: 'Invalid request data',
                errors: errors.array()
            });
        }

        const { address } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        // Sanitize input
        const sanitizedAddress = sanitizeInput(address);
        
        // Additional address validation
        if (!validateAddress(sanitizedAddress)) {
            logger.warn('Invalid address format', { 
                address: sanitizedAddress, 
                ip: clientIP 
            });
            return res.status(400).json({
                success: false,
                message: 'Invalid Ethereum address format'
            });
        }

        logger.info('Faucet request received', { 
            address: sanitizedAddress, 
            ip: clientIP 
        });

        // Process faucet request
        const result = await faucetService.sendTokens(sanitizedAddress, clientIP);
        
        if (result.success) {
            logger.info('Faucet transaction successful', {
                address: sanitizedAddress,
                txHash: result.txHash,
                amount: result.amount,
                ip: clientIP
            });
            
            res.json({
                success: true,
                message: `${result.amount} has been sent to your address`,
                txHash: result.txHash,
                amount: result.amount,
                network: 'Monad Testnet'
            });
        } else {
            logger.error('Faucet transaction failed', {
                address: sanitizedAddress,
                error: result.error,
                ip: clientIP
            });
            
            res.status(500).json({
                success: false,
                message: result.error || 'Transaction failed',
                retryAfter: result.retryAfter || null
            });
        }

    } catch (error) {
        logger.error('Faucet endpoint error', {
            error: error.message,
            stack: error.stack,
            ip: req.ip
        });
        
        res.status(500).json({
            success: false,
            message: 'Internal server error. Please try again later.'
        });
    }
});

// Get faucet status
app.get('/api/faucet/status', (req, res) => {
    try {
        const status = faucetService.getStatus();
        res.json(status);
    } catch (error) {
        logger.error('Status endpoint error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Unable to get faucet status'
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    });
    
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Only start server in development or when not in Vercel
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        logger.info(`Monad Faucet Backend running on port ${PORT}`);
        logger.info('Environment:', process.env.NODE_ENV || 'development');
    });

    process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down gracefully');
        process.exit(0);
    });

    process.on('SIGINT', () => {
        logger.info('SIGINT received, shutting down gracefully');
        process.exit(0);
    });
}

module.exports = app; 