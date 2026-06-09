# Tallio — Small Business Finance, Simplified

> A modern Point-of-Sale & business finance platform built for small businesses. Manage sales, inventory, customers, and finances — all in one place.

🌐 **Live App:** [https://talliofinance.web.app](https://talliofinance.web.app)

---

## ✨ Features (v1 — Live)

| Module | Description |
|---|---|
| 🔐 **Authentication** | Secure login / sign-up via Firebase Auth |
| 🏢 **Onboarding** | Business setup wizard — name, type, currency |
| 🛒 **Point of Sale** | Fast billing with cart, quantities & totals |
| 📦 **Products** | Add, edit, delete inventory items with pricing |
| 📜 **Sales History** | Full transaction log with date & amount |
| 👥 **Customers** | Customer directory with contact info |
| 📊 **Dashboard** | Revenue overview with charts |
| ⚙️ **Settings** | Business profile & preferences |

---

## 🛠️ Tech Stack

- **Frontend** — React 19 + TypeScript + Vite
- **Styling** — Tailwind CSS v4
- **Database** — Firebase Firestore (real-time, multi-tenant)
- **Auth** — Firebase Authentication
- **Hosting** — Firebase Hosting
- **Charts** — Recharts
- **Icons** — Lucide React

---

## 🗺️ Roadmap

### ✅ Phase 1 — Core App (Done)
- [x] Auth (login / signup)
- [x] Business onboarding
- [x] POS — billing & cart
- [x] Products management
- [x] Sales history
- [x] Customer directory
- [x] Dashboard with charts
- [x] Deployed to Firebase Hosting
- [x] Source on GitHub

---

### 🔜 Phase 2 — Access Control & Subscriptions
- [x] **Guest / Demo Mode** — 1-day trial, no sign-up required, sample data
- [ ] **Subscription tiers** via Stripe:

| Plan | Price | Limits |
|---|---|---|
| 🆓 **Starter** | £10/mo | 50 products, 100 sales/mo, 1 user |
| 🚀 **Growth** | £49/mo | 500 products, unlimited sales, 3 users |
| 🏢 **Scale** | £149/mo | Unlimited everything, 10 users, priority support |

- [ ] Plan gates enforced in Firestore rules + UI
- [ ] Upgrade / downgrade flow
- [ ] Billing history page

---

### 🤖 Phase 3 — AI Layer
- [ ] **AI Sales Insights** — natural language summary of weekly/monthly performance
- [ ] **Smart Restock Alerts** — AI predicts when stock will run out
- [ ] **Receipt Scan (OCR)** — scan paper receipts to auto-log expenses
- [ ] **Ask Tallio** — chat interface: *"What was my best selling product last month?"*
- [ ] **AI-generated reports** — exportable PDF summaries

---

### 🔧 Phase 4 — Power Features
- [ ] Multi-user / staff roles (owner, cashier, viewer)
- [ ] GST / tax calculation & invoice generation
- [ ] WhatsApp / SMS receipt sharing
- [ ] Expense tracking (not just sales)
- [ ] Mobile PWA (installable on phone)
- [ ] Export data to Excel / CSV

---

## 🚀 Local Development

```bash
# Clone the repo
git clone https://github.com/thevirtualkrishnaaa/Tallio.git
cd Tallio

# Install dependencies
npm install

# Start dev server
npm run dev
```

App runs at `http://localhost:5173`

---

## 🔥 Deploy

```bash
# Build
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

---

## 📁 Project Structure

```
src/
├── contexts/       # AuthContext (Firebase Auth + Firestore org)
├── lib/            # Firebase config, org data helpers
├── pages/          # AuthPage, DashboardShell, POSPage, etc.
├── components/     # Shared UI components (Modal, etc.)
├── types/          # TypeScript type definitions
└── App.tsx         # Root — auth / onboarding / dashboard routing
```

---

## 📄 License

MIT © [thevirtualkrishnaaa](https://github.com/thevirtualkrishnaaa)
