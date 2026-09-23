import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFor, decodeFor, getFor, shareUrl, stripeRedirect, summarize } from '../data.js';

test('share URL preserves the requested for parameter and Stripe receives a valid reference', () => {
  const url = shareUrl('https://giving.example', 'https://buy.stripe.com/test_abc', 'Derek A');
  assert.equal(new URL(url).searchParams.get('for'), 'Derek A');
  const redirect = new URL(stripeRedirect(url));
  assert.equal(redirect.hostname, 'buy.stripe.com');
  assert.match(redirect.searchParams.get('client_reference_id'), /^[A-Za-z0-9_-]+$/);
  assert.equal(decodeFor(redirect.searchParams.get('client_reference_id')), 'Derek A');
});

test('Unicode names round-trip and malicious destinations are rejected', () => {
  assert.equal(decodeFor(encodeFor('José 🌻')), 'José 🌻');
  assert.throws(() => shareUrl('https://giving.example', 'https://evil.example/steal', 'Derek'));
  assert.throws(() => stripeRedirect('https://giving.example/donate?for=Derek#link=https%3A%2F%2Fevil.example'));
});

test('summarize groups names, sorts descending, and selects the latest paid donation', () => {
  const donations = [
    { amount: 2000, currency: 'usd', created: 10, reference: encodeFor('Derek A') },
    { amount: 3000, currency: 'usd', created: 20, reference: encodeFor('Sam') },
    { amount: 2500, currency: 'usd', created: 30, reference: encodeFor('derek a') },
  ];
  const result = summarize(donations);
  assert.equal(result.count, 3);
  assert.equal(result.total, 7500);
  assert.equal(result.lastDonation, 30);
  assert.deepEqual(result.leaders.map(item => [item.name, item.amount]), [['Derek A', 4500], ['Sam', 3000]]);
});

test('For custom field provides a fallback when no share reference exists', () => {
  assert.equal(getFor({ customFields: [{ key: 'for', text: { value: 'Morgan' } }] }), 'Morgan');
  assert.equal(getFor({}), 'Unattributed');
  assert.throws(() => summarize([{ amount: 100, currency: 'usd' }, { amount: 100, currency: 'eur' }]));
});
