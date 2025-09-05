# Backend Documentation

## Overview

This backend powers **semantic search** and **conversational product recommendations**.  
Users can query for products in natural language, and the system responds with the most relevant product along with reasoning behind the selection.

The system leverages **AI agents**, **vector search**, and **structured product data** to deliver contextual responses.

---

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express 5
- **Database:** PostgreSQL
- **Vector Database:** Pinecone
- **AI / Orchestration:** OpenAI (LangChain & LangGraph)

---

## Agents

The backend uses **two AI agents** built with **LangChain/LangGraph**:

### 1. Supervisor Agent

- Determines the **intent** of the user query.
- Possible intents:
  - Product inquiry
  - Follow-up question
  - Small talk
  - Product unavailable

### 2. Processor Agent

- Handles **semantic product search**.
- Queries **Pinecone DB** to find the most relevant product.
- Returns:
  - `product_id`
  - `reason` (why this product matches best)

➡️ The **Supervisor Agent** then queries **PostgreSQL** with `product_id` to fetch product details, and merges them with the reasoning for the final response.

---

## Data Flow / System Architecture

1. User submits a query.
2. **Supervisor Agent** determines the intent.
   - If **product inquiry**, forwards to **Processor Agent**.
3. **Processor Agent** performs semantic search in Pinecone DB.
   - Returns `id` + `reason`.
4. **Supervisor Agent** queries PostgreSQL with `id` to fetch product details.
5. Response is **streamed** back to the frontend via **Server-Sent Events (SSE)**.
6. User receives:
   - Product details
   - Reason for recommendation

🔗 [System Architecture Diagram (StateGraph)](https://app.eraser.io/workspace/TzXImgFeY8dyHS4kOjnJ?origin=share)

---

## REST APIs

### Health Check

- **GET** `/health`  
  Checks if the backend is running.

---

### Products

- **GET** `/products`  
  Retrieves all products.

- **GET** `/products/:id`  
  Retrieves product details by ID.

- **GET** `/products/categories`  
  Retrieves available product categories.

---

### Messages

- **GET** `/messages`  
  Fetches system/user messages.

- **POST** `/messages/clear`  
  Clears all messages.

---

### Ingestion

- **GET** `/ingest/:id`  
  Fetches product data by ID.
  > ⚠️ Note: Actual ingestion into the database is handled by scripts.

---

### Advice (AI Interaction)

- **POST** `/advice`  
  Initiates **AI-driven product recommendation**.
  - Request: REST
  - Response: **Server-Sent Events (SSE)** stream
    - Streams tokens, progress, and final recommendation.

---

## Streaming

- Uses **Server-Sent Events (SSE)** to stream backend responses to the frontend in real-time.
- Currently used for the **`/advice`** endpoint.

---
