import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store connected clients
const clients = new Set();

// WebSocket connection handler
wss.on("connection", (ws) => {
  console.log("New client connected");
  clients.add(ws);

  // Send welcome message
  ws.send(
    JSON.stringify({
      message: "Hello! I'm your AI advisor. How can I help you today?",
      timestamp: new Date().toISOString(),
    })
  );

  // Handle incoming messages
  ws.on("message", async (data) => {
    try {
      const parsedData = JSON.parse(data.toString());
      console.log("Received:", parsedData);

      // Simulate AI response (replace this with your LLM integration)
      const aiResponse = await simulateAIResponse(parsedData.message);

      // Send AI response back to client
      ws.send(
        JSON.stringify({
          message: aiResponse,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.error("Error processing message:", error);
      ws.send(
        JSON.stringify({
          message: "Sorry, I encountered an error processing your message.",
          timestamp: new Date().toISOString(),
        })
      );
    }
  });

  // Handle client disconnect
  ws.on("close", () => {
    console.log("Client disconnected");
    clients.delete(ws);
  });

  // Handle errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    clients.delete(ws);
  });
});

// Simulate AI response (replace with actual LLM integration)
async function simulateAIResponse(message: string): Promise<string> {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Simple response logic (replace with your LLM)
  const responses = [
    `I understand you're asking about: "${message}". Let me help you with that.`,
    `That's an interesting question about "${message}". Here's my perspective...`,
    `Based on your message about "${message}", I'd recommend the following approach...`,
    `Thank you for sharing that. Regarding "${message}", here's what I think...`,
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Start server
server.listen(Number(port), "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`WebSocket server running on ws://localhost:${port}`);
});
