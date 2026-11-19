"use strict";

// USD list-price snapshot checked 2026-11-19. Google hourly rates × 730 hours.
const cloudProfiles = {
  aws: {
    'us-east-1': { standard: 0.023, archive: 0.00099 },
    'us-west-1': { standard: 0.026, archive: 0.002 },
  },
  gcp: {
    'us-central1': { standard: 0.000027397 * 730, archive: 0.000001644 * 730 },
    'us-east1': { standard: 0.000027397 * 730, archive: 0.000001644 * 730 },
  },
};
const sourceDefaults = {
  service: 'bigquery', size: 10, query: 1, reads: 1, writes: 1,
  hourly: 0.016, provisioned: 20, storageRate: 0.115, cluster: 56.94, extras: 0,
};
const sourceState = { ...sourceDefaults };
const sourceLinks = {
  bigquery: 'https://cloud.google.com/bigquery/pricing',
  rds: 'https://aws.amazon.com/rds/postgresql/pricing/',
  dynamodb: 'https://aws.amazon.com/dynamodb/pricing/',
  mongodb: 'https://www.mongodb.com/pricing',
};
function selectedCloud(model) {
  return cloudProfiles[model.provider || 'aws'][model.region || 'us-east-1'];
}
function selectControl(key, label, values, selected, scope) {
  return `<label class="field">${label}<select data-${scope}="${key}">${values.map(([value, text]) =>
    `<option value="${value}" ${value === selected ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
}
function cloudControls() {
  return selectControl('provider', t('cloudProvider'), [['aws', 'AWS'], ['gcp', 'Google Cloud']], state.provider, 'cloud') +
    selectControl('region', t('cloudRegion'), Object.keys(cloudProfiles[state.provider]).map(region => [region, region === 'us' ? 'US (multi-region)' : region]), state.region, 'cloud') +
    `<p class="fine">${t('cloudScope')}</p>`;
}
function sourceNumber(key, min = 0, step = 'any') {
  return `<label class="field">${t('source.' + key)}<input type="number" min="${min}" step="${step}" data-source="${key}" value="${sourceState[key]}"></label>`;
}
function sourceControls() {
  const service = sourceState.service;
  let fields = sourceNumber('size');
  if (service === 'bigquery') fields += sourceNumber('query');
  if (service === 'dynamodb') fields += sourceNumber('reads') + sourceNumber('writes');
  if (service === 'rds') fields += sourceNumber('hourly') + sourceNumber('provisioned', 20) + sourceNumber('storageRate');
  if (service === 'mongodb') fields += sourceNumber('cluster');
  fields += sourceNumber('extras');
  return selectControl('service', t('sourceService'), Object.keys(sourceLinks).map(key => [key, t('service.' + key)]), service, 'source') +
    `<p class="fine">${t('source.' + service + 'Note')}</p>` + fields +
    `<a href="${sourceLinks[service]}" target="_blank" rel="noopener">${t('sourcePricing')}</a>`;
}
function calculateSource(model) {
  let storage = 0, usage = 0;
  switch (model.service) {
    case 'bigquery': storage = model.size * 0.000031507 * 730; usage = model.query * 6.25; break;
    case 'dynamodb': storage = model.size * 0.25; usage = model.reads * 0.125 + model.writes * 0.625; break;
    case 'rds': storage = Math.max(20, model.size, model.provisioned) * model.storageRate; usage = model.hourly * 730; break;
    case 'mongodb': usage = model.cluster; break;
    default: throw new Error('Unsupported source service');
  }
  return { storage, usage, extras: model.extras, total: storage + usage + model.extras };
}
function updateSourceTotals() {
  const cost = calculateSource(sourceState);
  byId('source-name').textContent = t('service.' + sourceState.service);
  byId('source-total').textContent = usd(cost.total);
  byId('source-storage').textContent = sourceState.service === 'mongodb' ? t('includedQuote') : usd(cost.storage);
  byId('source-usage').textContent = usd(cost.usage);
  byId('source-extras').textContent = usd(cost.extras);
  byId('combined-total').textContent = usd(cost.total + calculate(state).estimate);
}
