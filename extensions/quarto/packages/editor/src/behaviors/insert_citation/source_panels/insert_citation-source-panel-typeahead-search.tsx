/*
 * insert_citation-source-panel-typeahead-search.tsx
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

import { EditorUI } from '../../../api/ui-types';
import { TextInput } from '../../../api/widgets/text';
import { WidgetProps } from '../../../api/widgets/react';

import './insert_citation-source-panel-typeahead-search.css';
import { CitationSourceList } from './insert_citation-source-panel-list';
import { CitationListEntry, CitationSourceListStatus } from './insert_citation-source-panel';
import { CitationSourcePanelListItem } from './insert_citation-source-panel-list-item';

export interface CitationSourceTypeaheadSearchPanelProps extends WidgetProps {
  height: number;
  citations: CitationListEntry[];
  citationsToAdd: CitationListEntry[];
  searchTerm: string;
  onSearchTermChanged: (searchTerm: string) => void;
  selectedIndex: number;
  onSelectedIndexChanged: (index: number) => void;
  onAddCitation: (citation: CitationListEntry) => void;
  onRemoveCitation: (citation: CitationListEntry) => void;
  onConfirm: VoidFunction;
  status: CitationSourceListStatus;
  statusMessage: string;
  ui: EditorUI;
}

// Height of textbox including border
const kTextBoxHeight = 30;

export const CitationSourceTypeheadSearchPanel = React.forwardRef<
  HTMLDivElement,
  CitationSourceTypeaheadSearchPanelProps
>((props: CitationSourceTypeaheadSearchPanelProps, ref) => {
  const listContainer = React.useRef<HTMLDivElement>(null);

  // Search the user search terms
  const searchChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    const search = e.target.value;
    props.onSearchTermChanged(search);
  };

  // Perform first load tasks
  const searchBoxRef = React.useRef<HTMLInputElement>(null);

  // If the user arrows down in the search text box, advance to the list of items
  const handleTextKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        listContainer.current?.focus();
        break;
    }
  };

  // Used to focus the search box
  const focusSearch = () => {
    searchBoxRef.current?.focus();
  };

  const addCitation = (citation: CitationListEntry) => {
    // Add the citation and reset selection
    props.onAddCitation(citation);
    focusSearch();
  };

  // On focus, select the search term for overtype
  const searchBoxFocused = (event: React.FocusEvent<HTMLInputElement>) => {
    event.target.select();
  };

  return (
    <div
      style={props.style}
      className="pm-insert-citation-panel-search pm-block-border-color pm-background-color"
      ref={ref}
      tabIndex={-1}
      onFocus={focusSearch}
    >
      <div className="pm-insert-citation-search-panel-textbox-container">
        <TextInput
          width="100%"
          iconAdornment={props.ui.images.search}
          tabIndex={0}
          className="pm-insert-citation-panel-search-textbox pm-block-border-color"
          placeholder={props.ui.context.translateText('Search for citation')}
          onKeyDown={handleTextKeyDown}
          onChange={searchChanged}
          onFocus={searchBoxFocused}
          value={props.searchTerm}
          ref={searchBoxRef}
        />
      </div>
      <CitationSourceList
        height={props.height - kTextBoxHeight}
        citations={props.citations}
        citationsToAdd={props.citationsToAdd}
        onConfirm={props.onConfirm}
        onAddCitation={addCitation}
        onRemoveCitation={props.onRemoveCitation}
        selectedIndex={props.selectedIndex}
        onSelectedIndexChanged={props.onSelectedIndexChanged}
        focusPrevious={focusSearch}
        status={props.status}
        statusMessage={props.statusMessage}
        itemHeight={64}
        itemProvider={CitationSourcePanelListItem}
        ui={props.ui}
        ref={listContainer}
      />
    </div>
  );
});
