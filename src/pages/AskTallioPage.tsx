import React, { useMemo, useRef, useState, useEffect } from 'react';
import { orderBy } from 'firebase/firestore';
import { Send, Bot, User as UserIcon, Sparkles, Key, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrgCollection } from '../lib/useOrgCollection';
import {
  askTallio,
  buildBusinessContext,
  isAiConfigured,
  getGeminiApiKey,
  setGeminiApiKey,
} from '../lib/askTallio';
import type { ChatTurn } from '../lib/askTallio';
import type { Bill, Product, Customer, Expense } from '../types';
import { errorMessage } from '../lib/errors';

const SUGGESTIONS = [
  'What is my net profit and biggest expense area?',
  'What was my best-selling product this month?',
  'Which products should I restock soon?',
  'How is my revenue and margin trending?',
];

const AskTallioPage: React.FC = () => {
  const { org } = useAuth();
  const { data: bills } = useOrgCollection<Bill>('bills', [orderBy('createdAt', 'desc')]);
  const { data: products } = useOrgCollection<Product>('products');
  const { data: customers } = useOrgCollection<Customer>('customers');
  const { data: expenses } = useOrgCollection<Expense>('expenses');

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [configured, setConfigured] = useState(() => isAiConfigured());
  const scrollRef = useRef<HTMLDivElement>(null);

  const context = useMemo(
    () => (org ? buildBusinessContext(org, bills, products, customers, expenses) : ''),
    [org, bills, products, customers, expenses]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  const saveKey = () => {
    setGeminiApiKey(keyInput);
    setConfigured(isAiConfigured());
    setShowKeyModal(false);
    setKeyInput('');
  };

  if (!org) return null;

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
    } catch (e) {
      setError(errorMessage(e, 'Something went wrong talking to the AI.'));
      setTurns((t) => t.slice(0, -1)); // roll back the unanswered question
      setInput(q);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="text-purple-500" size={22} />
          <h2 className="text-2xl font-semibold text-gray-900">Ask Tallio</h2>
        </div>
        <button
          onClick={() => {
            setKeyInput(getGeminiApiKey() || '');
            setShowKeyModal(true);
          }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          title="Configure Google Gemini API Key"
        >
          <Key size={14} className={configured ? 'text-green-600' : 'text-amber-500'} />
          <span>{configured ? 'Gemini Key Configured' : 'Set Gemini Key'}</span>
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Ask anything about your sales, stock, expenses, or customers — answered with live Google Gemini AI.
      </p>

      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <Key className="text-purple-600" size={16} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Google Gemini API Key</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Tallio uses Google Gemini Flash for AI analytics and answering business questions from your live data.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">API Key</label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="bg-purple-50 rounded-xl p-3 text-xs text-purple-800 space-y-1">
                <p className="font-medium">Get a free key in 30 seconds:</p>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-purple-700 hover:text-purple-900 underline font-medium"
                >
                  Open Google AI Studio <ExternalLink size={12} />
                </a>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t">
              {configured && (
                <button
                  type="button"
                  onClick={() => {
                    setGeminiApiKey('');
                    setConfigured(false);
                    setShowKeyModal(false);
                  }}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Clear Key
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="text-xs px-3 py-2 rounded-lg border text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveKey}
                  disabled={!keyInput.trim()}
                  className="text-xs px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 font-medium"
                >
                  Save Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!configured ? (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 text-purple-900 rounded-2xl p-6 my-auto max-w-lg mx-auto text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center mx-auto mb-3 shadow-md shadow-purple-500/20">
            <Sparkles size={24} />
          </div>
          <h3 className="text-lg font-semibold mb-1">Enable Ask Tallio AI</h3>
          <p className="text-xs text-purple-700/80 mb-5">
            Add a free Google Gemini API key to chat with your business data, discover trends, and get smart recommendations.
          </p>

          <button
            onClick={() => {
              setKeyInput(getGeminiApiKey() || '');
              setShowKeyModal(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 font-medium text-sm transition-all shadow-md shadow-purple-600/20"
          >
            <Key size={16} /> Enter Gemini API Key
          </button>
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
              placeholder="Ask about sales, stock, expenses, margins…"
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
            Tallio AI is powered by Google Gemini — double-check important figures against your reports.
          </p>
        </>
      )}
    </div>
  );
};

export default AskTallioPage;
