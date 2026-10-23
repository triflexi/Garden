// Run the actual inline Node probes with controlled HTTP responses and no delays.
const fs = require('node:fs');
const path = require('node:path');
const scenario = process.env.SCENARIO;
const marker = (name) => path.join(process.env.FIXTURE, name);
const realSetTimeout = global.setTimeout;
global.setTimeout = (callback, _delay, ...args) => realSetTimeout(callback, 0, ...args);
let calls = 0;
global.fetch = async (url, options) => {
  if (!options?.signal) throw Error('Probe must have a timeout');
  calls++;
  if (url.includes('victoriametrics')) {
    if (scenario === 'metrics-fails' || calls === 1) throw Error('Metrics temporarily unavailable');
    const query = new URL(url).searchParams.get('query');
    if (query.includes('container_label_') && !query.includes('"audit-project"')) {
      throw Error('Wrong Compose project');
    }
    return { ok: true, json: async () => ({ status: 'success', data: { result: [{ value: [1, '1'] }] } }) };
  }
  if (url.includes('grafana')) {
    if (scenario === 'grafana-fails' || calls === 1) throw Error('Grafana temporarily unavailable');
    return { ok: true, json: async () => ({ dashboard: { panels: Array(15).fill({}) } }) };
  }
  if (url.endsWith('/metrics') && fs.existsSync(marker('db-stopped'))) {
    return { ok: true, text: async () => 'app_database_up 0\n' };
  }
  throw Error(`Unexpected HTTP request: ${url}`);
};
