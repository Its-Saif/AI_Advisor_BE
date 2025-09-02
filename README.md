# AI Advisor Backend

A simple Node.js backend server with WebSocket support for the AI Advisor React Native app.

## Features

- Express.js HTTP server
- WebSocket server for real-time chat
- CORS enabled
- TypeScript support
- Hot reload with nodemon
- Environment configuration

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
npm start
```

## Environment Variables

Create a `.env` file in the root directory:

```
PORT=8080
NODE_ENV=development
```

## API Endpoints

- `GET /health` - Health check endpoint

## WebSocket

- Connect to `ws://localhost:8080` for real-time chat
- Send messages in JSON format: `{ "message": "your message", "timestamp": "ISO string" }`
- Receive AI responses in the same format

## Development

The server includes a simple AI response simulator. Replace the `simulateAIResponse` function with your actual LLM integration.

## File Structure

```
src/
  server.ts       # Main server file
dist/             # Compiled JavaScript (after build)
.env              # Environment variables
nodemon.json      # Nodemon configuration
tsconfig.json     # TypeScript configuration
```
