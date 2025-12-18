const admin = require('firebase-admin');
const axios = require('axios');
const express = require('express');
const cors = require('cors');
const https = require('https');
require('dotenv').config();

// Disable SSL verification for localhost
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Admin Setup
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// API URLs
const DOTNET_API_URL = "https://localhost:7014/api/v1";
const OLLAMA_API_URL = "http://localhost:11434/api/generate";

// Axios Instance
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ 
    rejectUnauthorized: false,
    keepAlive: true 
  }),
  timeout: 15000
});

// Token Cache
const tokenCache = new Map();

// ==================== API ENDPOINTS ====================

// 1. LOGIN ENDPOINT
app.post('/api/login', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number is required' 
      });
    }

    console.log(`🔑 Login attempt: ${phoneNumber}`);
    
    const response = await axiosInstance.post(`${DOTNET_API_URL}/Auth/login`, {
      phoneNumber: phoneNumber.trim()
    });

    if (response.data.token) {
      tokenCache.set(phoneNumber, response.data.token);
      console.log(`✅ Login successful: ${phoneNumber}`);
      
      res.json({ 
        success: true, 
        token: response.data.token, 
        phoneNumber: phoneNumber 
      });
    } else {
      res.status(401).json({ 
        success: false, 
        error: 'Invalid phone number' 
      });
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    
    if (error.response?.status === 401) {
      res.status(401).json({ 
        success: false, 
        error: 'Invalid phone number or not registered' 
      });
    } else if (error.code === 'ECONNREFUSED') {
      res.status(503).json({ 
        success: false, 
        error: 'Cannot connect to billing server' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Server error. Please try again.' 
      });
    }
  }
});

// 2. HEALTH CHECK ENDPOINT
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Billing Gateway',
    timestamp: new Date().toISOString()
  });
});

// ==================== HELPER FUNCTIONS ====================

// Get Auth Token
async function getAuthToken(phoneNumber) {
  if (tokenCache.has(phoneNumber)) {
    return tokenCache.get(phoneNumber);
  }
  
  try {
    const response = await axiosInstance.post(`${DOTNET_API_URL}/Auth/login`, {
      phoneNumber: phoneNumber
    });
    
    const token = response.data.token;
    tokenCache.set(phoneNumber, token);
    console.log(`✅ New token acquired for: ${phoneNumber}`);
    return token;
  } catch (error) {
    console.error(`❌ Cannot get token for ${phoneNumber}:`, error.message);
    return null;
  }
}

// Parse Month to YYYY-MM format
function parseMonth(input) {
  if (!input) return "2025-01";
  
  const monthMap = {
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12',
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
    '01': '01', '02': '02', '03': '03', '04': '04', '05': '05', '06': '06',
    '07': '07', '08': '08', '09': '09', '10': '10', '11': '11', '12': '12'
  };
  
  const currentYear = new Date().getFullYear();
  const inputStr = input.toLowerCase().trim();
  
  // Check for YYYY-MM format
  if (inputStr.match(/^\d{4}-\d{2}$/)) {
    return inputStr;
  }
  
  // Check for month name
  for (const [monthName, monthNum] of Object.entries(monthMap)) {
    if (inputStr.includes(monthName)) {
      // Extract year if mentioned
      const yearMatch = inputStr.match(/\b(20\d{2})\b/);
      const year = yearMatch ? yearMatch[1] : currentYear;
      return `${year}-${monthNum}`;
    }
  }
  
  // Check for MM/YYYY or MM-YYYY
  const dateMatch = inputStr.match(/(\d{1,2})[\/\-](\d{4})/);
  if (dateMatch) {
    const month = dateMatch[1].padStart(2, '0');
    const year = dateMatch[2];
    return `${year}-${month}`;
  }
  
  // Default to 2025-01
  return "2025-01";
}

// ==================== LLM INTENT PARSING ====================

async function parseIntentWithOllama(userText, currentUserPhone) {
  try {
    const prompt = `
      You are a billing assistant. Extract information from user message.
      
      CURRENT USER PHONE: ${currentUserPhone}
      
      EXTRACTION RULES:
      
      1. INTENT DETECTION:
         - "query", "check", "show", "bill", "invoice", "what is my bill" → QUERY_BILL
         - "detail", "detailed", "breakdown", "items", "list all bills" → QUERY_BILL_DETAILED
         - "pay", "payment", "make payment", "settle bill" → PAY_BILL
      
      2. PHONE NUMBER:
         - If specified, use exactly as provided
         - If not specified, use: ${currentUserPhone}
      
      3. MONTH/YEAR:
         - Extract month/year if mentioned
         - Format must be: "YYYY-MM"
         - Examples:
           * "October 2024" → "2024-10"
           * "2024-10" → "2024-10"
           * "Oct 2024" → "2024-10"
           * "10/2024" → "2024-10"
      
      4. PAYMENT AMOUNT:
         - Extract numbers from text
         - Examples: "100 TL" → 100, "pay 50" → 50, "150 lira" → 150
      
      5. DEFAULT VALUES:
         - month: "2025-01"
         - paymentAmount: 0
         - page: 1
         - pageSize: 10
      
      Return ONLY JSON, no other text:
      {
        "intent": "QUERY_BILL" | "QUERY_BILL_DETAILED" | "PAY_BILL",
        "phoneNumber": "${currentUserPhone}",
        "month": "2025-01",
        "paymentAmount": 0,
        "page": 1,
        "pageSize": 10
      }
      
      User message: "${userText}"
    `;

    const response = await axios.post(OLLAMA_API_URL, {
      model: "llama3.1",
      prompt: prompt,
      stream: false,
      format: "json",
      options: {
        temperature: 0.1,
        top_p: 0.9
      }
    });

    let parsed;
    try {
      parsed = JSON.parse(response.data.response);
      console.log("🤖 LLM Parsed Result:", JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.error('❌ JSON parse error from LLM:', e.message);
      parsed = {
        intent: "QUERY_BILL",
        phoneNumber: currentUserPhone,
        month: "2025-01",
        paymentAmount: 0,
        page: 1,
        pageSize: 10
      };
    }

    // Validate and fix parsed data
    if (!parsed.phoneNumber || parsed.phoneNumber === 'string') {
      parsed.phoneNumber = currentUserPhone;
    }
    
    // Parse month properly
    parsed.month = parseMonth(parsed.month);
    
    // Ensure paymentAmount is a number
    if (typeof parsed.paymentAmount === 'string') {
      parsed.paymentAmount = parseFloat(parsed.paymentAmount) || 0;
    }
    parsed.paymentAmount = Number(parsed.paymentAmount) || 0;
    
    // Ensure page and pageSize are numbers
    parsed.page = Number(parsed.page) || 1;
    parsed.pageSize = Number(parsed.pageSize) || 10;

    console.log("✅ Final parsed data:", parsed);
    return parsed;
    
  } catch (error) {
    console.error('❌ LLM connection error:', error.message);
    return {
      intent: "QUERY_BILL",
      phoneNumber: currentUserPhone,
      month: parseMonth(),
      paymentAmount: 0,
      page: 1,
      pageSize: 10
    };
  }
}

// ==================== API CALLER ====================

async function callMidtermAPI(data, userPhone) {
  const targetPhone = data.phoneNumber || userPhone;
  const token = await getAuthToken(targetPhone);
  
  if (!token) {
    return `❌ Authentication error. Please login again with phone: ${targetPhone}`;
  }

  const config = { 
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  };

  console.log(`📞 API Call - Intent: ${data.intent}, Phone: ${targetPhone}, Month: ${data.month}`);

  try {
    switch (data.intent.toUpperCase()) {
      case "QUERY_BILL": {
        try {
          console.log(`🔍 Querying bill for ${targetPhone} - ${data.month}`);
          
          const resBill = await axiosInstance.get(`${DOTNET_API_URL}/Subscriber/bills`, {
            ...config,
            params: { month: data.month }
          });
          
          console.log("💰 BILL API RESPONSE:", JSON.stringify(resBill.data, null, 2));
          
          let amount = 0;
          let isPaid = false;
          let billMonth = data.month;
          
          if (resBill.data.billTotal !== undefined && resBill.data.billTotal !== null) {
            amount = resBill.data.billTotal;
            console.log(`💰 Using billTotal: ${amount} TL`);
          } else if (resBill.data.amount !== undefined) {
             amount = resBill.data.amount;
          }
          
          if (resBill.data.bills && Array.isArray(resBill.data.bills) && resBill.data.bills.length > 0) {
            const bill = resBill.data.bills[0];
            if ((amount === 0) && bill.amount) amount = bill.amount;
            isPaid = bill.isPaid !== undefined ? bill.isPaid : (bill.IsPaid || false);
            if (bill.month) billMonth = bill.month;
          } else {
             isPaid = resBill.data.isPaid !== undefined ? resBill.data.isPaid : false;
          }
          
          const statusEmoji = isPaid ? "✅" : "❌";
          const statusText = isPaid ? "PAID" : "UNPAID";
          
          return `💰 **BILL STATEMENT**\n` +
                 `══════════════════════\n` +
                 `📱 Account: ${targetPhone}\n` +
                 `📅 Billing Period: ${billMonth}\n` +
                 `💵 Amount Due: ${amount} TL\n` +
                 `📊 Status: ${statusEmoji} ${statusText}\n` +
                 `══════════════════════`;
          
        } catch (queryError) {
          if (queryError.response?.status === 429) {
            return `🛑 **Rate Limit Reached**\nYou have exceeded the daily limit (3 queries) for checking bills.`;
          }
          throw queryError;
        }
      }

      case "QUERY_BILL_DETAILED": {
        try {
          console.log(`📋 Getting detailed bills for ${targetPhone}`);
          
          const resDetail = await axiosInstance.get(`${DOTNET_API_URL}/Subscriber/bills/detailed`, {
            ...config,
            params: { page: data.page, pageSize: data.pageSize }
          });
          
          let items = [];
          if (resDetail.data.bills && Array.isArray(resDetail.data.bills)) {
            items = resDetail.data.bills;
          } else if (resDetail.data.items) {
            items = resDetail.data.items;
          }
          
          if (items.length > 0) {
            let response = `📋 **DETAILED BILLS**\n`;
            
            items.forEach((item, index) => {
              const month = item.month || 'Unknown';
              const amount = item.amount || 0;
              const isPaid = item.isPaid ? '✅ Paid' : '❌ Unpaid';
              response += `${index + 1}. **${month}**: ${amount} TL (${isPaid})\n`;
            });
            
            return response + `\n💰 Total: ${resDetail.data.totalCount || items.length} bills.`;
          }
          
          return `📭 No detailed bills found.`;
          
        } catch (detailError) {
           return `❌ Cannot retrieve detailed bills: ${detailError.message}`;
        }
      }

      case "PAY_BILL": {
        try {
          console.log(`🔍 Checking bill for payment - ${targetPhone} - ${data.month}`);
          let debt = 0;
          let skipDebtCheck = false;

          try {
             const billCheck = await axiosInstance.get(`${DOTNET_API_URL}/Subscriber/bills`, {
                ...config,
                params: { month: data.month }
             });
             
             if (billCheck.data.billTotal !== undefined) debt = billCheck.data.billTotal;
             else if (billCheck.data.amount) debt = billCheck.data.amount;
             
             console.log(`💰 Current debt for ${data.month}: ${debt} TL`);
             
          } catch (preCheckError) {
             if (preCheckError.response?.status === 429) {
                console.warn("⚠️ Rate limit hit on pre-check. Proceeding with payment anyway.");
                skipDebtCheck = true;
             } else {
                throw preCheckError;
             }
          }
          
          if (!skipDebtCheck && debt === 0) {
             return `ℹ️ No bill found for ${data.month}. Amount: 0 TL`;
          }

          console.log(`💳 Making payment: ${data.paymentAmount} TL`);
          
          const paymentResponse = await axiosInstance.post(
            `${DOTNET_API_URL}/Payment/pay`, 
            {
              phoneNumber: targetPhone,
              month: data.month,
              paymentAmount: data.paymentAmount
            }, 
            config
          );

          console.log("✅ PAYMENT RESPONSE:", JSON.stringify(paymentResponse.data, null, 2));
          
          const pData = paymentResponse.data;
          const remaining = pData.remainingAmount !== undefined ? pData.remainingAmount : (debt - data.paymentAmount);
          const statusMsg = pData.transactionStatus || "Processing Complete";
          
          return `✅ **PAYMENT SUCCESSFUL**\n` +
                 `══════════════════════\n` +
                 `📱 Account: ${targetPhone}\n` +
                 `📅 Period: ${data.month}\n` +
                 `💵 Paid: ${data.paymentAmount} TL\n` +
                 `📉 Remaining Debt: ${remaining} TL\n` +
                 `📝 Status: ${statusMsg}\n` +
                 `══════════════════════`;
          
        } catch (paymentError) {
          console.error("❌ PAYMENT ERROR:", paymentError.response?.data || paymentError.message);
          
          if (paymentError.response?.status === 400) {
             return `❌ Payment Failed: ${JSON.stringify(paymentError.response.data)}`;
          }
          return `❌ Payment processing failed. Please try again.`;
        }
      }

      default:
        return `🤖 Command not recognized. Try "Check my bill" or "Pay bill".`;
    }
  } catch (error) {
    console.error('❌ API ERROR:', error.message);
    
    if (error.response?.status === 429) {
       return `🛑 **System Rate Limit Reached**\nPlease try again later.`;
    }
    
    return `❌ System Error: ${error.message}`;
  }
}

// ==================== FIREBASE MESSAGE HANDLER ====================

function setupFirestoreListener() {
  console.log("🔥 Setting up Firebase Firestore listener...");
  
  db.collection('messages').onSnapshot(
    (snapshot) => {
      console.log(`📡 Firebase update: ${snapshot.docChanges().length} changes`);
      
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const msg = change.doc.data();
          const msgRef = db.collection('messages').doc(change.doc.id);

          // Process only unprocessed user messages
          if (msg.sender === 'user' && !msg.isProcessed && msg.userPhone) {
            try {
              console.log(`\n📨 Processing message from ${msg.userPhone}: "${msg.text}"`);
              
              // Parse intent with LLM
              const extracted = await parseIntentWithOllama(msg.text, msg.userPhone);
              
              // Call API
              const response = await callMidtermAPI(extracted, msg.userPhone);
              
              // Save response
              await db.collection('messages').add({
                text: response,
                sender: 'agent',
                userPhone: msg.userPhone,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                processedAt: new Date().toISOString()
              });
              
              console.log(`✅ Response sent to ${msg.userPhone}`);
              
              // Mark as processed
              await msgRef.update({ 
                isProcessed: true,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              
            } catch (error) {
              console.error('❌ Message processing error:', error);
              
              await db.collection('messages').add({
                text: `❌ **PROCESSING ERROR**\nError: ${error.message || 'Processing failed'}`,
                sender: 'agent',
                userPhone: msg.userPhone,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });
              
              await msgRef.update({ 
                isProcessed: true,
                error: error.message 
              });
            }
          }
        }
      });
    },
    (error) => {
      console.error('❌ Firebase listener error:', error);
    }
  );
}

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;

async function testDatabaseConnection() {
  try {
    await db.collection('test').doc('test').get();
    console.log('✅ Firebase connection successful');
  } catch (error) {
    console.error('❌ Firebase connection failed:', error.message);
  }
}

app.listen(PORT, async () => {
  console.log(`\n🚀 Billing Gateway Server running on port ${PORT}`);
  console.log(`🔌 Connected to .NET API: ${DOTNET_API_URL}`);
  
  await testDatabaseConnection();
  setupFirestoreListener();
  
  console.log(`\n✅ Server is ready...`);
});