const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/donate.cjs');
const campaign = require('../netlify/lib/campaign.cjs');
const blobs = Buffer.from(JSON.stringify({ url: 'https://blobs.example.test', token: 'test-blob-token' })).toString('base64');
const event = forName => ({ httpMethod: 'GET', headers: { 'x-nf-site-id': 'site-test', 'x-nf-deploy-id': 'deploy-test' }, blobs, queryStringParameters: { for: forName } });

test('short donation URL redirects through the published Stripe link with the credited name', async (t) => {
  process.env.STRIPE_RESTRICTED_KEY = 'rk_test_mock';
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  t.mock.method(campaign, 'read', async () => 'plink_campaign');
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ id: 'plink_campaign', active: true, url: 'https://buy.stripe.com/test_abc' }) }));
  const response = await handler(event('José 🌻'));
  const blobContext = JSON.parse(Buffer.from(process.env.NETLIFY_BLOBS_CONTEXT, 'base64').toString('utf8'));
  assert.equal(blobContext.siteID, 'site-test');
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
  assert.equal((await handler(event())).statusCode, 400);
  assert.equal((await handler(event('Derek'))).statusCode, 502);
});

test('donation redirect stays unavailable until a campaign link is published', async (t) => {
  process.env.STRIPE_RESTRICTED_KEY = 'rk_test_mock';
  t.mock.method(campaign, 'read', async () => '');
  const response = await handler(event('Derek'));
  assert.equal(response.statusCode, 503);
});
