const { getStore } = require('@netlify/blobs');

const context = process.env.CONTEXT || 'production';
const key = context === 'production' ? 'production' : `preview-${process.env.DEPLOY_ID || context}`;
const store = () => getStore('tcbc-text-a-thon');

exports.read = async () => (await store().get(key, { type: 'json' }))?.linkId || '';
exports.write = async (linkId) => {
  if (linkId) await store().setJSON(key, { linkId });
  else await store().delete(key);
};
