const { timingSafeEqual } = require('node:crypto');

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function respond(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function authorized(header, expected) {
  if (!expected || expected.length < 20 || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7), 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

async function stripeGet(path, params, key) {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  for (const [name, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `Stripe returned HTTP ${response.status}`);
  return body;
}

async function listAll(path, params, key) {
  const data = [];
  let startingAfter;
  for (let page = 0; page < 100; page++) {
    const result = await stripeGet(path, { ...params, starting_after: startingAfter }, key);
    if (!Array.isArray(result.data)) throw new Error('Unexpected response from Stripe.');
    data.push(...result.data);
    if (!result.has_more) return data;
    startingAfter = result.data.at(-1)?.id;
    if (!startingAfter) break;
  }
  throw new Error('Stripe has more than 10,000 records for this request. Narrow the campaign before using this dashboard.');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return respond(405, { error: 'GET required.' });
  const key = process.env.STRIPE_RESTRICTED_KEY;
  const token = process.env.DASHBOARD_TOKEN;
  if (!key || !/^rk_(test|live)_/.test(key) || !token || token.length < 20) {
    return respond(503, { error: 'Netlify environment is not configured. Set STRIPE_RESTRICTED_KEY and a DASHBOARD_TOKEN of at least 20 characters.' });
  }
  if (!authorized(event.headers.authorization || event.headers.Authorization, token)) return respond(401, { error: 'Invalid dashboard access token.' });

  try {
    const action = event.queryStringParameters?.action;
    const mode = key.startsWith('rk_test_') ? 'test' : 'live';
    if (action === 'links') {
      const links = await listAll('payment_links', { limit: 100, active: true, 'expand[]': 'data.line_items' }, key);
      return respond(200, { mode, links: links.map(link => {
        const items = link.line_items?.data || [];
        const name = [link.metadata?.name, link.metadata?.title, items[0]?.description]
          .find(value => typeof value === 'string' && value.trim())?.trim() || 'Untitled Payment Link';
        return {
          id: link.id, name, url: link.url, active: link.active, currency: link.currency,
          livemode: link.livemode, customerChoosesAmount: items.some(item => item.price?.custom_unit_amount != null),
        };
      }) });
    }
    if (action === 'donations') {
      const linkId = event.queryStringParameters?.link;
      if (!/^plink_[A-Za-z0-9]+$/.test(linkId || '')) return respond(400, { error: 'A valid Payment Link ID is required.' });
      const sessions = await listAll('checkout/sessions', { limit: 100, payment_link: linkId, 'expand[]': 'data.payment_intent.latest_charge' }, key);
      const donations = sessions.filter(session => session.mode === 'payment' && session.status === 'complete' && session.payment_status === 'paid')
        .map(session => ({ id: session.id, amount: session.amount_total, currency: session.currency, created: session.payment_intent?.latest_charge?.created || session.payment_intent?.created || session.created, reference: session.client_reference_id, customFields: session.custom_fields || [] }));
      return respond(200, { mode, donations });
    }
    return respond(400, { error: 'Unknown action.' });
  } catch (error) {
    console.error('Stripe read failed:', error.message);
    return respond(502, { error: error.message || 'Stripe read failed.' });
  }
};
