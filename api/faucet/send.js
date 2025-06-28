const { body, validationResult } = require('express-validator');
const faucetService = require('../../backend/services/faucetService');
const logger = require('../../backend/utils/logger');
const { validateAddress, sanitizeInput } = require('../../backend/utils/validation');

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 10 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 3,
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '10 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const validateFaucetRequest = [
    body('address')
        .isString()
        .trim()
        .isLength({ min: 42, max: 42 })
        .matches(/^0x[a-fA-F0-9]{40}$/)
        .withMessage('Invalid Ethereum address format'),
];

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: 'Method not allowed'
        });
    }

    try {
        await new Promise((resolve, reject) => {
            limiter(req, res, (result) => {
                if (result instanceof Error) {
                    reject(result);
                } else {
                    resolve(result);
                }
            });
        });

        const { address } = req.body;
        
        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Address is required'
            });
        }

        const clientIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
        
        const sanitizedAddress = sanitizeInput(address);
        
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

        const result = await faucetService.sendTokens(sanitizedAddress, clientIP);
        
        if (result.success) {
            logger.info('Faucet transaction successful', {
                address: sanitizedAddress,
                txHash: result.txHash,
                amount: result.amount,
                ip: clientIP
            });
            
            return res.status(200).json({
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
            
            return res.status(400).json({
                success: false,
                message: result.error || 'Transaction failed',
                retryAfter: result.retryAfter || null
            });
        }

    } catch (error) {
        logger.error('Faucet endpoint error', {
            error: error.message,
            stack: error.stack,
            ip: req.headers['x-forwarded-for'] || 'unknown'
        });
        
        return res.status(500).json({
            success: false,
            message: 'Internal server error. Please try again later.'
        });
    }
}; 