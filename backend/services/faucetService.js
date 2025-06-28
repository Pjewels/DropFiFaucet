const { ethers } = require('ethers');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class FaucetService {
    constructor() {
        this.provider = null;
        this.wallet = null;
        this.rateLimitFile = '/tmp/faucet-rate-limits.json';
        
        this.initialize();
    }

    async initialize() {
        try {
            const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            
            const privateKey = process.env.FAUCET_PRIVATE_KEY;
            if (!privateKey) {
                throw new Error('FAUCET_PRIVATE_KEY not found');
            }
            
            this.wallet = new ethers.Wallet(privateKey, this.provider);
            
            logger.info('Faucet service initialized', {
                faucetAddress: this.wallet.address
            });
            
            await this.checkBalance();
            
        } catch (error) {
            logger.error('Failed to initialize faucet service', {
                error: error.message
            });
            throw error;
        }
    }

    loadRateLimits() {
        try {
            if (fs.existsSync(this.rateLimitFile)) {
                const data = fs.readFileSync(this.rateLimitFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            logger.warn('Failed to load rate limits file', { error: error.message });
        }
        
        return {
            addresses: {},
            ips: {},
            dailyLimits: {},
            shortTermLimits: {},
            blockedIps: {}
        };
    }

    saveRateLimits(data) {
        try {
            fs.writeFileSync(this.rateLimitFile, JSON.stringify(data, null, 2));
        } catch (error) {
            logger.error('Failed to save rate limits', { error: error.message });
        }
    }

    cleanupOldEntries(data) {
        const now = Date.now();
        const cooldownPeriod = parseInt(process.env.FAUCET_COOLDOWN) || 24 * 60 * 60 * 1000;
        const oneDay = 24 * 60 * 60 * 1000;
        const tenMinutes = 10 * 60 * 1000;
        const fifteenMinutes = 15 * 60 * 1000;
        
        for (const [address, timestamp] of Object.entries(data.addresses)) {
            if (now - timestamp > cooldownPeriod) {
                delete data.addresses[address];
            }
        }
        
        for (const [ip, timestamp] of Object.entries(data.ips)) {
            if (now - timestamp > cooldownPeriod) {
                delete data.ips[ip];
            }
        }
        
        for (const [ip, limit] of Object.entries(data.dailyLimits)) {
            if (now - limit.resetTime > oneDay) {
                delete data.dailyLimits[ip];
            }
        }
        
        for (const [ip, requests] of Object.entries(data.shortTermLimits)) {
            data.shortTermLimits[ip] = requests.filter(timestamp => now - timestamp <= tenMinutes);
            if (data.shortTermLimits[ip].length === 0) {
                delete data.shortTermLimits[ip];
            }
        }
        
        for (const [ip, blockTime] of Object.entries(data.blockedIps)) {
            if (now - blockTime > fifteenMinutes) {
                delete data.blockedIps[ip];
            }
        }
        
        return data;
    }

    async checkBalance() {
        try {
            const balance = await this.provider.getBalance(this.wallet.address);
            const balanceInMON = ethers.formatEther(balance);
            
            logger.info('Faucet balance checked', {
                balance: balanceInMON + ' MON',
                faucetAddress: this.wallet.address
            });
            
            if (parseFloat(balanceInMON) < 10) {
                logger.warn('Faucet balance is low', {
                    balance: balanceInMON + ' MON'
                });
            }
            
            return balanceInMON;
        } catch (error) {
            logger.error('Failed to check faucet balance', {
                error: error.message
            });
            throw error;
        }
    }

    isRateLimited(address, ip) {
        const now = Date.now();
        const cooldownPeriod = parseInt(process.env.FAUCET_COOLDOWN) || 24 * 60 * 60 * 1000;
        const fifteenMinutes = 15 * 60 * 1000;
        
        let data = this.loadRateLimits();
        data = this.cleanupOldEntries(data);
        
        if (data.blockedIps[ip]) {
            const blockTime = data.blockedIps[ip];
            const timeLeft = fifteenMinutes - (now - blockTime);
            if (timeLeft > 0) {
                return {
                    limited: true,
                    timeLeft: Math.ceil(timeLeft / 1000 / 60),
                    reason: 'blocked_ip'
                };
            }
        }
        
        if (data.addresses[address]) {
            const lastRequest = data.addresses[address];
            if (now - lastRequest < cooldownPeriod) {
                const timeLeft = cooldownPeriod - (now - lastRequest);
                return {
                    limited: true,
                    timeLeft: Math.ceil(timeLeft / 1000 / 60),
                    reason: 'address'
                };
            }
        }
        
        if (data.ips[ip]) {
            const lastRequest = data.ips[ip];
            if (now - lastRequest < cooldownPeriod) {
                const timeLeft = cooldownPeriod - (now - lastRequest);
                return {
                    limited: true,
                    timeLeft: Math.ceil(timeLeft / 1000 / 60),
                    reason: 'ip'
                };
            }
        }
        
        const dailyLimit = 2;
        if (data.dailyLimits[ip]) {
            const limit = data.dailyLimits[ip];
            const oneDay = 24 * 60 * 60 * 1000;
            
            if (now - limit.resetTime > oneDay) {
                delete data.dailyLimits[ip];
            } else if (limit.count >= dailyLimit) {
                return {
                    limited: true,
                    timeLeft: Math.ceil((oneDay - (now - limit.resetTime)) / 1000 / 60),
                    reason: 'daily_limit'
                };
            }
        }
        
        return { limited: false };
    }

    trackRequest(ip) {
        const now = Date.now();
        
        let data = this.loadRateLimits();
        data = this.cleanupOldEntries(data);
        
        if (!data.shortTermLimits[ip]) {
            data.shortTermLimits[ip] = [];
        }
        data.shortTermLimits[ip].push(now);
        
        if (data.shortTermLimits[ip].length >= 4) {
            data.blockedIps[ip] = now;
            logger.warn('IP blocked for excessive requests', {
                ip: ip,
                requestCount: data.shortTermLimits[ip].length,
                timeWindow: '10 minutes'
            });
        }
        
        this.saveRateLimits(data);
    }

    updateRateLimits(address, ip) {
        const now = Date.now();
        
        let data = this.loadRateLimits();
        data = this.cleanupOldEntries(data);
        
        data.addresses[address] = now;
        data.ips[ip] = now;
        
        if (data.dailyLimits[ip]) {
            data.dailyLimits[ip].count += 1;
        } else {
            data.dailyLimits[ip] = { count: 1, resetTime: now };
        }
        
        this.saveRateLimits(data);
    }

    async sendTokens(toAddress, clientIP) {
        try {
            this.trackRequest(clientIP);
            
            const rateLimitCheck = this.isRateLimited(toAddress, clientIP);
            if (rateLimitCheck.limited) {
                let message;
                switch (rateLimitCheck.reason) {
                    case 'blocked_ip':
                        message = `Your IP has been temporarily blocked due to too many requests. Please wait ${rateLimitCheck.timeLeft} minutes before trying again.`;
                        break;
                    case 'address':
                        message = `This address has already received tokens. Please wait ${rateLimitCheck.timeLeft} minutes before requesting again.`;
                        break;
                    case 'ip':
                        message = `Too many requests from your IP. Please wait ${rateLimitCheck.timeLeft} minutes before requesting again.`;
                        break;
                    case 'daily_limit':
                        message = `Daily limit exceeded (2 requests per day). Please wait ${rateLimitCheck.timeLeft} minutes before requesting again.`;
                        break;
                    default:
                        message = `Rate limit exceeded. Please wait ${rateLimitCheck.timeLeft} minutes before requesting again.`;
                }
                
                logger.warn('Rate limit exceeded', {
                    address: toAddress,
                    ip: clientIP,
                    reason: rateLimitCheck.reason,
                    timeLeft: rateLimitCheck.timeLeft
                });
                
                return {
                    success: false,
                    error: message,
                    retryAfter: rateLimitCheck.timeLeft
                };
            }
            
            const faucetAmount = ethers.parseEther(process.env.FAUCET_AMOUNT || '0.25');
            
            const tx = {
                to: toAddress,
                value: faucetAmount,
                gasLimit: 21000
            };

            const txResponse = await this.wallet.sendTransaction(tx);
            const receipt = await txResponse.wait(1);
            
            if (receipt.status === 1) {
                this.updateRateLimits(toAddress, clientIP);
                
                return {
                    success: true,
                    txHash: receipt.hash,
                    amount: ethers.formatEther(faucetAmount) + ' MON'
                };
            } else {
                return {
                    success: false,
                    error: 'Transaction failed'
                };
            }
        } catch (error) {
            logger.error('Error sending tokens', { error: error.message });
            return {
                success: false,
                error: 'Transaction failed. Please try again later.'
            };
        }
    }

    getStatus() {
        try {
            return {
                success: true,
                faucetAddress: this.wallet.address,
                network: 'Monad Testnet',
                faucetAmount: process.env.FAUCET_AMOUNT || '0.25',
                cooldownPeriod: parseInt(process.env.FAUCET_COOLDOWN) || 24 * 60 * 60 * 1000,
                dailyLimit: 2,
                shortTermLimit: '4 requests per 10 minutes',
                blockDuration: '15 minutes'
            };
        } catch (error) {
            logger.error('Error getting faucet status', { error: error.message });
            return {
                success: false,
                error: 'Unable to get faucet status'
            };
        }
    }

    cleanup() {
        logger.info('Faucet service cleanup completed');
    }
}

const faucetService = new FaucetService();

module.exports = faucetService; 