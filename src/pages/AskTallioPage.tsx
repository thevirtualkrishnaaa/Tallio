import React, { useMemo, useRef, useState, useEffect } from 'react';
import { orderBy } from 'firebase/firestore';
import { Send, Bot, User as UserIcon, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrgCollection } from '../lib/useOrgCollection';
import { askTallio, buildBusinessContext, isAiConfigured } from '../lib/askTallio';
import type { ChatTurn } from '../lib/askTallio';
import type { Bill, Product, Customer } from '../types';

const SUGGESTIONS = [
  'What was my best-selling product?',
  'Which products should I restock?',
  'How is my revenue trending?',
  'Who are my top customers?',
];

const AskTallioPage: React.FC = () => {
  const { org } = useAuth();
  const { data: bills } = useOrgCollection<Bill>('bills', [orderBy('createdAt', 'desc')]);
  const { data: products } = useOrgCollection<Product>('products');
  const { data: customers } = useOrgCollection<Customer>('customers');

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const context = useMemo(
    () => (org ? buildBusinessContext(org, bills, products, customers) : ''),
    [org, bills, products, customers]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  if (!org) return null;

  const configured = isAiConfigured();

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError('');
    setInput('');
    const history = turns;
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const answer = await askTallio(context, history, q);
      setTurns((t) => [...t, { role: 'model', text: answer }]);
    } catch (e: any) {
      setError(e.message || 'Something went wrong talking to the AI.');
      setTurns((t) => t.slice(0, -1)); // roll back the unanswered question
      setInput(q);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="text-purple-500" size={22} />
        <h2 className="text-2xl font-semibold text-gray-900">Ask Tallio</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Ask anything about your sales, stock, or customers — answered from your live data.
      </p>

      {!configured ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-5">
          <p className="font-medium mb-1">AI isn't configured yet</p>
          <p>
            Add a free Google Gemini API key to enable the chat. Create one at{' '}
            <span className="font-mono">aistudio.google.com/app/apikey</span>, then add it to a{' '}
            <span className="font-mono">.env.local</span> file as{' '}
            <span className="font-mono">VITE_GEMINI_API_KEY=your_key</span> and redeploy.
          </p>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto bg-white border rounded-xl p-4 space-y-4">
            {turns.length === 0 && (
              <div className="text-center py-8">
                <Bot className="text-gray-300 mx-auto mb-3" size={40} />
                <p className="text-sm text-gray-400 mb-4">Ask me about your business. Try one of these:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs border rounded-full px-3 py-1.5 text-gray-600 hover:bg-gray-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i} className={`flex gap-2.5 ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {t.role === 'model' && (
                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                    <Bot size={15} className="text-purple-600" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                    t.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {t.text}
                </div>
                {t.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <UserIcon size={15} className="text-gray-600" />
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                  <Bot size={15} className="text-purple-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl px-3.5 py-2.5 text-sm text-gray-400">Thinking…</div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 mt-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about sales, stock, customers…"
              className="flex-1 border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="bg-gray-900 text-white px-4 rounded-lg hover:bg-gray-800 disabled:opacity-40 flex items-center gap-1.5 text-sm"
            >
              <Send size={15} /> Send
            </button>
          </form>
          <p className="text-[11px] text-gray-400 mt-2">
            Tallio AI can make mistakes — double-check important figures against your reports.
          </p>
        </>
      )}
    </div>
  );
};

export default AskTallioPage;
