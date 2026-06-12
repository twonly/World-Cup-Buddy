const test = require('node:test');
const assert = require('node:assert/strict');

const proxy = require('../dist-electron/proxy.js');

test('normalizes a simple corporate HTTP proxy URL for Chromium fixed_servers mode', () => {
  assert.equal(typeof proxy.normalizeProxyInput, 'function');

  const result = proxy.normalizeProxyInput('http://proxy.corp.example:8080');

  assert.deepEqual(result, {
    proxyRules: 'http=proxy.corp.example:8080;https=proxy.corp.example:8080',
    auth: null,
  });
});

test('extracts proxy credentials instead of embedding them in proxyRules', () => {
  const result = proxy.normalizeProxyInput('http://alice:pa%24%24@proxy.corp.example:8080');

  assert.equal(result.proxyRules, 'http=proxy.corp.example:8080;https=proxy.corp.example:8080');
  assert.deepEqual(result.auth, { username: 'alice', password: 'pa$$' });
});

test('keeps advanced Chromium proxy rule strings unchanged', () => {
  const result = proxy.normalizeProxyInput('http=proxy1:8080;https=proxy2:8443');

  assert.deepEqual(result, {
    proxyRules: 'http=proxy1:8080;https=proxy2:8443',
    auth: null,
  });
});

test('builds Electron session proxy config with explicit modes', () => {
  assert.deepEqual(proxy.buildSessionProxyConfig('direct'), { mode: 'direct' });
  assert.deepEqual(proxy.buildSessionProxyConfig('system'), { mode: 'system' });
  assert.deepEqual(
    proxy.buildSessionProxyConfig('custom', 'http://proxy.corp.example:8080', '<local>,*.corp.example'),
    {
      mode: 'fixed_servers',
      proxyRules: 'http=proxy.corp.example:8080;https=proxy.corp.example:8080',
      proxyBypassRules: '<local>,*.corp.example',
    },
  );
});
