import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { useAuth } from '../app/context/AuthContext';
import { apiUrl } from '../lib/api';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export default function AvailabilityManagerPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Hello! I'm your AI Availability Assistant. I can help you manage your schedule, find free time slots, and optimize your calendar. How can I assist you today?",
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userText = inputText.trim();
    setInputText('');

    // Add user message
    const userMessage: Message = {
      id: messages.length + 1,
      text: userText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Pass the previous messages to maintain conversation history
      const history = messages.map(m => ({
        sender: m.sender,
        text: m.text
      }));

      const currentDate = new Date().toLocaleString();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const response = await fetch(apiUrl('/assistant/availability/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user?.email || '',
        },
        body: JSON.stringify({
          message: userText,
          history: history,
          email: user?.email || '',
          currentDate: currentDate,
          timeZone: timeZone,
        }),
      });

      const data = await response.json();

      const aiResponse: Message = {
        id: messages.length + 2,
        text: data.reply,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error('Error fetching AI response:', error);
      const errorResponse: Message = {
        id: messages.length + 2,
        text: "I'm sorry, I couldn't connect to the server. Please check your connection and try again.",
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-3xl p-8 text-white shadow-xl">
        <h1 className="text-4xl font-bold mb-2">AI Availability Assistant</h1>
        <p className="text-lg text-white/90">Chat with AI to manage your schedule and availability</p>
      </div>

      {/* Chat Container */}
      <div className="bg-card backdrop-blur-sm rounded-2xl shadow-xl border border-border overflow-hidden">
        {/* Chat Messages */}
        <div className="h-[600px] overflow-y-auto p-6 space-y-4 scroll-smooth">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                message.sender === 'ai'
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500'
                  : 'bg-gradient-to-br from-pink-400 to-purple-400'
              }`}>
                {message.sender === 'ai' ? (
                  <Bot className="w-5 h-5 text-white" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[70%] rounded-2xl p-4 ${
                  message.sender === 'ai'
                    ? 'bg-background border border-border'
                    : 'bg-gradient-to-br from-primary to-primary/80 text-white'
                }`}
              >
                <div className={`whitespace-pre-line ${
                  message.sender === 'ai' ? 'text-foreground' : 'text-white'
                }`}>
                  {message.text}
                </div>
                <p className={`text-xs mt-2 ${
                  message.sender === 'ai' ? 'text-muted-foreground' : 'text-white/70'
                }`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 flex-row">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-500">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="max-w-[70%] rounded-2xl p-4 bg-background border border-border flex items-center">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                <span className="ml-2 text-foreground text-sm">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-border p-4 bg-background">
          <form onSubmit={handleSendMessage} className="flex gap-3">
            <Input
              type="text"
              placeholder="Ask me about your availability, schedule meetings, or get time management tips..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 h-12 bg-card border-border text-foreground rounded-xl focus:ring-primary"
              disabled={isLoading}
            />
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-white hover:shadow-lg hover:shadow-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              disabled={!inputText.trim() || isLoading}
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          'When am I free this week?',
          'Schedule study time for finals',
          'Show my busiest days',
        ].map((suggestion, index) => (
          <button
            key={index}
            onClick={() => {
              if (!isLoading) {
                setInputText(suggestion);
                // Cannot call handleSendMessage directly here because state update is async, 
                // but we can let the user submit it or we can submit it right away using the string.
                // To submit it right away, we could modify handleSendMessage to take a string arg, 
                // or just let it be populated in the input box.
              }
            }}
            className="p-4 bg-card backdrop-blur-sm rounded-xl shadow-md hover:shadow-lg hover:shadow-primary/10 transition-all border border-border text-left text-sm text-foreground hover:bg-background"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}