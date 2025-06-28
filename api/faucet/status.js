const faucetService = require('../../backend/services/faucetService');
const logger = require('../../backend/utils/logger');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            message: 'Method not allowed'
        });
    }

    try {
        const status = faucetService.getStatus();
        return res.status(200).json(status);
    } catch (error) {
        logger.error('Status endpoint error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Unable to get faucet status'
        });
    }
}; 