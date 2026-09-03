// Claude-written analyst briefing for the Insights page.
//
// The cards on Insights come from local math (insights.ts) and refresh for free
// on every render. This layer is the opposite trade: one deliberate call to the
// askTallio Cloud Function that asks Claude to read the whole business snapshot
// and write the commentary a human analyst would. Because each briefing costs a
// model call, it is generated on demand and cached per org until the underlying
// data actually moves.

import { askTallio, buildBusinessContext } from './askTallio';
import { toMs } from './insights';
import type { Bill, Product, Customer, Organization } from '../types';

export interface AiFinding {
  tone: 'positive' | 'warning' | 'neutral';
  title: string;
  detail: string;
}

export interface AiBriefing {
  summary: string;
  findings: AiFinding[];
  actions: string[];
  raw: string;          // kept so a briefing that fails to parse is still shown
  generatedAt: number;  // epoch ms
  fingerprint: string;  // the data this briefing was written from
}

// The prompt duplicates the shape asked for by the function's system prompt so
// the briefing still comes back usable if the client is newer than the deployed
// function (older builds ignore `mode` and only see the question).
const BRIEFING_PROMPT =
  'Write my analyst briefing for this business now.\n\n' +
  'Reply in plain text using these exact section labels on their own lines: ' +
  '"SUMMARY:", then "FINDINGS:", then "ACTIONS:". Under FINDINGS give three to five ' +
  'lines in the form "- [positive] Short title :: detail with the numbers behind it", ' +
  'where the tag is exactly positive, warning or neutral. Under ACTIONS give two to ' +
  'four lines starting with "- ". Ground every claim in a real number from my data.';

// Cheap signature of the inputs a briefing was written from. When this changes,
// the cached briefing is stale and the page offers a refresh.
export function dataFingerprint(bills: Bill[], products: Product[], customers: Customer[]): string {
  const revenue = bills.reduce((s, b) => s + (b.total || 0), 0);
  const stock = products.reduce((s, p) => s + (Number(p.stock) || 0), 0);
  const latest = bills.reduce((m, b) => Math.max(m, toMs(b.createdAt) ?? 0), 0);
  return [
    bills.length,
    revenue.toFixed(2),
    products.length,
    stock,
    customers.length,
    latest,
  ].join('|');
}

// ── Parsing ────────────────────────────────────────────────────────────────
// Claude is asked for a fixed shape, but a briefing is worth showing even when
// it drifts: anything unparseable falls back to the raw text as the summary.

const SECTION = /^\s*(SUMMARY|FINDINGS|ACTIONS)\s*:\s*(.*)$/i;
const FINDING = /^[-•*]\s*\[?\s*(positive|warning|neutral)\s*\]?\s*(.+)$/i;

function parseBriefing(raw: string): Omit<AiBriefing, 'generatedAt' | 'fingerprint'> {
  const buckets: Record<string, string[]> = { summary: [], findings: [], actions: [] };
  let current: string | null = null;

  for (const line of raw.split('\n')) {
    const header = line.match(SECTION);
    if (header) {
      current = header[1].toLowerCase();
      if (header[2].trim()) buckets[current].push(header[2].trim());
      continue;
    }
    if (current) buckets[current].push(line);
  }

  const summary = buckets.summary.join('\n').replace(/\n{2,}/g, '\n\n').trim();

  const findings: AiFinding[] = [];
  for (const line of buckets.findings) {
    const m = line.trim().match(FINDING);
    if (!m) continue;
    const [title, ...rest] = m[2].split('::');
    findings.push({
      tone: m[1].toLowerCase() as AiFinding['tone'],
      title: title.trim().replace(/[:\-\s]+$/, ''),
      detail: rest.join('::').trim(),
    });
  }

  const actions = buckets.actions
    .map((l) => l.trim().replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);

  // Nothing recognisable — show what Claude actually wrote rather than nothing.
  if (!summary && findings.length === 0 && actions.length === 0) {
    return { summary: raw.trim(), findings: [], actions: [], raw };
  }
  return { summary, findings, actions, raw };
}

// ── Generation ─────────────────────────────────────────────────────────────

export async function generateBriefing(
  org: Organization,
  bills: Bill[],
  products: Product[],
  customers: Customer[]
): Promise<AiBriefing> {
  const context = buildBusinessContext(org, bills, products, customers);
  const raw = await askTallio(context, [], BRIEFING_PROMPT, 'insights');
  if (!raw.trim()) throw new Error('Tallio AI returned an empty briefing — please try again.');
  return {
    ...parseBriefing(raw),
    generatedAt: Date.now(),
    fingerprint: dataFingerprint(bills, products, customers),
  };
}

// ── Cache ──────────────────────────────────────────────────────────────────
// Per-browser only: a briefing is commentary, not business data, so it never
// goes to Firestore (which would also mean a rules change).

const cacheKey = (orgId: string) => `tallio:briefing:${orgId}`;

export function loadBriefing(orgId: string): AiBriefing | null {
  try {
    const raw = localStorage.getItem(cacheKey(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiBriefing;
    return typeof parsed?.generatedAt === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBriefing(orgId: string, briefing: AiBriefing): void {
  try {
    localStorage.setItem(cacheKey(orgId), JSON.stringify(briefing));
  } catch {
    // Storage full or blocked (private mode) — the briefing still shows this session.
  }
}

export function timeAgo(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
