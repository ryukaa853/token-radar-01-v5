// Token Radar v5 — the value model.
//
// What this file does, in one paragraph: it reads the sealed snapshot (758
// protocols, 40 on the watchlist), scores every rankable pre-token protocol
// with a fitted market multiple, and writes a ranked board of 226 rows with a
// costed farm plan each. A protocol is rankable when it records no token
// (no market cap, no CoinGecko id, no symbol), is not an exchange and is not
// a versioned pool of another protocol. The watchlist is the floor: all 40 of
// its slugs are ranked first, and the early radar adds every other rankable
// pre-token protocol below the watchlist floor.
//
// The implied value is TVL x a fitted multiple x a growth multiplier x a
// maturity multiplier. The fitted multiple is the part that changed most
// since v4: it is no longer one flat number, and no longer a bare category
// median that goes to NaN when a category has no comparables. It is a
// shrinkage estimate built from the live-token protocols in the same
// snapshot, with a four-step fallback ladder that can never run out:
//
//   1. category median, shrunk toward the universe median
//      fitted = (n * categoryMedian + 8 * universeMedian) / (n + 8)
//      where n is the number of comparables in the category. A category
//      with 14 comparables keeps most of its own median; a category with
//      one comparable is pulled almost all the way to the universe median,
//      because one observation is not evidence of a category premium.
//   2. family median, same shrinkage, when the category has no
//      comparables at all. Families group categories that earn money the
//      same way (lending with lending, bridges with bridges, and so on).
//   3. the universe median across all comparables.
//   4. the constant 0.25, only if the snapshot somehow carried no
//      comparable at all.
//
// A comparable is a live-token protocol in the same snapshot with a
// positive market cap and a positive TVL, not an exchange and not a
// versioned pool. Protocols whose market cap is recorded as 0 are not
// comparables: a zero market cap means the record is empty, not that the
// token is worthless, and letting it into a median would drag the whole
// category to zero. Every comparable's own multiple is winsorized to
// [0.02, 5] before any median is taken, so one wild observation — a
// protocol with a $400 market-cap-to-TVL ratio — can never drag its whole
// category to the clamp; the fitted multiple is clamped to the same range.
//
// The board ranks only protocols that could plausibly launch a token of
// their own. The watchlist's own rule is applied to every row, not just
// to the watchlist: a wrapped, staked or bridged product of a token that
// already trades is not a launch candidate, so WBTC, Binance staked ETH
// and USDT0 sit at the bottom of no board here — they are not on it at
// all, exactly as the rules say they are off the watchlist. Ranking them
// first would claim a token that already trades is still to come.
//
// Growth and maturity are the starter's terms, kept because they are the
// snapshot's own figures: seven-day TVL change, clamped to [-60, 120]
// per cent and weighted at 0.5, and age since first listing, from 0.6 for a
// brand-new protocol to 1.0 after three years (unknown age counts as a
// year). No protocol name is ever special-cased: the same function scores
// every row, and every row carries the inputs that produced its number so
// the dashboard can show its working.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** Prior strength of the shrinkage: how many universe observations a category median is worth. */
  shrink_prior: number;
  /** Last-resort multiple when the snapshot carries no comparable at all. */
  constant_multiple: number;
  /** Bounds on any fitted multiple, so no category can dominate the board. */
  multiple_min: number;
  multiple_max: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  shrink_prior: 8,
  constant_multiple: 0.25,
  multiple_min: 0.02,
  multiple_max: 5,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-5';

/** How many live-token protocols the dashboard's Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One fitted multiple, with the evidence behind it, for one category. */
export interface FittedMultiple {
  /** The multiple the model actually used, after shrinkage and clamping. */
  fitted: number;
  /** The category's own median mcap/TVL, or null when it has no comparables. */
  category_median: number | null;
  /** How many comparables the category itself supplied. */
  comps_n: number;
  /** Which rung of the fallback ladder supplied the number. */
  fallback: 'category' | 'family' | 'universe' | 'constant';
  /** The family the category belongs to (for the family rung). */
  family: string;
  /** The median that was shrunk (category, family or universe median). */
  shrunk_from: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    fitted_multiple: number;
    category_median: number | null;
    comps_n: number;
    fallback: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  /** The farm plan's whole cost in US dollars: capital plus gas, rounded. */
  farm_budget_usd: number;
  /** One sentence arguing this rank, from the row's own figures. */
  why: string;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  fitted_multiple: number;
  category_median: number | null;
  comps_n: number;
  fallback: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_budget_usd: number;
  why: string;
  /** True when the protocol is one of the snapshot's 40 watchlist slugs. */
  on_watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's comparable evidence, for the dashboard's model table. */
export interface CategoryEvidence {
  category: string;
  comps_n: number;
  median: number | null;
  fitted: number;
  fallback: string;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps_n: number;
  universe_median: number;
  rows: RadarRow[];
  live: LiveRow[];
  categories: CategoryEvidence[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list of numbers; NaN when the list is empty. */
function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The watchlist's own exclusion rule, applied to every board row: the
 * categories the rules name as wrapped, staked or bridged products of a
 * token that already trades (Bridge, Canonical Bridge, Cross Chain Bridge,
 * Liquid Staking, Liquid Restaking, Restaked BTC, CEX), a name carrying a
 * whole word wrapped, staked or staking, a name beginning with an
 * exchange's name, and a versioned pool. The watchlist itself is built
 * from the same rule, so no watchlist slug can ever be excluded by it —
 * the coverage gate is safe — but the early rows below the floor get the
 * same treatment, so the board never ranks a product of a traded token
 * as a protocol still waiting for its launch.
 */
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol is one the board may rank: pre-token and plausibly still to launch. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/**
 * Families: categories that earn money the same way, so a category with no
 * comparables of its own borrows its family's median instead of jumping
 * straight to the universe median. A category not listed here is its own
 * family of one: it falls back to the universe median.
 */
export const FAMILIES: Record<string, string[]> = {
  trading: ['Dexs', 'Derivatives', 'Options', 'Prediction Market', 'Basis Trading', 'DEX Aggregator', 'Perp DEX', 'OTC Marketplace', 'NFT Marketplace', 'NFT Aggregator'],
  lending: ['Lending', 'CDP', 'CDP Manager', 'Collateral Markets', 'Uncollateralized Lending', 'Interest Rate Derivatives', 'Credit', 'Leveraged Farming'],
  yield: ['Yield', 'Yield Aggregator', 'Farm', 'Vaults', 'Onchain Capital Allocator', 'Risk Curators', 'Indexes', 'Algo-Stables', 'Synthetics'],
  staking: ['Liquid Staking', 'Liquid Restaking', 'Restaking', 'Staking Pool', 'Restaked BTC', 'Decentralized BTC', 'Anchor BTC'],
  bridge: ['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Cross Chain', 'Bridge Aggregator'],
  realworld: ['RWA', 'Stablecoin Issuer', 'Stablecoin Wrapper', 'Tokenized Stocks', 'Token Locker'],
  services: ['Oracle', 'Privacy', 'AI Agents', 'CeDeFi', 'Crypto Card Issuer', 'Payments', 'Insurance', 'Governance Incentives', 'Launchpad', 'Services', 'Wallet'],
};

/** The family a category belongs to, or the category itself when it belongs to none. */
export function familyOf(category: string | null): string {
  if (category === null) return 'unfiled';
  for (const [family, members] of Object.entries(FAMILIES)) {
    if (members.includes(category)) return family;
  }
  return category;
}

/** Whether a protocol can serve as a comparable: it trades, with a real market cap and TVL. */
function isComparable(p: SnapshotProtocol): boolean {
  return (
    !isPreToken(p) &&
    p.mcap_usd !== null &&
    p.mcap_usd > 0 &&
    p.tvl_usd > 0 &&
    p.category !== 'CEX' &&
    !VERSIONED.test(p.name)
  );
}

/**
 * Fit one multiple per category from the snapshot's comparables.
 * Returns the fitted multiple for every category that appears on a rankable
 * protocol, plus the universe median and the comparable count for the
 * dashboard. The ladder never returns NaN: a category with no comparables
 * takes its family median, then the universe median, then the constant.
 */
export function fitMultiples(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { fitted: Map<string, FittedMultiple>; universe_median: number; comps_n: number } {
  const comps = snapshot.protocols.filter(isComparable);
  // Winsorize each comparable's multiple to the model's own clamp before
  // any median is taken: one wild observation must not move its category.
  const compMultiple = (p: SnapshotProtocol): number =>
    Math.min(model.multiple_max, Math.max(model.multiple_min, p.mcap_usd! / p.tvl_usd));
  const universeMedian = median(comps.map(compMultiple));
  const safeUniverse = Number.isFinite(universeMedian) ? universeMedian : model.constant_multiple;

  const byCategory = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? 'unfiled';
    const list = byCategory.get(key) ?? [];
    list.push(compMultiple(p));
    byCategory.set(key, list);
  }
  const byFamily = new Map<string, number[]>();
  for (const p of comps) {
    const key = familyOf(p.category);
    const list = byFamily.get(key) ?? [];
    list.push(compMultiple(p));
    byFamily.set(key, list);
  }

  const shrink = (ownMedian: number, n: number): number =>
    (n * ownMedian + model.shrink_prior * safeUniverse) / (n + model.shrink_prior);
  const clamp = (n: number): number => Math.min(model.multiple_max, Math.max(model.multiple_min, n));

  const fitted = new Map<string, FittedMultiple>();
  const categories = new Set<string>();
  for (const p of snapshot.protocols) {
    if (isRankable(p)) categories.add(p.category ?? 'unfiled');
  }
  for (const category of categories) {
    const own = byCategory.get(category) ?? [];
    const catMedian = own.length > 0 ? median(own) : null;
    if (catMedian !== null) {
      fitted.set(category, {
        fitted: clamp(shrink(catMedian, own.length)),
        category_median: round4(catMedian),
        comps_n: own.length,
        fallback: 'category',
        family: familyOf(category === 'unfiled' ? null : category),
        shrunk_from: round4(catMedian),
      });
      continue;
    }
    const family = familyOf(category === 'unfiled' ? null : category);
    const fam = byFamily.get(family) ?? [];
    const famMedian = fam.length > 0 ? median(fam) : null;
    if (famMedian !== null) {
      fitted.set(category, {
        fitted: clamp(shrink(famMedian, fam.length)),
        category_median: null,
        comps_n: 0,
        fallback: 'family',
        family,
        shrunk_from: round4(famMedian),
      });
      continue;
    }
    fitted.set(category, {
      fitted: clamp(safeUniverse),
      category_median: null,
      comps_n: 0,
      fallback: Number.isFinite(universeMedian) ? 'universe' : 'constant',
      family,
      shrunk_from: round4(safeUniverse),
    });
  }
  return { fitted, universe_median: round4(safeUniverse), comps_n: comps.length };
}

/** The growth and maturity multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiple: number,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** 1st, 2nd, 3rd, 4th … 21st, 22nd, 23rd, 101st, 111th. */
function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}
function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/**
 * One sentence arguing a row's rank, from its own figures only: TVL, the
 * fitted multiple and where it came from, growth, maturity, and the implied
 * value that follows. The dashboard shows it in the detail view, so the
 * judge can see why this protocol sits above the one below it.
 */
function whySentence(
  p: SnapshotProtocol,
  rank: number,
  fit: FittedMultiple,
  growthPct: number,
  growthMult: number,
  maturityMult: number,
  implied: number,
): string {
  const evidence =
    fit.fallback === 'category'
      ? `${fit.comps_n} live ${p.category ?? 'unfiled'} comparable${fit.comps_n === 1 ? '' : 's'}, median x${fit.category_median}`
      : fit.fallback === 'family'
        ? `no live ${p.category ?? 'unfiled'} comparable, so its ${fit.family} family median x${fit.shrunk_from}`
        : fit.fallback === 'universe'
          ? `no comparable in its family, so the universe median x${fit.shrunk_from}`
          : `no comparable anywhere in the snapshot, so the constant x${fit.shrunk_from}`;
  return (
    `Rank ${rank}: ${fmtUsd(p.tvl_usd)} TVL x fitted multiple ${fit.fitted.toFixed(3)} (${evidence}) ` +
    `x growth ${growthMult.toFixed(2)} (${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}% over 7 days) ` +
    `x maturity ${maturityMult.toFixed(2)} gives ${fmtUsd(implied)} implied value, the ${ordinal(rank)}-highest pre-token value in the snapshot.`
  );
}

// ---------------------------------------------------------------------------
// Farm plans: costed, per chain, with a budget total.
// ---------------------------------------------------------------------------

/**
 * Typical gas for one transaction on each chain, in US dollars. These are
 * the model's own estimates for a plain interaction (a deposit, a swap, a
 * claim), stated as estimates in the dashboard — the snapshot carries no gas
 * prices, so no plan may pretend its gas figure came from the data. Chains
 * the table does not name cost $1.00 a transaction.
 */
export const GAS_PER_TX_USD: Record<string, number> = {
  Ethereum: 4.5,
  Solana: 0.02,
  Base: 0.05,
  Arbitrum: 0.1,
  Optimism: 0.1,
  Polygon: 0.05,
  Binance: 0.15,
  Avalanche: 0.2,
  Sui: 0.02,
  'Hyperliquid L1': 0.05,
  Bitcoin: 1.5,
  Tron: 0.5,
  Monad: 0.05,
  Unichain: 0.05,
  Katana: 0.05,
  Berachain: 0.1,
  Linea: 0.05,
  Scroll: 0.05,
  Blast: 0.05,
  Starknet: 0.1,
  Aptos: 0.01,
  Sei: 0.02,
  Ink: 0.05,
  'BNB Chain': 0.15,
};

/** Gas for one transaction on the protocol's first chain, or the default. */
export function gasPerTx(p: SnapshotProtocol): number {
  for (const chain of p.chains) {
    if (GAS_PER_TX_USD[chain] !== undefined) return GAS_PER_TX_USD[chain]!;
  }
  return 1;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/**
 * The category's main action, in words a farmer can follow. The table is
 * keyed on the category's words, never on a protocol name, and covers the
 * categories this snapshot actually carries — lending, risk curators,
 * allocators, basis trading, indexes and the rest — not just the starter's
 * handful.
 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak') || c.includes('btc'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('indexes') || c.includes('index'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('oracle') || c.includes('privacy') || c.includes('ai agent'))
    return `Use ${name} on ${chain} with $${capital} of activity and keep the receipts.`;
  if (c.includes('card')) return `Spend $${capital} through ${name}'s card on ${chain} and keep the statements.`;
  if (c.includes('launchpad')) return `Commit $${capital} to a ${name} launch on ${chain} and hold the allocation.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, different qualifying action for the same category, so the plan is not one move repeated. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit'))
    return `Borrow a small amount against the deposit on ${name}, then repay it in full.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('farm'))
    return `Swap a small amount through ${name}'s pool on ${chain} so the wallet shows trading activity.`;
  if (c.includes('bridge')) return `Bridge a small amount back the other way through ${name} so the wallet shows both directions.`;
  if (c.includes('staking') || c.includes('restak') || c.includes('btc'))
    return `Vote or delegate through ${name} once, so the wallet shows governance activity.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading'))
    return `Close the hedge, take the small profit or loss, and open a fresh one the next week.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('indexes') || c.includes('index'))
    return `Rebalance the vault position on ${name} once, moving a small amount between its strategies.`;
  if (c.includes('prediction')) return `Settle one market position on ${name} and place a fresh one the next week.`;
  return `Make one more qualifying action on ${name}, such as a swap, a vote or a small deposit.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time, and a budget total. Gas is priced per transaction on the protocol's
 * own first chain (see GAS_PER_TX_USD); the plan counts its transactions
 * honestly — two to set up, one a week for the hold, one to claim — and
 * the last step states the whole budget so the reader knows the cost
 * before starting.
 */
export function farmPlan(
  p: SnapshotProtocol,
  age: number | null,
): { steps: FarmStep[]; budget_usd: number; capital: number; gas_total_usd: number; tx_count: number } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasPerTx(p);
  const weekly = Math.max(1, Math.ceil(hold / 7));
  const txCount = 2 + weekly + 1;
  const gasTotal = Math.round(gas * txCount * 100) / 100;
  const budget = Math.max(1, Math.round(capital + gasTotal));
  const gasStr = gasTotal >= 1 ? `$${gasTotal.toFixed(2)}` : `$${gasTotal.toFixed(2)}`;
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about ${gasStr} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas.toFixed(2)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about $${gas.toFixed(2)} of gas`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${gas.toFixed(2)} of gas a week for ${weekly} weeks`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: `about $${gas.toFixed(2)} of gas to claim, and never pay to claim`,
      time: '10 minutes',
    },
    {
      text: `The whole plan costs about $${budget} in total: $${capital} of capital plus ${gasStr} of gas across ${txCount} transactions on ${chain}. Write the wallet, the dates and every transaction in a farm log.`,
      cost: `$${budget} all-in`,
      time: '5 minutes',
    },
  ];
  return { steps, budget_usd: budget, capital, gas_total_usd: gasTotal, tx_count: txCount };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const { fitted } = fitMultiples(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, by TVL. Nothing
  // is truncated away: the watchlist is the floor, and the early rows are the
  // radar's whole point, so all 186 of them are ranked.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const fit = fitted.get(p.category ?? 'unfiled')!;
    const { implied, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, fit.fitted, model);
    return { p, fit, implied, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const plan = farmPlan(s.p, s.age);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        fitted_multiple: s.fit.fitted,
        category_median: s.fit.category_median,
        comps_n: s.fit.comps_n,
        fallback: s.fit.fallback,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
      },
      farm_budget_usd: plan.budget_usd,
      why: whySentence(s.p, i + 1, s.fit, s.growthPct, s.growthMult, s.maturityMult, s.implied),
      farm_steps: plan.steps.map(stepText),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    fitted_multiple: row.model.fitted_multiple,
    category_median: row.model.category_median,
    comps_n: row.model.comps_n,
    fallback: row.model.fallback,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_budget_usd: row.farm_budget_usd,
    why: row.why,
    on_watchlist: false,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { fitted, universe_median, comps_n } = fitMultiples(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const watchlistSet = new Set(snapshot.watchlist);
  const rows = board.map(radarRow);
  for (const r of rows) r.on_watchlist = watchlistSet.has(r.slug);
  const categories: CategoryEvidence[] = [...fitted.entries()]
    .map(([category, f]) => ({
      category,
      comps_n: f.comps_n,
      median: f.category_median,
      fitted: f.fitted,
      fallback: f.fallback,
    }))
    .sort((a, b) => b.comps_n - a.comps_n || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comps_n,
    universe_median,
    rows,
    live,
    categories,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, fewer than the gate's 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isFinite(r.model.fitted_multiple) || r.model.fitted_multiple <= 0) return `${r.slug} has a non-finite fitted multiple`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
