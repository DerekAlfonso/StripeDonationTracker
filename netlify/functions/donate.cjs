const { connectLambda } = require('@netlify/blobs');
const campaign = require('../lib/campaign.cjs');

const headers = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

function unavailable(statusCode = 400) {
  return {
    statusCode,
    headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
    body: '<!doctype html><html lang="en"><meta charset="utf-8"><title>Donation link unavailable</title><main><h1>Donation link unavailable</h1><p>Please ask the campaign organizer for a new link.</p></main></html>',
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return unavailable(405);
  const name = event.queryStringParameters?.for;
  if (typeof name !== 'string' || !name.trim()) return unavailable();
  const reference = `gb_${Buffer.from(name.trim(), 'utf8').toString('base64url')}`;
  if (reference.length > 200) return unavailable();
  const key = process.env.STRIPE_RESTRICTED_KEY;
  if (!key || !/^rk_(test|live)_/.test(key)) return unavailable(503);

  try {
    connectLambda(event);
    const linkId = await campaign.read();
    if (!/^plink_[A-Za-z0-9]+$/.test(linkId)) return unavailable(503);
    const response = await fetch(`https://api.stripe.com/v1/payment_links/${linkId}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return unavailable(response.status === 404 ? 404 : 502);
    const link = await response.json();
    if (link.id !== linkId || !link.active) return unavailable(404);
    const destination = new URL(link.url);
    if (destination.protocol !== 'https:' || !['buy.stripe.com', 'donate.stripe.com'].includes(destination.hostname)) return unavailable(502);
    destination.searchParams.set('client_reference_id', reference);
    return { statusCode: 302, headers: { ...headers, location: destination.toString() }, body: '' };
  } catch (error) {
    console.error('Donation redirect failed:', error.message);
    return unavailable(502);
  }
};
