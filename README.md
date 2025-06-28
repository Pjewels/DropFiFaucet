# Monad Testnet Faucet

A secure and user-friendly faucet for the Monad testnet that distributes MON tokens to developers and testers.

## Features

- **Beautiful UI**: Modern design with gradient elements and responsive layout
- **Telegram Integration**: Users must join the Telegram channel before claiming tokens
- **Rate Limiting**: Comprehensive protection against abuse
  - 2 requests per IP per day
  - 24-hour cooldown per wallet address
  - Automatic 15-minute block after 4 requests in 10 minutes
- **Secure Backend**: Built with Node.js, Express, and ethers.js
- **Vercel Ready**: Optimized for serverless deployment

## Quick Start

### Prerequisites

- Node.js 18+
- Monad testnet private key with MON tokens
- Environment variables configured

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Pjewels/DropFiFaucet.git
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp backend/ .env
```

Edit `.env` with your configuration:
```
FAUCET_PRIVATE_KEY=your_private_key_here
MONAD_RPC_URL=your_monad_rpc
FAUCET_AMOUNT=amount to disperse
```

### Local Development

1. Start the backend server:
```bash
npm start
```

2. Serve the frontend (in another terminal):
```bash
cd frontend
npx http-server -p 3000
```

3. Visit `http://localhost:3000`

## Deployment

### Vercel Deployment

1. Set environment variables in Vercel dashboard:
   - `FAUCET_PRIVATE_KEY`
   - `MONAD_RPC_URL` (optional)
   - `FAUCET_AMOUNT` (optional)

2. Deploy:
```bash
vercel --prod
```

## API Endpoints

- `POST /api/faucet/send` - Send tokens to an address
- `GET /api/faucet/status` - Get faucet status
- `GET /api/health` - Health check

## Rate Limits

- **Daily Limit**: 2 successful requests per IP per day
- **Address Cooldown**: 24 hours between requests per wallet
- **IP Protection**: 15-minute block after 4 requests in 10 minutes
- **API Rate Limit**: 3 requests per 10 minutes per IP


## License

MIT License