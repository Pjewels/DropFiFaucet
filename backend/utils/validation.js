const { ethers } = require('ethers');

function validateAddress(address) {
    return ethers.isAddress(address);
}

function sanitizeInput(input) {
    return input.trim().toLowerCase();
}

function validateTxHash(txHash) {
    if (typeof txHash !== 'string') {
        return false;
    }
    
    const txHashPattern = /^0x[a-fA-F0-9]{64}$/;
    return txHashPattern.test(txHash);
}

function validateIP(ip) {
    if (typeof ip !== 'string') {
        return false;
    }
    
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(ip)) {
        return false;
    }
    
    const octets = ip.split('.');
    return octets.every(octet => {
        const num = parseInt(octet, 10);
        return num >= 0 && num <= 255;
    });
}

function validateAmount(amount) {
    try {
        const amountFloat = parseFloat(amount);
        return amountFloat > 0 && amountFloat <= 1;
    } catch (error) {
        return false;
    }
}

function validateRateLimit(timestamp, cooldownMs) {
    const now = Date.now();
    const timeSinceLastRequest = now - timestamp;
    
    if (timeSinceLastRequest < cooldownMs) {
        const remainingTime = cooldownMs - timeSinceLastRequest;
        return {
            allowed: false,
            remainingTime: Math.ceil(remainingTime / 1000 / 60),
            remainingMs: remainingTime
        };
    }
    
    return {
        allowed: true,
        remainingTime: 0,
        remainingMs: 0
    };
}

module.exports = {
    validateAddress,
    sanitizeInput,
    validateTxHash,
    validateIP,
    validateAmount,
    validateRateLimit
}; 