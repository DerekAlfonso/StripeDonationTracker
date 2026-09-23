import { preferredPaymentLinkId, shareUrl, sortPaymentLinks, summarize } from './data.js';

const STORAGE = 'giving-board-config-v1';
const TIMER = 'giving-board-timer-v1';
const DEFAULT_CAMPAIGN_NAME = 'TCBC Text-a-Thon';
const $ = id => document.getElementById(id);
const barColors = ['#ff6b6b', '#62aaff', '#ff9980', '#8ac7ff', '#f479a8', '#5cd5e8', '#ffb56f', '#9ba5ff', '#ed86d8', '#91d4ff'];
const demoDonations = [
  ['Derek A', 82500, 2], ['Avery B', 74000, 5], ['Samira K', 58000, 8], ['Jordan M', 53000, 14],
  ['Taylor R', 44500, 22], ['Morgan L', 36000, 35], ['Riley C', 31000, 49], ['Charlie P', 26500, 60],
  ['Alex W', 21000, 81], ['Jamie H', 18500, 115], ['Derek A', 15000, 1], ['Samira K', 12000, 18],
].map(([name, amount, minutes], index) => ({ id: `demo-${index}`, amount, currency: 'usd', created: Math.floor(Date.now() / 1000) - minutes * 60, reference: name }));

let config = readConfig();
let links = [];
let publishedLinkId = '';
let donations = demoDonations;
let mode = 'demo';
let pollHandle;
let fetching = false;
let timer = readTimer();
let lastGiftAt = 0;

function readConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    return { name: DEFAULT_CAMPAIGN_NAME, pollSeconds: 30, token: '', linkId: '', ...stored, name: stored.name?.trim() || DEFAULT_CAMPAIGN_NAME };
  } catch { return { name: DEFAULT_CAMPAIGN_NAME, pollSeconds: 30, token: '', linkId: '' }; }
}
function readTimer() {
  try { return { elapsed: 0, startedAt: null, ...JSON.parse(localStorage.getItem(TIMER) || '{}') }; }
  catch { return { elapsed: 0, startedAt: null }; }
}
function persistTimer() { localStorage.setItem(TIMER, JSON.stringify(timer)); }
function setStatus(message, error = false) { $('connect-status').textContent = message; $('connect-status').classList.toggle('error', error); }
function money(cents, currency = 'usd', compact = false) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: compact ? 0 : 2, minimumFractionDigits: compact ? 0 : 2 }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`; }
}
function duration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function tick() {
  $('campaign-timer').textContent = duration(timer.elapsed + (timer.startedAt ? Date.now() - timer.startedAt : 0));
  $('since-last').textContent = lastGiftAt ? duration(Date.now() - lastGiftAt * 1000) : '—';
  $('timer-button').textContent = timer.startedAt ? '❚❚ Stop timer' : '▶ Start timer';
}
function renderChart(summary) {
  const chart = $('chart');
  chart.replaceChildren();
  $('empty-chart').hidden = summary.leaders.length > 0;
  chart.hidden = summary.leaders.length === 0;
  const max = summary.leaders[0]?.amount || 1;
  for (const [index, leader] of summary.leaders.entries()) {
    const col = document.createElement('div'); col.className = 'bar-column';
    col.style.setProperty('--bar-color', barColors[index]);
    const amount = document.createElement('div'); amount.className = 'bar-value'; amount.textContent = money(leader.amount, summary.currency, true);
    const bar = document.createElement('div'); bar.className = 'bar'; bar.style.height = `max(3px, calc(var(--chart-bars-height) * ${leader.amount / max}))`;
    const name = document.createElement('div'); name.className = 'bar-name'; name.textContent = leader.name; name.title = leader.name;
    col.append(amount, bar, name); chart.append(col);
  }
  chart.setAttribute('aria-label', `Top donors: ${summary.leaders.map(item => `${item.name} ${money(item.amount, summary.currency)}`).join(', ') || 'No donations yet'}`);
}
function renderDashboard() {
  let summary;
  try { summary = summarize(donations); } catch (error) { lastGiftAt = 0; $('connection-message').textContent = error.message; return; }
  lastGiftAt = summary.lastDonation;
  $('donation-count').textContent = new Intl.NumberFormat('en-US').format(summary.count);
  $('donation-total').textContent = money(summary.total, summary.currency);
  $('last-gift-caption').textContent = summary.lastDonation ? 'since the last completed payment' : 'Waiting for a donation';
  $('campaign-subtitle').textContent = config.name ? `${config.name}, at a glance.` : 'Your fundraising campaign, at a glance.';
  const selected = links.find(link => link.id === config.linkId);
  $('link-label').textContent = selected ? selected.name : mode === 'demo' ? 'Sample campaign' : config.linkId || 'No link selected';
  const badge = $('mode-badge'); badge.className = `mode-badge ${mode}`; badge.textContent = mode === 'demo' ? 'DEMO MODE' : `${mode.toUpperCase()} MODE`;
  $('connection-message').textContent = mode === 'demo' ? 'Demo data is displayed until a Stripe connection is configured.' : `Showing paid Checkout Sessions for ${config.linkId}.`;
  renderChart(summary); tick();
}
function renderLinks(selectedId) {
  const select = $('payment-link'); select.replaceChildren();
  const first = document.createElement('option'); first.value = ''; first.textContent = links.length ? 'Choose a Payment Link' : 'No active links loaded'; select.append(first);
  for (const link of links) {
    const option = document.createElement('option'); option.value = link.id; option.textContent = link.name; select.append(option);
  }
  select.value = selectedId;
  renderLinkDetails();
}
function renderLinkDetails() {
  const selected = links.find(link => link.id === $('payment-link').value);
  $('link-details').textContent = selected ? `${selected.url} · ${selected.livemode ? 'Live' : 'Test'} mode` : '';
  renderShareUrl();
}
function renderShareUrl() {
  const selected = links.find(link => link.id === $('payment-link').value);
  try { $('share-url').value = selected && selected.id === publishedLinkId && $('for-name').value.trim() ? shareUrl(location.origin, $('for-name').value) : ''; }
  catch { $('share-url').value = ''; }
}
async function api(action, query = {}, token = $('access-token').value.trim(), options = {}) {
  if (!token) throw new Error('Enter the dashboard access token first.');
  const url = new URL('/.netlify/functions/stripe', location.origin);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, { method: options.method || 'GET', headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, body: options.body, cache: 'no-store' });
  let body;
  try { body = await response.json(); } catch { throw new Error('Stripe function is unavailable. Run through Netlify or Netlify Dev.'); }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}
async function loadLinks() {
  setStatus('Connecting to Stripe…');
  try {
    const result = await api('links');
    mode = result.mode;
    publishedLinkId = result.campaignLinkId || '';
    const currentId = $('payment-link').value || config.linkId;
    links = sortPaymentLinks(result.links);
    const selectedId = preferredPaymentLinkId(links, currentId);
    renderLinks(selectedId);
    if (selectedId && !links.some(link => link.id === config.linkId) && config.token && config.token === $('access-token').value.trim()) {
      await api('select', {}, config.token, { method: 'POST', body: JSON.stringify({ linkId: selectedId }) });
      publishedLinkId = selectedId;
      config.linkId = selectedId;
      localStorage.setItem(STORAGE, JSON.stringify(config));
      donations = [];
      schedulePoll();
    }
    renderShareUrl();
    renderDashboard();
    setStatus(`${links.length} active Payment Link${links.length === 1 ? '' : 's'} loaded from Stripe ${mode} mode.`);
    if (config.linkId) await refreshDonations();
  } catch (error) { setStatus(error.message, true); $('connection-message').textContent = error.message; }
}
async function refreshDonations() {
  if (fetching || !config.linkId || !config.token) return;
  fetching = true;
  $('refresh-button').disabled = true;
  try {
    const result = await api('donations', { link: config.linkId }, config.token);
    mode = result.mode;
    donations = result.donations;
    renderDashboard();
    $('last-sync').textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    $('last-sync').textContent = 'Update failed';
    $('connection-message').textContent = error.message;
  } finally { fetching = false; $('refresh-button').disabled = false; }
}
function schedulePoll() {
  clearInterval(pollHandle);
  if (config.token && config.linkId) pollHandle = setInterval(refreshDonations, config.pollSeconds * 1000);
}
function route() {
  const page = location.hash === '#configure' ? 'configure' : 'dashboard';
  $('dashboard-page').hidden = page !== 'dashboard'; $('configure-page').hidden = page !== 'configure';
  for (const nav of document.querySelectorAll('[data-nav]')) nav.classList.toggle('active', nav.dataset.nav === page);
}
async function save() {
  const seconds = Number($('poll-seconds').value);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 3600) { $('save-status').textContent = 'Choose a refresh interval from 10 to 3600 seconds.'; return; }
  const nextConfig = { name: $('campaign-name').value.trim() || DEFAULT_CAMPAIGN_NAME, pollSeconds: seconds, token: $('access-token').value.trim(), linkId: $('payment-link').value };
  if (nextConfig.token) {
    try {
      await api('select', {}, nextConfig.token, { method: 'POST', body: JSON.stringify({ linkId: nextConfig.linkId }) });
      publishedLinkId = nextConfig.linkId;
    } catch (error) { $('save-status').textContent = `Could not publish the donation link: ${error.message}`; return; }
  } else publishedLinkId = '';
  config = nextConfig;
  localStorage.setItem(STORAGE, JSON.stringify(config));
  $('save-status').textContent = config.linkId && publishedLinkId === config.linkId ? 'Saved in this browser and published for shared donation URLs.' : 'Saved in this browser.';
  renderShareUrl();
  if (config.linkId && config.token) { refreshDonations(); schedulePoll(); }
  else { clearInterval(pollHandle); donations = demoDonations; mode = 'demo'; renderDashboard(); }
}
function setup() {
  $('campaign-name').value = config.name;
  $('poll-seconds').value = config.pollSeconds;
  $('access-token').value = config.token;
  $('payment-link').addEventListener('change', renderLinkDetails);
  $('for-name').addEventListener('input', renderShareUrl);
  $('connect-button').addEventListener('click', loadLinks);
  $('reload-links').addEventListener('click', loadLinks);
  $('save-button').addEventListener('click', save);
  $('toggle-token').addEventListener('click', () => { const field = $('access-token'); field.type = field.type === 'password' ? 'text' : 'password'; $('toggle-token').textContent = field.type === 'password' ? 'Show' : 'Hide'; });
  $('clear-token-button').addEventListener('click', () => { $('access-token').value = ''; config.token = ''; localStorage.setItem(STORAGE, JSON.stringify(config)); clearInterval(pollHandle); donations = demoDonations; mode = 'demo'; renderDashboard(); setStatus('Token removed from this browser.'); });
  $('copy-link').addEventListener('click', async () => { if (!$('share-url').value) { $('save-status').textContent = 'Save a Payment Link and enter a name first.'; return; } try { await navigator.clipboard.writeText($('share-url').value); $('copy-link').textContent = 'Copied!'; setTimeout(() => $('copy-link').textContent = 'Copy', 1800); } catch { $('share-url').select(); $('save-status').textContent = 'Select and copy the URL above.'; } });
  $('refresh-button').addEventListener('click', refreshDonations);
  $('fullscreen-button').addEventListener('click', async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); });
  $('timer-button').addEventListener('click', () => { if (timer.startedAt) { timer.elapsed += Date.now() - timer.startedAt; timer.startedAt = null; } else timer.startedAt = Date.now(); persistTimer(); tick(); });
  $('timer-reset').addEventListener('click', () => { timer = { elapsed: 0, startedAt: null }; persistTimer(); tick(); });
  window.addEventListener('hashchange', route);
  route(); renderDashboard(); setInterval(tick, 1000);
  if (config.token) loadLinks();
  schedulePoll();
}

setup();
