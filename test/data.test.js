import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFor, decodeFor, getFor, preferredPaymentLinkId, shareUrl, sortPaymentLinks, summarize } from '../data.js';

test('share URL contains only the requested for parameter', () => {
  const url = new URL(shareUrl('https://giving.example', 'Derek A'));
  assert.equal(url.pathname, '/donate');
  assert.equal(url.searchParams.get('for'), 'Derek A');
  assert.equal(url.searchParams.size, 1);
  assert.equal(url.hash, '');
});

test('Unicode names round-trip and empty share names are rejected', () => {
  assert.equal(decodeFor(encodeFor('José 🌻')), 'José 🌻');
  assert.throws(() => shareUrl('https://giving.example', ' '));
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

test('payment links sort by name and prefer the first variable amount link unless a saved choice is valid', () => {
  const links = sortPaymentLinks([
    { id: 'plink_z', name: 'Zebra', customerChoosesAmount: true },
    { id: 'plink_f', name: 'alpha', customerChoosesAmount: false },
    { id: 'plink_a', name: 'Apple', customerChoosesAmount: true },
  ]);
  assert.deepEqual(links.map(link => link.name), ['alpha', 'Apple', 'Zebra']);
  assert.equal(preferredPaymentLinkId(links), 'plink_a');
  assert.equal(preferredPaymentLinkId(links, 'plink_f'), 'plink_f');
  assert.equal(preferredPaymentLinkId(links, 'plink_missing'), 'plink_a');
  assert.equal(preferredPaymentLinkId(links.filter(link => !link.customerChoosesAmount)), 'plink_f');
});
