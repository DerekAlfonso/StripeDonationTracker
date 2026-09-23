const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/stripe.cjs');
const campaign = require('../netlify/lib/campaign.cjs');

const token = 'very-long-private-dashboard-token';
const blobs = Buffer.from(JSON.stringify({ url: 'https://blobs.example.test', token: 'test-blob-token' })).toString('base64');
const event = (action, extras = {}) => ({ httpMethod: 'GET', headers: { authorization: `Bearer ${token}`, 'x-nf-site-id': 'site-test', 'x-nf-deploy-id': 'deploy-test' }, blobs, queryStringParameters: { action, ...extras } });

test('function denies access without the dashboard token', async () => {
  process.env.STRIPE_RESTRICTED_KEY = 'rk_test_mock';
  process.env.DASHBOARD_TOKEN = token;
  const response = await handler({ ...event('links'), headers: {} });
  assert.equal(response.statusCode, 401);
});

test('function paginates links and returns only paid completed sessions', async (t) => {
  t.mock.method(campaign, 'read', async () => '');
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  process.env.STRIPE_RESTRICTED_KEY = 'rk_test_mock';
  process.env.DASHBOARD_TOKEN = token;
  const requested = [];
  global.fetch = async (url) => {
    const parsed = new URL(url);
    requested.push(parsed);
    if (parsed.pathname === '/v1/payment_links') {
      const second = parsed.searchParams.has('starting_after');
      return { ok: true, json: async () => second ? { data: [{ id: 'plink_b', url: 'https://buy.stripe.com/test_b', active: true, metadata: { name: 'Summer drive' }, line_items: { data: [{ description: 'Donation', price: { custom_unit_amount: null } }] } }], has_more: false } : { data: [{ id: 'plink_a', url: 'https://buy.stripe.com/test_a', active: true, line_items: { data: [{ description: 'Choir campaign', price: { custom_unit_amount: { minimum: 100 } } }] } }], has_more: true } };
    }
    return { ok: true, json: async () => ({ data: [
      { id: 'cs_1', mode: 'payment', status: 'complete', payment_status: 'paid', amount_total: 2500, currency: 'usd', created: 12, payment_intent: { created: 13, latest_charge: { created: 15 } }, client_reference_id: 'gb_Test' },
      { id: 'cs_2', mode: 'payment', status: 'complete', payment_status: 'unpaid', amount_total: 1000, currency: 'usd' },
      { id: 'cs_3', mode: 'payment', status: 'open', payment_status: 'paid', amount_total: 1000, currency: 'usd' },
    ], has_more: false }) };
  };
  const links = JSON.parse((await handler(event('links'))).body);
  const blobContext = JSON.parse(Buffer.from(process.env.NETLIFY_BLOBS_CONTEXT, 'base64').toString('utf8'));
  assert.equal(blobContext.siteID, 'site-test');
  assert.deepEqual(links.links.map(link => link.id), ['plink_a', 'plink_b']);
  assert.equal(links.campaignLinkId, '');
  assert.deepEqual(links.links.map(link => link.name), ['Choir campaign', 'Summer drive']);
  assert.deepEqual(links.links.map(link => link.customerChoosesAmount), [true, false]);
  assert.equal(requested[0].searchParams.get('expand[]'), 'data.line_items');
  const donations = JSON.parse((await handler(event('donations', { link: 'plink_a' }))).body);
  assert.equal(donations.donations.length, 1);
  assert.equal(donations.donations[0].amount, 2500);
  assert.equal(donations.donations[0].created, 15);
  assert.equal(requested.at(-1).searchParams.get('payment_link'), 'plink_a');
  assert.equal(requested.at(-1).searchParams.get('expand[]'), 'data.payment_intent.latest_charge');
});

test('publishing a link requires a valid active Stripe link and the dashboard token', async (t) => {
  process.env.STRIPE_RESTRICTED_KEY = 'rk_test_mock';
  process.env.DASHBOARD_TOKEN = token;
  const writes = [];
  t.mock.method(campaign, 'write', async id => writes.push(id));
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ id: 'plink_good', active: true }) }));
  const request = { ...event('select'), httpMethod: 'POST', body: JSON.stringify({ linkId: 'plink_good' }) };
  assert.equal((await handler({ ...request, headers: {} })).statusCode, 401);
  assert.equal((await handler({ ...request, body: JSON.stringify({ linkId: 'bad' }) })).statusCode, 400);
  assert.equal((await handler(request)).statusCode, 200);
  assert.deepEqual(writes, ['plink_good']);
});
