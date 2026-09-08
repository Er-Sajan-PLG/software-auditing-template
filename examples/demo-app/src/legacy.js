// Deprecated in Node 16, removed in Node 22 — still load-bearing here.
const url = require('url');

function parseQuery(qs) {
  return url.parse('http://x?' + qs, true).query;
}

/** @deprecated use crypto.randomUUID instead */
function makeId() {
  return new Buffer(16).toString('hex');
}

module.exports = { parseQuery, makeId };
