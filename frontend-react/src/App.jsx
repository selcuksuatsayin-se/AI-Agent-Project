import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Send, Search, CreditCard, List, LogOut, User, Phone, LogIn, AlertCircle } from 'lucide-react';
import axios from 'axios';

const API_GATEWAY = "http://localhost:5000";

const App = () => {
  // States
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  
  // Refs
  const scrollRef = useRef();
  const welcomeSentRef = useRef(false);

  // 1. Check localStorage on load
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        loadUserMessages(userData.phoneNumber);
      } catch (e) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  // 2. Load user messages
  const loadUserMessages = (phoneNumber) => {
    const q = query(
      collection(db, "messages"), 
      orderBy("createdAt", "asc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userMessages = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(msg => msg.userPhone === phoneNumber);
      
      setMessages(userMessages);
      
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });
    
    return unsubscribe;
  };

  // 3. Welcome Message Logic
  useEffect(() => {
    if (user && messages.length === 0 && !welcomeSentRef.current) {
      welcomeSentRef.current = true;

      setTimeout(async () => {
        const welcomeText = `👋 Welcome ${user.phoneNumber}!\nI'm your billing assistant.\n\n📋 Available commands:\n• "Check my bill"\n• "Show detailed bill"\n• "Make payment"`;

        await addDoc(collection(db, "messages"), {
          text: welcomeText,
          sender: "agent",
          userPhone: user.phoneNumber,
          createdAt: serverTimestamp()
        });
      }, 1000);
    }
  }, [user, messages.length]);

  // 4. Login Handler
  const handleLogin = async () => {
    const phone = phoneInput.trim();
    
    if (!phone) {
      setLoginError("Please enter phone number");
      return;
    }

    setIsLoading(true);
    setLoginError("");

    try {
      const response = await axios.post(`${API_GATEWAY}/api/login`, {
        phoneNumber: phone
      });

      if (response.data.success) {
        const userData = {
          phoneNumber: phone,
          token: response.data.token,
          loggedInAt: new Date().toISOString()
        };
        
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        welcomeSentRef.current = false;
        loadUserMessages(phone);
        setPhoneInput("");
      } else {
        setLoginError(response.data.error || "Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      setLoginError("Login failed. Please check your connection or phone number.");
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Logout Handler
  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setMessages([]);
    setInput("");
    setPhoneInput("");
    welcomeSentRef.current = false;
  };

  // 6. Send Message
  const sendMessage = async (text) => {
    if (!text.trim() || !user) return;
    
    await addDoc(collection(db, "messages"), {
      text: text,
      sender: "user",
      userPhone: user.phoneNumber,
      createdAt: serverTimestamp(),
      isProcessed: false
    });
    
    setInput("");
  };

  // 7. Quick Actions
  const quickActions = [
    { text: "Check my bill", icon: <Search size={16} /> },
    { text: "Show detailed bill", icon: <List size={16} /> },
    { text: "Make payment", icon: <CreditCard size={16} /> }
  ];

  // 8. Login Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-10 h-10 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">AI Billing Assistant</h1>
            <p className="text-gray-600 mt-2">Enter your phone number to login</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <Phone className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    setLoginError("");
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder=""
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  disabled={isLoading}
                />
              </div>
              {}
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Logging in...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Login
                </>
              )}
            </button>
            {/* Footer informational text removed */}
          </div>
        </div>
      </div>
    );
  }

  // 9. Main Chat Screen
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <div className="text-blue-600 font-semibold">AI</div>
            </div>
            <div>
              <h1 className="font-bold text-gray-800">Billing Assistant</h1>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-600 flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  Online
                </span>
                <span className="text-gray-500">| Phone: {user.phoneNumber}</span>
              </div>
            </div>
          </div>
          
          <button onClick={handleLogout} className="flex items-center gap-2 text-gray-600 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition">
            <LogOut size={18} />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-4 py-3 rounded-2xl ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 border rounded-bl-none shadow-sm'}`}>
                <div className="whitespace-pre-line text-sm md:text-base">{msg.text}</div>
                <div className={`text-xs mt-2 ${msg.sender === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
                  {msg.createdAt?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </div>

      <div className="bg-white border-t px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2 overflow-x-auto pb-2 justify-center">
            {quickActions.map((action, idx) => (
              <button key={idx} onClick={() => sendMessage(action.text)} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-200">
                {action.icon} {action.text}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border-t p-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage(input)}
            placeholder="Type your message..."
            className="flex-1 bg-gray-50 border border-gray-300 rounded-full px-5 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base"
          />
          <button onClick={() => sendMessage(input)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-12 h-12 flex items-center justify-center transition disabled:opacity-50" disabled={!input.trim()}>
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;