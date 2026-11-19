const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const docs = path.join(__dirname, '../storage-consulting/calculator');

function setup(languages, missing = {}) {
  const requests = [];
  const context = vm.createContext({
    console, navigator: { languages },
    fetch: async (url) => {
      requests.push(url);
      const language = path.basename(url, '.json');
      if (missing[language] === true) return { ok: false, status: 404 };
      const data = JSON.parse(fs.readFileSync(path.join(docs, url), 'utf8'));
      for (const key of missing[language] || []) delete data[key];
      return { ok: true, json: async () => data };
    },
  });
  for (const file of ['vendor/i18next.min.js', 'i18n.js', 'pricing.js', 'lab.js']) {
    vm.runInContext(fs.readFileSync(path.join(docs, file), 'utf8'), context);
  }
  return { context, requests, run: (code) => vm.runInContext(code, context) };
}

test('regional browser language, interpolation, lazy loading and switching', async () => {
  const app = setup(['fr-FR', 'de-DE', 'en-US']);
  await app.run('initializeTranslations()');
  assert.equal(app.run('i18next.resolvedLanguage'), 'de');
  assert.equal(app.run('t("step", { current: 2, total: 5 })'), 'Schritt 2 von 5');
  assert.deepEqual(app.requests, ['locales/en.json', 'locales/de.json']);
  await app.run('selectLanguage("ar")');
  assert.equal(app.run('i18next.dir()'), 'rtl');
  await app.run('selectLanguage("de")');
  assert.equal(app.requests.length, 3);
});

test('missing translation falls back to English', async () => {
  const app = setup(['de'], { de: ['receipt'] });
  await app.run('initializeTranslations()');
  assert.equal(app.run('t("receipt")'), 'Estimated monthly storage cost');
});

test('unsupported browser language and unavailable file fall back to English', async () => {
  const app = setup(['ja-JP'], { ar: true });
  await app.run('initializeTranslations()');
  assert.equal(app.run('i18next.resolvedLanguage'), 'en');
  await app.run('selectLanguage("ar")');
  assert.equal(app.run('i18next.resolvedLanguage'), 'en');
});

test('dropdown handler renders German and Arabic and preserves model state', async () => {
  const app = setup(['en']);
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      dataset: {}, children: [], listeners: {}, value: '',
      addEventListener(event, handler) { this.listeners[event] = handler; },
      append(child) { this.children.push(child); },
      setAttribute() {}, removeAttribute() {},
    });
    return nodes.get(id);
  }
  const receipt = node('receipt-title');
  receipt.dataset.t = 'receipt';
  app.context.document = {
    documentElement: {}, getElementById: node,
    createElement: () => node(`button-${nodes.size}`),
    querySelectorAll: (selector) => selector === '[data-t]' ? [receipt] : [],
  };
  await app.run('initializeLab()');
  app.run('state.gb = 50');
  app.run('showStep(4)');
  await node('controls').listeners.input({ target: { dataset: { cloud: 'provider' }, value: 'gcp' } });
  assert.equal(app.run('state.region'), 'us-central1');
  assert.match(node('cloud-context').textContent, /Google Cloud Storage/);
  app.run('showStep(5)');
  assert.equal(node('source-summary').open, true);
  await node('controls').listeners.input({ target: { dataset: { source: 'service' }, value: 'rds' } });
  await node('controls').listeners.input({ target: { dataset: { source: 'extras' }, value: '5', validity: { valid: true } } });
  assert.equal(node('source-total').textContent, '$\u00a018.9800');
  const selector = node('language');
  for (const [language, text, dir] of [
    ['de', 'Geschätzte monatliche Speicherkosten', 'ltr'],
    ['ar', 'تكلفة التخزين الشهرية المقدرة', 'rtl'],
    ['en', 'Estimated monthly storage cost', 'ltr'],
  ]) {
    selector.value = language;
    await selector.listeners.change({ target: selector });
    assert.equal(receipt.textContent, text);
    assert.equal(app.context.document.documentElement.lang, language);
    assert.equal(app.context.document.documentElement.dir, dir);
    assert.equal(selector.disabled, false);
    assert.equal(app.run('state.gb'), 50);
  }
});

test('age-based archive threshold respects retention with full precision', () => {
  const app = setup(['en']);
  const baseline = app.run('calculate(defaults)');
  assert.ok(baseline.archived > 0);
  assert.ok(Math.abs(baseline.baseline - 7 * 0.21420419216156006) < 1e-12);
  assert.equal(app.run('archiveShare({ archiveDays: 90, retentionYears: 1 })'), 275 / 365);
  assert.equal(app.run('archiveShare({ archiveDays: 90, retentionYears: 0 })'), 0);
  assert.equal(app.run('archiveShare({ archiveDays: 365, retentionYears: 1 })'), 0);
  assert.equal(app.run('archiveShare({ archiveDays: 0, retentionYears: 1 })'), 1);
  const archived = app.run('calculate({ ...defaults, archiveDays: 0 })');
  assert.ok(Math.abs(archived.estimate - 7 * 10e9 / 2 ** 30 * 0.00099) < 1e-12);
});

test('provider and region rates change the estimate without changing the AWS baseline', () => {
  const app = setup(['en']);
  const east = app.run('calculate(defaults)');
  const west = app.run('calculate({ ...defaults, region: "us-west-1" })');
  const google = app.run('calculate({ ...defaults, provider: "gcp", region: "us-central1" })');
  assert.equal(west.baseline, east.baseline);
  assert.ok(west.estimate > east.estimate);
  assert.ok(google.estimate < east.estimate);
  const archive = app.run('calculate({ ...defaults, region: "us-west-1", archiveDays: 0 })');
  assert.ok(Math.abs(archive.estimate - 7 * 10e9 / 2 ** 30 * 0.002) < 1e-12);
});

test('database estimates include the correct billing meters independently of file compression', () => {
  const app = setup(['en']);
  const estimate = (service, fields = {}) => app.run(`calculateSource({ ...sourceDefaults, service: ${JSON.stringify(service)}, ...${JSON.stringify(fields)} })`);
  assert.ok(Math.abs(estimate('rds').total - 13.98) < 1e-10);
  assert.ok(Math.abs(estimate('rds', { size: 100 }).storage - 11.5) < 1e-10);
  assert.equal(estimate('dynamodb').total, 3.25);
  const bigquery = estimate('bigquery', { extras: 5 });
  assert.ok(Math.abs(bigquery.total - (10 * 0.000031507 * 730 + 6.25 + 5)) < 1e-10);
  assert.equal(estimate('mongodb', { cluster: 123, extras: 7 }).total, 130);
  app.run('state.format = "parquet"; state.retentionYears = 14; state.archiveDays = 0');
  assert.equal(estimate('dynamodb').total, 3.25);
});

test('all locale bundles contain every key, including new provider and source steps', () => {
  const english = JSON.parse(fs.readFileSync(path.join(docs, 'locales/en.json')));
  for (const language of ['de', 'ar']) {
    const bundle = JSON.parse(fs.readFileSync(path.join(docs, `locales/${language}.json`)));
    assert.deepEqual(Object.keys(bundle).sort(), Object.keys(english).sort());
  }
});


test('retention defaults to seven years, permits fourteen, and scales steady-state storage', async () => {
  const app = setup(['en']);
  await app.run('initializeTranslations()');
  assert.equal(app.run('defaults.retentionYears'), 7);
  const control = app.run('steps[3]()');
  assert.match(control, /min="1" max="14" value="7"/);
  assert.match(control, /id="archiveDays"/);
  assert.equal(app.run('steps.length'), 6);
  const seven = app.run('calculate({ ...defaults, archive: 0 })');
  const fourteen = app.run('calculate({ ...defaults, archive: 0, retentionYears: 14 })');
  assert.equal(fourteen.estimate, seven.estimate * 2);
  assert.equal(fourteen.baseline, seven.baseline * 2);
  assert.equal(app.run('archiveShare({ archiveDays: 90, retentionYears: 7 })'), (7 * 365 - 90) / (7 * 365));
});
