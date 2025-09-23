/*
 * insert_citation-picker-bibliography.tsx
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import React from 'react';

import { EditorUI } from '../../api/ui-types';
import { changeExtension } from '../../api/path';
import { WidgetProps } from '../../api/widgets/react';
import { TextInput } from '../../api/widgets/text';
import { SelectInput } from '../../api/widgets/select';
import { BibliographyFile, BibliographyType } from '../../api/bibliography/bibliography';

import './insert_citation-bibliography-picker.css';

export interface CitationBiblographyPickerProps extends WidgetProps {
  bibliographyTypes: BibliographyType[];
  bibliographyFiles: BibliographyFile[];
  onBiblographyFileChanged: (file: BibliographyFile) => void;
  createBibliographyFileName: string;
  onCreateBibliographyFileNameChanged: (fileName: string) => void;
  ui: EditorUI;
}

export const CitationBibliographyPicker: React.FC<CitationBiblographyPickerProps> = props => {
  // Selection of file from list
  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const index = e.target.selectedIndex;
    props.onBiblographyFileChanged(props.bibliographyFiles[index]);
  };

  // Change to the file we should create
  const onTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    props.onCreateBibliographyFileNameChanged(text);
  };

  // File type change
  const onTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const index = e.target.selectedIndex;
    const type = props.bibliographyTypes[index];
    const newPath = changeExtension(props.createBibliographyFileName, type.extension);
    props.onCreateBibliographyFileNameChanged(newPath);
    props.ui.prefs.setBibliographyDefaultType(type.extension);
  };

  return (
    <div className="pm-citation-bibliography-picker-container" style={props.style}>
      <div className="pm-citation-bibliography-picker-label pm-text-color">
        {props.bibliographyFiles.length > 0
          ? props.ui.context.translateText('Add to:')
          : props.ui.context.translateText('Create:')}
      </div>
      {props.bibliographyFiles.length > 0 ? (
        <SelectInput onChange={onChange}>
          {props.bibliographyFiles.map(file => (
            <option key={file.fullPath} value={file.fullPath}>
              {file.displayPath}
            </option>
          ))}
        </SelectInput>
      ) : (
        <div className="pm-citation-bibliography-picker-create-controls">
          <TextInput
            width="100"
            tabIndex={0}
            className="pm-citation-bibliography-picker-textbox pm-block-border-color"
            placeholder={props.ui.context.translateText('Bibligraphy file name')}
            value={props.createBibliographyFileName}
            onChange={onTextChange}
          />
          <div className="pm-citation-bibliography-format-label pm-text-color">
            {props.ui.context.translateText('Format:')}
          </div>
          <SelectInput
            onChange={onTypeChange}
            defaultValue={props.bibliographyTypes.find(bibType => bibType.default)?.extension}
          >
            {props.bibliographyTypes.map(bibType => (
              <option key={bibType.extension} value={bibType.extension}>
                {bibType.displayName}
              </option>
            ))}
          </SelectInput>
        </div>
      )}
    </div>
  );
};
