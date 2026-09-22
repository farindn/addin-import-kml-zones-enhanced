import React, { useMemo, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Header,
  IconSettings1,
  PageLayout,
  ProgressBar,
  ProgressBarType,
  ProgreesBarSize
} from '@geotab/zenith';
import useKmlImport from '../hooks/useKmlImport';
import OptionsPanel from './OptionsPanel';
import UploadDropzone from './UploadDropzone';
import ZoneTable from './ZoneTable';

const DISCLAIMER = 'This tool is provided as an example and is available on an As-Is basis. You must assume all the risks and costs associated with the use of the sample tool, including, without limitation, any damage to any equipment, software, information or data. In addition, we are not obligated to provide any maintenance, technical or other support for the sample tool.';

const ImportPage = () => {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const optionsTriggerRef = useRef(null);
  const {
    zones,
    polygonZones,
    pointZones,
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
    loadZoneTypes,
    parseFiles,
    clear,
    applyOptions,
    setDefaults,
    updateSelection,
    selectAll,
    importSelected,
    downloadFailed
  } = useKmlImport();

  const hasSelection = selection.selected.length > 0;
  const allSelected = selection.all;
  const isBusy = isParsing || isImporting;
  const isSearching = false;
  const statusMessage = useMemo(() => {
    if (isParsing) return 'Reading KML files.';
    if (isImporting) return `Importing zones. ${Math.round(progress)} percent complete.`;
    if (zones.length === 0) return 'No KML zones loaded.';
    return `${zones.length} zones loaded. ${selection.selected.length} selected.`;
  }, [isImporting, isParsing, progress, selection.selected.length, zones.length]);

  return (
    <PageLayout id="importKmlZonesPage">
      <Header>
        <Header.Title pageName="Import KML Zones" />
        <Header.Button
          id="importKmlZonesOptions"
          icon={IconSettings1}
          ref={optionsTriggerRef}
          important
          title="Configure zone import options"
          onClick={() => setIsOptionsOpen(true)}
        >
          Options
        </Header.Button>
        <Header.Button
          id="importKmlZonesClear"
          title="Clear the current KML file and zones"
          disabled={!zones.length || isBusy}
          onClick={clear}
        >
          Clear
        </Header.Button>
      </Header>

      <div className="kml-page">
        <Banner type="info" icon multiline size="M" header="Sample add-in/tool">
          {`— ${DISCLAIMER}`}
        </Banner>

        <p className="kml-version">Version 3.5.2</p>

        <div className="kml-mobile-actions" aria-label="KML page actions">
          <Button
            ref={optionsTriggerRef}
            type="secondary"
            htmlType="button"
            onClick={() => setIsOptionsOpen(true)}
          >
            Options
          </Button>
          <Button type="tertiary" htmlType="button" disabled={!zones.length || isBusy} onClick={clear}>
            Clear
          </Button>
        </div>

        <UploadDropzone disabled={isBusy} onFiles={parseFiles} />

        {error && (
          <Banner type="error" icon multiline size="M" header="The KML file needs attention">
            {error}
          </Banner>
        )}

        {notice && (
          <Banner type="success" icon multiline size="M" header="Import complete">
            {notice}
          </Banner>
        )}

        {isImporting && (
          <div className="kml-progress" aria-label="Zone import progress">
            <ProgressBar
              min={0}
              max={100}
              now={progress}
              size={ProgreesBarSize.Small}
              type={ProgressBarType.Average}
            />
            <span>{Math.round(progress)}%</span>
          </div>
        )}

        {zones.length > 0 && (
          <div className="kml-import-toolbar" aria-label="Imported zone actions">
            <Button type="tertiary" htmlType="button" onClick={() => selectAll(!allSelected)}>
              {allSelected ? 'Clear selection' : 'Select all'}
            </Button>
            <Button
              type="tertiary"
              htmlType="button"
              onClick={() => setHideImported(!hideImported)}
              disabled={!zones.some((zone) => zone.imported)}
            >
              {hideImported ? 'Show imported' : 'Hide imported'}
            </Button>
            <Button
              type="tertiary"
              htmlType="button"
              onClick={downloadFailed}
              disabled={!failedZones.length}
            >
              Save not imported zones to KML
            </Button>
            <Button
              type="primary"
              htmlType="button"
              onClick={importSelected}
              disabled={!validZones.length || !hasSelection || isBusy}
            >
              Import selected zones
            </Button>
          </div>
        )}

        {zones.length > 0 && (
          <div className="kml-tables">
            <ZoneTable
              pageName="importKmlPolygonZones"
              title="Polygon & Route Corridor Zones"
              zones={polygonZones}
              selection={selection}
              onSelectionChange={updateSelection}
              isLoading={isParsing}
              isSearching={isSearching}
            />
            <ZoneTable
              pageName="importKmlPointZones"
              title="Point Zones"
              zones={pointZones}
              selection={selection}
              onSelectionChange={updateSelection}
              isLoading={isParsing}
              isSearching={isSearching}
            />
          </div>
        )}
      </div>

      <div className="kml-sr-only" role="status" aria-live="polite">{statusMessage}</div>

      <OptionsPanel
        isOpen={isOptionsOpen}
        onClose={() => setIsOptionsOpen(false)}
        options={options}
        zoneTypes={zoneTypes}
        isLoadingZoneTypes={isLoadingZoneTypes}
        loadZoneTypes={loadZoneTypes}
        onApply={applyOptions}
        onDefaults={setDefaults}
        triggerRef={optionsTriggerRef}
      />
    </PageLayout>
  );
};

export default ImportPage;
