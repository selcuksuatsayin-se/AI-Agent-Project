# AI Agent Billing Assistant

This project is a real-time **AI Agent chat application** designed to manage billing actions (**Query**, **Detailed View**, and **Payment**) using a modern, distributed architecture. It integrates a **React frontend**, a **Node.js API Gateway**, a **local LLM (Ollama)**, and a **.NET Web API backend**.

---

## 🚀 Presentation Video

Watch the project demo here:
👉 **[LINK_TO_YOUR_VIDEO_HERE]**

---

## 🏗 System Architecture

The project follows the **API Gateway Pattern** to centralize requests and manage AI-driven intent parsing.

- **Frontend (React)**
  A real-time chat interface where users interact with the AI billing agent.

- **Real-Time Messaging (Firestore)**
  All messages are stored and synchronized in real-time between the client and the gateway.

- **API Gateway (Node.js)**
  Listens to Firestore events, sends user prompts to the LLM, and routes requests to the appropriate .NET APIs.

- **AI Engine (Ollama – Llama 3.1)**
  Parses natural language input to extract intents (e.g., `QUERY_BILL`, `PAY_BILL`) and parameters (month, amount) in structured JSON format.

- **Backend (.NET Web API)**
  Provides billing data, enforces business rules, and processes payment operations.

---

## 🛠 Features & APIs Implemented

- **Query Bill**
  Retrieves current debt and payment status for a specific month.
  _Includes Rate Limiting: maximum 3 queries per day._

- **Detailed Bill**
  Lists complete billing history with paging support.

- **Pay Bill**
  Supports full or partial payments and calculates remaining debt in real time.

- **Dynamic Authentication**
  Users authenticate using their phone number and receive a JWT token for authorized API access.

---

## 📋 Design Decisions & Assumptions

- **Intent Parsing**
  The system assumes the LLM always returns a strictly structured JSON response that the API Gateway can reliably parse.

- **Authentication**
  For assignment simplicity, authentication is dynamic at login, but authorization remains consistent once a JWT token is issued.

- **Slot Filling**
  The AI Agent detects missing parameters (such as billing month or payment amount) and prompts the user before executing the related API call.

---

## ⚠️ Issues Encountered

During development, several technical challenges were identified and resolved:

- **SSL / Self-Signed Certificates**
  Node.js initially rejected requests to the local .NET API due to self-signed HTTPS certificates. This was resolved by configuring a custom `https.Agent`.

- **Firestore Indexing**
  Composite indexes were required to filter messages by `userPhone` while ordering by `createdAt`.

- **LLM Output Consistency**
  Early prompts produced conversational text instead of pure JSON. The prompt was refined with strict output rules to ensure API compatibility.

- **Rate Limit Propagation**
  Handling `429 (Too Many Requests)` responses from .NET middleware and translating them into user-friendly chat messages.

---

## ⚙️ How to Run

### 1. Requirements

- Node.js & npm
- Ollama (Llama 3.1 model)
- .NET SDK
- Firebase Project (Firestore enabled)

---

### 2. Setup

#### Backend (API Gateway)

```bash
cd backend
npm install
# Add your serviceAccountKey.json and .env file
node server.js
```

#### Frontend

```bash
cd frontend
npm install
# Update firebase.js with your Firebase configuration
npm run dev
```

---

## 🔗 Links

- **GitHub Repository**:
  [https://github.com/selcuksuatsayin-se/AI-Agent-Project](https://github.com/selcuksuatsayin-se/AI-Agent-Project)
