import React, { useState } from 'react';
import { IconUpload } from '@geotab/zenith';

const UploadDropzone = ({ disabled, onFiles }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    if (!disabled) onFiles(event.dataTransfer.files);
  };

  return (
    <label
      className={`dragAndDropUploader uploaderElementsContainer${isDragging ? ' hoverArea' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        className="uploadFileElement"
        type="file"
        accept=".kml,application/vnd.google-earth.kml+xml,application/xml,text/xml"
        multiple
        disabled={disabled}
        aria-label="Choose KML files"
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <IconUpload className="kml-upload-icon" />
      <span className="dragAndDropTitle">
        {disabled ? 'Import in progress' : 'Drop your files here or click to select them'}
      </span>
      <span className="kml-upload-hint">
        Accepts .kml from Google My Maps, including route (LineString) exports
      </span>
    </label>
  );
};

export default UploadDropzone;
