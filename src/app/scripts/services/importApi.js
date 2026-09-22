const ITEMS_PER_CALL = 50;
const backgroundResults = [];

const callApi = (api, method, params) => new Promise((resolve, reject) => {
  api.call(method, params, resolve, reject);
});

const multiCall = (api, calls) => new Promise((resolve, reject) => {
  api.multiCall(calls, resolve, reject);
});

export const getZoneTypes = async (api) => {
  try {
    return await callApi(api, 'Get', { typeName: 'ZoneType' });
  } catch (error) {
    return [];
  }
};

export const importZones = async (api, zones, onProgress, onResult, isMounted, sessionId = 'default') => {
  if (!zones.length) return;

  const batches = [];
  for (let index = 0; index < zones.length; index += ITEMS_PER_CALL) {
    batches.push(zones.slice(index, index + ITEMS_PER_CALL));
  }

  for (const batch of batches) {
    const calls = batch.map((zone) => ['Add', { typeName: 'Zone', entity: zone.entity }]);
    try {
      const response = await multiCall(api, calls);
      batch.forEach((zone, index) => {
        const zoneId = Array.isArray(response)
          ? response[index]
          : (batch.length === 1 ? response : undefined);
        const hasZoneId = zoneId !== undefined && zoneId !== null && zoneId !== '';
        deliverResult(
          !hasZoneId
            ? { rowId: zone.rowId, error: 'MyGeotab did not return a zone ID.' }
            : { rowId: zone.rowId, zoneId },
          onResult,
          isMounted,
          sessionId
        );
      });
    } catch (error) {
      batch.forEach((zone) => {
        deliverResult({ rowId: zone.rowId, error: String(error) }, onResult, isMounted, sessionId);
      });
    }
    onProgress(batch.length, zones.length);
  }
};

const deliverResult = (result, onResult, isMounted, sessionId) => {
  const scopedResult = { ...result, sessionId };
  if (isMounted()) {
    onResult(scopedResult);
  } else {
    backgroundResults.push(scopedResult);
  }
};

export const takeBackgroundResults = (sessionId) => {
  const results = [];
  backgroundResults.forEach((result) => {
    if (result.sessionId === sessionId) results.push(result);
  });
  // A mounted add-in is the only consumer. Discard other sessions so late
  // completions from unmounted instances cannot accumulate indefinitely.
  backgroundResults.splice(0, backgroundResults.length);
  return results;
};

export const getGroupFilter = (state) => {
  if (!state || typeof state.getGroupFilter !== 'function') return [];
  return state.getGroupFilter();
};

export { ITEMS_PER_CALL };
