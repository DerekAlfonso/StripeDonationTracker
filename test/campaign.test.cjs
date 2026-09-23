const test = require('node:test');
const assert = require('node:assert/strict');
const { connectLambda } = require('@netlify/blobs');
const campaign = require('../netlify/lib/campaign.cjs');

test('published link can be read with a Lambda Blobs context that lacks an uncached edge URL', async (t) => {
  connectLambda({
    blobs: Buffer.from(JSON.stringify({ url: 'https://blobs.example.test', token: 'test-blob-token' })).toString('base64'),
    headers: { 'x-nf-site-id': 'site-test', 'x-nf-deploy-id': 'deploy-test' },
  });
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url: String(url), method: options.method });
    return new Response(JSON.stringify({ linkId: 'plink_campaign' }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.equal(await campaign.read(), 'plink_campaign');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'get');
  assert.match(requests[0].url, /^https:\/\/blobs\.example\.test\/site-test\/site:tcbc-text-a-thon\//);
});
