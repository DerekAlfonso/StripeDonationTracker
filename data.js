export function encodeFor(name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Enter a name to credit.');
  const bytes = new TextEncoder().encode(clean);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const value = `gb_${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
  if (value.length > 200) throw new Error('The name is too long for Stripe. Use a shorter name.');
  return value;
}

export function decodeFor(reference) {
  if (typeof reference !== 'string' || !reference.startsWith('gb_')) return null;
  try {
    const base64 = reference.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes) || null;
  } catch { return null; }
}

export function getFor(donation) {
  const decoded = decodeFor(donation.reference);
  if (decoded) return decoded;
  const field = donation.customFields?.find(field => String(field.key || '').toLowerCase() === 'for');
  const value = field?.text?.value || field?.dropdown?.value || donation.reference;
  return String(value || 'Unattributed').trim() || 'Unattributed';
}

export function summarize(donations) {
  const valid = donations.filter(item => Number.isSafeInteger(item.amount) && item.amount >= 0 && typeof item.currency === 'string');
  const currencies = [...new Set(valid.map(item => item.currency.toLowerCase()))];
  if (currencies.length > 1) throw new Error('This link has donations in multiple currencies. Choose a single-currency Payment Link.');
  const groups = new Map();
  for (const donation of valid) {
    const name = getFor(donation);
    const key = name.toLocaleLowerCase();
    const previous = groups.get(key);
    groups.set(key, { name: previous?.name || name, amount: (previous?.amount || 0) + donation.amount });
  }
  const leaders = [...groups.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)).slice(0, 10);
  return { count: valid.length, total: valid.reduce((sum, item) => sum + item.amount, 0), currency: currencies[0] || 'usd', lastDonation: valid.reduce((max, item) => Math.max(max, Number(item.created || 0)), 0), leaders };
}

export function shareUrl(siteOrigin, stripeUrl, name) {
  const stripe = new URL(stripeUrl);
  if (stripe.protocol !== 'https:' || stripe.hostname !== 'buy.stripe.com') throw new Error('Select a valid Stripe Payment Link.');
  encodeFor(name);
  const url = new URL('/donate', siteOrigin);
  url.searchParams.set('for', name.trim());
  url.hash = `link=${encodeURIComponent(stripe.toString())}`;
  return url.toString();
}

export function stripeRedirect(locationHref) {
  const incoming = new URL(locationHref);
  const name = incoming.searchParams.get('for');
  const fragment = new URLSearchParams(incoming.hash.slice(1));
  const stripe = new URL(fragment.get('link') || '');
  if (stripe.protocol !== 'https:' || stripe.hostname !== 'buy.stripe.com') throw new Error('This donation link has an invalid Stripe destination.');
  stripe.searchParams.set('client_reference_id', encodeFor(name));
  return stripe.toString();
}
