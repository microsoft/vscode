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

import './insert_citation-source-panel-list-item.css';

export const CitationSourcePanelListItem = (props: ListChildComponentProps) => {
  const citationListData: CitationSourcePanelListItemData = props.data;

  const citationEntry = citationListData.citations[props.index];

  // NOTE: Could consider making this length dynamic to account for item width
  const maxIdLength = 30;
  const id =
    citationEntry.id.length > maxIdLength ? `@${citationEntry.id.substr(0, maxIdLength - 1)}…` : `@${citationEntry.id}`;
  const authorWidth = Math.max(10, 50 - id.length);

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

  const onItemClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      citationListData.onAddCitation(citationEntry);
    } else {
      citationListData.onSelectedIndexChanged(props.index);
    }
  };

  const onDoubleClick = () => {
    citationListData.onAddCitation(citationEntry);
    citationListData.onConfirm();
  };

  let authors = "";
  try {
    authors = citationEntry.authors(authorWidth);
  } catch (er) {
    // Failed to format the authors, just ignore this.
  }

  return (
    <div
      onMouseDown={onItemClick}
      onDoubleClick={onDoubleClick}
      className="pm-insert-citation-source-panel-item"
      style={props.style}
    >
      <div className={`pm-insert-citation-source-panel-item-border ${selected ? 'pm-list-item-selected' : ''}`}>
        <div className="pm-insert-citation-source-panel-item-container">
          <div className="pm-insert-citation-source-panel-item-type">
            {citationEntry.imageAdornment ? (
              <img
                className="pm-insert-citation-source-panel-item-adorn pm-block-border-color pm-background-color"
                src={citationEntry.imageAdornment}
                draggable="false"
              />
            ) : (
                undefined
              )}
            <img
              className="pm-insert-citation-source-panel-item-icon pm-block-border-color"
              src={citationEntry.image}
              draggable="false"
            />
          </div>
          <div className="pm-insert-citation-source-panel-item-summary">
            <div className="pm-insert-citation-source-panel-item-id">
              <div className="pm-insert-citation-source-panel-item-title pm-fixedwidth-font pm-text-color">{id}</div>
              <div className="pm-insert-citation-source-panel-item-detail pm-text-color">
                {authors} {citationEntry.date}
              </div>
            </div>
            <div className="pm-insert-citation-source-panel-item-subtitle-text pm-text-color">
              {citationEntry.title}
            </div>
          </div>
          <div className="pm-insert-citation-source-panel-item-button">
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
