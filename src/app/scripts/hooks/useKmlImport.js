import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import GeotabContext from '../contexts/Geotab';
import {
  DEFAULT_OPTIONS,
  addSystemZoneTypes,
  applyOptionsToZone,
  isValidZone,
  parseKmlText,
  serializeFailedZones,
  toZoneEntity
} from '../domain/kmlParser';
import {
  getGroupFilter,
  getZoneTypes,
  importZones,
  takeBackgroundResults
} from '../services/importApi';

let nextImportInstance = 0;

const readFile = (file) => {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
};

const copyDefaultOptions = () => ({
  ...DEFAULT_OPTIONS,
  zoneTypes: [...DEFAULT_OPTIONS.zoneTypes],
  zoneColor: { ...DEFAULT_OPTIONS.zoneColor }
});

const renumberZones = (zones, startIndex, sessionId) => zones.map((zone, index) => ({
  ...zone,
  id: `zone-${startIndex + index}`,
  rowId: `zone-${startIndex + index}`,
  sessionId
}));

const updateImportedZone = (zones, result) => zones.map((zone) => {
  if (zone.rowId !== result.rowId || zone.sessionId !== result.sessionId) return zone;
  if (result.zoneId !== undefined && result.zoneId !== null && result.zoneId !== '') {
    return {
      ...zone,
      selected: false,
      imported: true,
      importError: null,
      importedZoneId: result.zoneId
    };
  }
  return { ...zone, importError: result.error || 'Zone could not be imported.' };
});

const isSelectableZone = (zone) => isValidZone(zone) && !zone.imported;

const useKmlImport = () => {
  const { geotabApi, geotabState, focusVersion } = useContext(GeotabContext);
  const [zones, setZones] = useState([]);
  const [options, setOptions] = useState(copyDefaultOptions);
  const [zoneTypes, setZoneTypes] = useState([]);
  const [isLoadingZoneTypes, setIsLoadingZoneTypes] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hideImported, setHideImported] = useState(false);
  const isMounted = useRef(true);
  const instanceId = useRef(`import-${++nextImportInstance}`);
  const uploadNumber = useRef(0);
  const currentSessionId = useRef(`${instanceId.current}-initial`);

  useEffect(() => () => {
    isMounted.current = false;
  }, []);

  useEffect(() => {
    const results = takeBackgroundResults(currentSessionId.current);
    if (results.length) {
      setZones((current) => results.reduce(updateImportedZone, current));
    }
    const groups = getGroupFilter(geotabState);
    setZones((current) => current.map((zone) => ({ ...zone, groups })));
  }, [focusVersion, geotabState]);

  const clear = useCallback(() => {
    setZones([]);
    setError('');
    setNotice('');
    setProgress(0);
    setHideImported(false);
  }, []);

  const loadZoneTypes = useCallback(async () => {
    if (zoneTypes.length || isLoadingZoneTypes || !geotabApi) return;
    setIsLoadingZoneTypes(true);
    const values = await getZoneTypes(geotabApi);
    if (isMounted.current) {
      setZoneTypes(addSystemZoneTypes(values));
      setIsLoadingZoneTypes(false);
    }
  }, [geotabApi, isLoadingZoneTypes, zoneTypes.length]);

  const parseFiles = useCallback(async (files) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    const sessionId = `${instanceId.current}-${++uploadNumber.current}`;
    currentSessionId.current = sessionId;
    clear();
    setIsParsing(true);
    const parsedZones = [];
    const errors = [];

    for (const file of selectedFiles) {
      try {
        const text = await readFile(file);
        const fileZones = parseKmlText(text, {
          fileName: file.name,
          options,
          groups: getGroupFilter(geotabState)
        });
        parsedZones.push(...renumberZones(fileZones, parsedZones.length, sessionId));
      } catch (parseError) {
        errors.push(parseError.message || `Could not read ${file.name}.`);
      }
    }

    if (isMounted.current) {
      if (currentSessionId.current === sessionId) {
        setZones(parsedZones);
        setError(errors.join(' '));
        setIsParsing(false);
      }
    }
  }, [clear, geotabState, options]);

  const applyOptions = useCallback((nextOptions) => {
    const normalized = {
      ...nextOptions,
      corridorWidth: Number(nextOptions.corridorWidth),
      zoneSize: Number(nextOptions.zoneSize),
      zoneColor: { ...nextOptions.zoneColor },
      zoneTypes: [...nextOptions.zoneTypes]
    };
    setOptions(normalized);
    setZones((current) => current.map((zone) => applyOptionsToZone(
      zone,
      normalized,
      getGroupFilter(geotabState)
    )));
    setError('');
  }, [geotabState]);

  const setDefaults = useCallback(() => {
    const defaults = copyDefaultOptions();
    applyOptions(defaults);
    return defaults;
  }, [applyOptions]);

  const toggleZone = useCallback((rowId) => {
    setZones((current) => current.map((zone) => (
      zone.rowId === rowId && isSelectableZone(zone) ? { ...zone, selected: !zone.selected } : zone
    )));
  }, []);

  const selection = useMemo(() => ({
    all: zones.some(isSelectableZone) && zones.filter(isSelectableZone).every((zone) => zone.selected),
    selected: zones.filter((zone) => zone.selected && isSelectableZone(zone)).map((zone) => zone.rowId)
  }), [zones]);

  const updateSelection = useCallback((nextSelection, tableZones) => {
    const tableIds = new Set(tableZones.map((zone) => zone.rowId));
    const currentIds = new Set(zones.filter((zone) => zone.selected && isSelectableZone(zone)).map((zone) => zone.rowId));
    tableIds.forEach((id) => currentIds.delete(id));
    const incoming = nextSelection.all
      ? tableZones.filter(isSelectableZone).map((zone) => zone.rowId)
      : nextSelection.selected.filter((id) => tableZones.some((zone) => zone.rowId === id && isSelectableZone(zone)));
    incoming.forEach((id) => currentIds.add(id));
    setZones((current) => current.map((zone) => ({
      ...zone,
      selected: isSelectableZone(zone) && currentIds.has(zone.rowId)
    })));
  }, [zones]);

  const selectAll = useCallback((checked) => {
    setZones((current) => current.map((zone) => ({
      ...zone,
      selected: checked && isSelectableZone(zone)
    })));
  }, []);

  const importSelected = useCallback(async () => {
    const selected = zones.filter((zone) => zone.selected && isSelectableZone(zone));
    if (!selected.length) {
      setError('Select at least one valid zone to import.');
      return;
    }
    if (!geotabApi) {
      setError('MyGeotab is not ready to import zones.');
      return;
    }

    setError('');
    setNotice('');
    setIsImporting(true);
    setProgress(0);
    let importedCount = 0;
    let failedCount = 0;
    const currentGroups = getGroupFilter(geotabState);
    const sessionId = selected[0].sessionId;

    await importZones(
      geotabApi,
      selected.map((zone) => ({
        rowId: zone.rowId,
        entity: toZoneEntity({ ...zone, groups: currentGroups })
      })),
      (completed, total) => setProgress((current) => Math.min(100, current + completed / total * 100)),
      (result) => {
        if (result.zoneId !== undefined && result.zoneId !== null && result.zoneId !== '') importedCount += 1;
        else failedCount += 1;
        setZones((current) => updateImportedZone(current, result));
      },
      () => isMounted.current,
      sessionId
    );

    if (isMounted.current) {
      setIsImporting(false);
      setProgress(100);
      setNotice(failedCount === 0
        ? `${importedCount} ${importedCount === 1 ? 'zone' : 'zones'} imported successfully.`
        : `${importedCount} imported successfully; ${failedCount} failed.`);
    }
  }, [geotabApi, geotabState, zones]);

  const downloadFailed = useCallback(() => {
    const contents = serializeFailedZones(zones);
    const blob = new Blob([contents], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'not_imported.kml';
    link.click();
    URL.revokeObjectURL(url);
  }, [zones]);

  const validZones = useMemo(() => zones.filter(isSelectableZone), [zones]);
  const failedZones = useMemo(() => zones.filter((zone) => zone.error || zone.importError), [zones]);
  const visibleZones = useMemo(
    () => (hideImported ? zones.filter((zone) => !zone.imported) : zones),
    [hideImported, zones]
  );

  return {
    zones,
    visibleZones,
    polygonZones: visibleZones.filter((zone) => zone.geometryType === 'Polygon' || zone.geometryType === 'LineString'),
    pointZones: visibleZones.filter((zone) => zone.geometryType === 'Point'),
    validZones,
    failedZones,
    options,
    zoneTypes,
    isLoadingZoneTypes,
    isParsing,
    isImporting,
    progress,
    error,
    notice,
    hideImported,
    selection,
    setHideImported,
    setNotice,
    loadZoneTypes,
    parseFiles,
    clear,
    applyOptions,
    setDefaults,
    toggleZone,
    updateSelection,
    selectAll,
    importSelected,
    downloadFailed
  };
};

export default useKmlImport;
