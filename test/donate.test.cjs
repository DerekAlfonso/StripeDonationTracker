const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/donate.cjs');
const campaign = require('../netlify/lib/campaign.cjs');

test('short donation URL redirects through the published Stripe link with the credited name', async (t) => {
  process.env.STRIPE_RESTRICTED_KEY = 'rk_test_mock';
  t.mock.method(campaign, 'read', async () => 'plink_campaign');
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ id: 'plink_campaign', active: true, url: 'https://buy.stripe.com/test_abc' }) }));
  const response = await handler({ httpMethod: 'GET', queryStringParameters: { for: 'José 🌻' } });
  assert.equal(response.statusCode, 302);
  const destination = new URL(response.headers.location);
  assert.equal(destination.hostname, 'buy.stripe.com');
  assert.equal(destination.searchParams.size, 1);
  const reference = destination.searchParams.get('client_reference_id');
  assert.equal(Buffer.from(reference.slice(3), 'base64url').toString('utf8'), 'José 🌻');
});

test('donation redirect rejects missing names and unsafe Stripe destinations', async (t) => {
  process.env.STRIPE_RESTRICTED_KEY = 'rk_test_mock';
  t.mock.method(campaign, 'read', async () => 'plink_campaign');
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ id: 'plink_campaign', active: true, url: 'https://evil.example/' }) }));
  assert.equal((await handler({ httpMethod: 'GET', queryStringParameters: {} })).statusCode, 400);
  assert.equal((await handler({ httpMethod: 'GET', queryStringParameters: { for: 'Derek' } })).statusCode, 502);
});

test('donation redirect stays unavailable until a campaign link is published', async (t) => {
  process.env.STRIPE_RESTRICTED_KEY = 'rk_test_mock';
  t.mock.method(campaign, 'read', async () => '');
  const response = await handler({ httpMethod: 'GET', queryStringParameters: { for: 'Derek' } });
  assert.equal(response.statusCode, 503);
});
