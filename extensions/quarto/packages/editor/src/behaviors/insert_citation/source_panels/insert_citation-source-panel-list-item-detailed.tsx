/*
 * insert_citation-source-panel-list-item.ts
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
import { ListChildComponentProps } from 'react-window';

import { OutlineButton } from '../../../api/widgets/button';

import { CitationSourcePanelListItemData } from './insert_citation-source-panel-list';

import './insert_citation-source-panel-list-item-detailed.css';

export const CitationSourcePanelListItemDetailed = (props: ListChildComponentProps) => {
  const citationListData: CitationSourcePanelListItemData = props.data;

  const citationEntry = citationListData.citations[props.index];

  // Wheher this item is selected
  const selected = citationListData.showSelection && props.index === citationListData.selectedIndex;

  // Whether this item is already in the list of items to add
  // If the item is selected, it is always a candidate to be added explicitly to the list
  const alreadyAdded = citationListData.citationsToAdd.map(src => src.id).includes(citationEntry.id) && !selected;

  const onButtonClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();

    if (alreadyAdded) {
      citationListData.onRemoveCitation(citationEntry);
    } else {
      citationListData.onAddCitation(citationEntry);
    }
  };

  const onItemClick = () => {
    citationListData.onSelectedIndexChanged(props.index);
  };

  const onDoubleClick = () => {
    citationListData.onAddCitation(citationEntry);
    citationListData.onConfirm();
  };

  const secondLine = [citationEntry.date, citationEntry.journal].filter(text => text).join(', ');
  const thirdLine = citationEntry.authors(80);

  return (
    <div
      onMouseDown={onItemClick}
      onDoubleClick={onDoubleClick}
      className="pm-insert-citation-source-panel-item-detailed"
      style={props.style}
    >
      <div
        className={`pm-insert-citation-source-panel-item-detailed-border ${selected ? 'pm-list-item-selected' : ''}`}
      >
        <div className="pm-insert-citation-source-panel-item-detailed-container">
          <div className="pm-insert-citation-source-panel-item-detailed-type">
            {citationEntry.imageAdornment ? (
              <img
                className="pm-insert-citation-source-panel-item-detailed-adorn pm-block-border-color pm-background-color"
                src={citationEntry.imageAdornment}
                draggable="false"
              />
            ) : (
              undefined
            )}
            <img
              className="pm-insert-citation-source-panel-item-detailed-icon pm-block-border-color"
              src={citationEntry.image}
              draggable="false"
            />
          </div>
          <div className="pm-insert-citation-source-panel-item-detailed-summary">
            <div className="pm-insert-citation-source-panel-item-detailed-title pm-fixedwidth-font pm-text-color">
              {citationEntry.title}
            </div>
            <div className="pm-insert-citation-source-panel-item-detailed-subtitle-text pm-text-color">
              {secondLine}
            </div>
            <div className="pm-insert-citation-source-panel-item-detailed-subtitle-text pm-text-color">{thirdLine}</div>
            <div className="pm-insert-citation-source-panel-item-detailed-subtitle-text pm-text-color">
              <a href={`https://doi.org/${citationEntry.doi}`} target="_new">
                {citationEntry.doi}
              </a>
            </div>
          </div>
          <div className="pm-insert-citation-source-panel-item-detailed-button">
            <OutlineButton
              tabIndex={citationListData.preventFocus ? -1 : 0}
              style={{ width: '24px', height: '24px' }}
              title={alreadyAdded ? '-' : '+'}
              onClick={onButtonClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
