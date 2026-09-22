import React, { useMemo } from 'react';
import { MainColumn, Table, useMobile } from '@geotab/zenith';
import { isValidZone } from '../domain/kmlParser';

const ZoneTable = ({
  pageName,
  title,
  zones,
  selection,
  onSelectionChange,
  isLoading,
  isSearching
}) => {
  const isMobile = useMobile();
  const columns = useMemo(() => [
    {
      id: 'name',
      title: 'Name',
      sortable: true,
      alwaysVisible: true,
      columnComponent: new MainColumn('name', isMobile, {
        mainText: {
          createText: (zone) => zone.name || 'Unnamed zone'
        },
        descriptionText: {
          createDescription: (zone) => {
            if (zone.imported) return 'Zone successfully imported.';
            if (zone.importError) return zone.importError;
            return zone.comment || undefined;
          }
        }
      })
    },
    {
      id: 'description',
      title: 'Description',
      visible: !isMobile,
      columnComponent: { render: (zone) => zone.comment || '—' }
    },
    {
      id: 'color',
      title: 'Color',
      columnComponent: {
        render: (zone) => (
          <span
            className="kml-color-swatch"
            title={`Zone color ${zone.fillColor.r}, ${zone.fillColor.g}, ${zone.fillColor.b}`}
            style={{
              backgroundColor: `rgb(${zone.fillColor.r} ${zone.fillColor.g} ${zone.fillColor.b} / ${zone.fillColor.a / 255})`
            }}
          />
        )
      }
    },
    {
      id: 'geometry',
      title: 'Type',
      visible: !isMobile,
      columnComponent: { render: (zone) => zone.geometryType }
    }
  ], [isMobile]);

  const selectable = useMemo(() => ({
    selection,
    onSelect: (next) => onSelectionChange(next, zones),
    checkboxInHeader: true,
    checkboxVisible: (zone) => isValidZone(zone) && !zone.imported,
    checkboxDisabled: (zone) => zone.imported,
    checkboxTitle: (zone) => `Select ${zone.name || 'zone'}`
  }), [onSelectionChange, selection, zones]);

  const emptyHeading = isSearching ? 'No zones match this view' : 'No zones in this section';
  const emptyDescription = isSearching
    ? 'Adjust the file or clear the current filter.'
    : 'Upload a KML file containing supported geometry to see zones here.';

  return (
    <section className="kml-table-section" aria-labelledby={`${pageName}-title`}>
      <h2 id={`${pageName}-title`} className="heading-06">{title}</h2>
      <Table
        entities={zones}
        columns={columns}
        isLoading={isLoading}
        selectable={selectable}
        flexible={{ pageName }}
      >
        <Table.Empty description={emptyDescription}>{emptyHeading}</Table.Empty>
      </Table>
    </section>
  );
};

export default ZoneTable;
