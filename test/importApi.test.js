const assert = require('node:assert/strict');
const test = require('node:test');

require('@babel/register')({
  extensions: ['.js', '.jsx'],
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-react']
});

const { importZones, ITEMS_PER_CALL } = require('../src/app/scripts/services/importApi');

test('imports zones in batches of 50 and reports progress per batch', async () => {
  const calls = [];
  const results = [];
  const progress = [];
  const api = {
    multiCall(batch, success) {
      calls.push(batch);
      success(batch.map((_, index) => `id-${calls.length}-${index}`));
    }
  };
  const zones = Array.from({ length: ITEMS_PER_CALL + 1 }, (_, index) => ({
    rowId: `row-${index}`,
    entity: { name: `Zone ${index}` }
  }));

  await importZones(
    api,
    zones,
    (completed, total) => progress.push([completed, total]),
    (result) => results.push(result),
    () => true
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].length, ITEMS_PER_CALL);
  assert.equal(calls[1].length, 1);
  assert.equal(results.length, ITEMS_PER_CALL + 1);
  assert.deepEqual(progress, [[ITEMS_PER_CALL, ITEMS_PER_CALL + 1], [1, ITEMS_PER_CALL + 1]]);
});

test('marks every zone in a failed batch with the API error', async () => {
  const results = [];
  const api = {
    multiCall(batch, success, failure) {
      failure('permission denied');
    }
  };

  await importZones(
    api,
    [{ rowId: 'row-1', entity: { name: 'Blocked' } }],
    () => {},
    (result) => results.push(result),
    () => true
  );

  assert.deepEqual(results, [{ rowId: 'row-1', error: 'permission denied', sessionId: 'default' }]);
});
