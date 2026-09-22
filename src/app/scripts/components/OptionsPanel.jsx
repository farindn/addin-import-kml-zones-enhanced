import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Modal, MobileSheet, useMobile } from '@geotab/zenith';

const colorToHex = ({ r, g, b }) => `#${[r, g, b]
  .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
  .join('')}`;

const hexToColor = (hex, alpha) => {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
    a: alpha
  };
};

const selectedTypeIds = (types) => types.map((type) => (typeof type === 'string' ? type : type.id));

const OptionsContent = ({
  draft,
  setDraft,
  zoneTypes,
  isLoadingZoneTypes,
  onApply,
  onDefaults,
  onClose
}) => {
  const selectedIds = selectedTypeIds(draft.zoneTypes);
  const corridorWidthInvalid = !Number.isFinite(Number(draft.corridorWidth))
    || Number(draft.corridorWidth) < 10
    || Number(draft.corridorWidth) > 50;
  const hasZoneType = selectedIds.length > 0;
  const transparency = Math.round(100 - (draft.zoneColor.a / 255) * 100);

  const toggleType = (id) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : selectedIds.concat(id);
    setDraft({ ...draft, zoneTypes: next });
  };

  const footer = (
    <div className="kml-options__actions">
      <Button type="tertiary" htmlType="button" onClick={onDefaults}>
        Set defaults
      </Button>
      <Button
        type="primary"
        htmlType="button"
        disabled={corridorWidthInvalid || !hasZoneType}
        onClick={() => onApply(draft)}
      >
        Apply
      </Button>
    </div>
  );

  return (
    <div className="kml-options">
      <p className="body-04 kml-options__intro">
        These settings apply to the zones in the current KML file. Route corridor width is measured
        on each side of a LineString route.
      </p>

      <fieldset className="kml-options__field">
        <legend>Zone types</legend>
        <div className="kml-options__type-grid">
          {isLoadingZoneTypes && <span className="body-04">Loading zone types...</span>}
          {!isLoadingZoneTypes && zoneTypes.map((type) => (
            <Checkbox
              key={type.id}
              checked={selectedIds.includes(type.id)}
              onChange={() => toggleType(type.id)}
              wrapped
            >
              {type.name}
            </Checkbox>
          ))}
        </div>
        {!hasZoneType && <span className="kml-field-error">Select at least one zone type.</span>}
      </fieldset>

      <fieldset className="kml-options__field">
        <legend>Color</legend>
        <div className="kml-options__color-row">
          <input
            id="kml-zone-color"
            type="color"
            value={colorToHex(draft.zoneColor)}
            aria-label="Zone fill color"
            onChange={(event) => setDraft({
              ...draft,
              zoneColor: hexToColor(event.target.value, draft.zoneColor.a)
            })}
          />
          <code>{colorToHex(draft.zoneColor)}</code>
        </div>
        <label htmlFor="kml-transparency">Transparency: {transparency}%</label>
        <input
          id="kml-transparency"
          className="kml-range"
          type="range"
          min="0"
          max="100"
          step="5"
          value={transparency}
          onChange={(event) => setDraft({
            ...draft,
            zoneColor: {
              ...draft.zoneColor,
              a: Math.round((100 - Number(event.target.value)) / 100 * 255)
            }
          })}
        />
      </fieldset>

      <fieldset className="kml-options__field">
        <legend id="kml-corridor-label">Route corridor width (m)</legend>
        <input
          id="kml-corridor-width"
          type="number"
          min="10"
          max="50"
          step="5"
          value={draft.corridorWidth}
          aria-labelledby="kml-corridor-label"
          aria-describedby="kml-corridor-help kml-corridor-error"
          onChange={(event) => setDraft({ ...draft, corridorWidth: event.target.value })}
        />
        <span id="kml-corridor-help" className="kml-helper-text">
          Applies to LineString routes only. Default: 15 m per side (30 m total).
        </span>
        {corridorWidthInvalid && (
          <span id="kml-corridor-error" className="kml-field-error">
            Enter a value between 10 and 50.
          </span>
        )}
      </fieldset>

      <fieldset className="kml-options__field">
        <legend>Indicate stops within zone</legend>
        <div className="kml-segmented-control" role="group" aria-label="Indicate stops within zone">
          <button
            type="button"
            className={draft.stoppedInsideZones ? 'is-selected' : ''}
            aria-pressed={draft.stoppedInsideZones}
            onClick={() => setDraft({ ...draft, stoppedInsideZones: true })}
          >
            Yes
          </button>
          <button
            type="button"
            className={!draft.stoppedInsideZones ? 'is-selected' : ''}
            aria-pressed={!draft.stoppedInsideZones}
            onClick={() => setDraft({ ...draft, stoppedInsideZones: false })}
          >
            No
          </button>
        </div>
      </fieldset>

      {footer}
    </div>
  );
};

const OptionsPanel = ({
  isOpen,
  onClose,
  options,
  zoneTypes,
  isLoadingZoneTypes,
  loadZoneTypes,
  onApply,
  onDefaults,
  triggerRef
}) => {
  const isMobile = useMobile();
  const [draft, setDraft] = useState(options);

  useEffect(() => {
    if (isOpen) {
      setDraft({ ...options, zoneTypes: [...options.zoneTypes], zoneColor: { ...options.zoneColor } });
      loadZoneTypes();
    }
  }, [isOpen, loadZoneTypes, options]);

  const content = useMemo(() => (
    <OptionsContent
      draft={draft}
      setDraft={setDraft}
      zoneTypes={zoneTypes}
      isLoadingZoneTypes={isLoadingZoneTypes}
      onApply={(next) => {
        const selectedTypes = selectedTypeIds(next.zoneTypes).map((id) => {
          const type = zoneTypes.find((candidate) => candidate.id === id);
          return type && !type.isSystem ? type : id;
        });
        onApply({ ...next, zoneTypes: selectedTypes });
        onClose();
      }}
      onDefaults={() => {
        const defaults = onDefaults();
        setDraft({ ...defaults, zoneTypes: [...defaults.zoneTypes], zoneColor: { ...defaults.zoneColor } });
      }}
      onClose={onClose}
    />
  ), [draft, isLoadingZoneTypes, onApply, onClose, onDefaults, setDraft, zoneTypes]);

  if (isMobile) {
    return (
      <MobileSheet
        id="kml-options-sheet"
        isOpen={isOpen}
        label="KML import options"
        triggerRef={triggerRef}
        onHidePanel={onClose}
        onCloseClick={onClose}
      >
        <MobileSheet.Title>Options</MobileSheet.Title>
        <MobileSheet.Content>{content}</MobileSheet.Content>
      </MobileSheet>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      title="Options"
      onClose={onClose}
      closeOnClickOutside
      maxWidth="560px"
      focus="primary"
    >
      {content}
      <Modal.PrimaryButton onClick={onClose}>Close</Modal.PrimaryButton>
    </Modal>
  );
};

export default OptionsPanel;
