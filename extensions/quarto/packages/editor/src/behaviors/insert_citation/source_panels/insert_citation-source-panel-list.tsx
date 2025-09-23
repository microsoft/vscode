/*
 * insert_citation-source-panel-list.tsx
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

import { FixedSizeList, ListChildComponentProps } from 'react-window';

import { EditorUI } from '../../../api/ui-types';
import { WidgetProps } from '../../../api/widgets/react';

import { CitationListEntry, CitationSourceListStatus } from './insert_citation-source-panel';

import './insert_citation-source-panel-list.css';

export interface CitationSourcePanelListItemData {
  citations: CitationListEntry[];
  citationsToAdd: CitationListEntry[];
  selectedIndex: number;
  onSelectedIndexChanged: (index: number) => void;
  onAddCitation: (source: CitationListEntry) => void;
  onRemoveCitation: (source: CitationListEntry) => void;
  onConfirm: () => void;
  ui: EditorUI;
  showSeparator?: boolean;
  showSelection?: boolean;
  preventFocus?: boolean;
}

export interface CitationSourceListProps extends WidgetProps {
  height: number;
  citations: CitationListEntry[];
  citationsToAdd: CitationListEntry[];
  selectedIndex: number;
  onSelectedIndexChanged: (index: number) => void;
  onAddCitation: (citation: CitationListEntry) => void;
  onRemoveCitation: (citation: CitationListEntry) => void;
  onConfirm: VoidFunction;
  focusPrevious?: () => void;

  itemProvider: (props: ListChildComponentProps) => JSX.Element;
  itemHeight: number;

  status: CitationSourceListStatus;
  statusMessage: string;
  ui: EditorUI;
}

export const CitationSourceList = React.forwardRef<HTMLDivElement, CitationSourceListProps>(
  (props: CitationSourceListProps, ref) => {
    const fixedList = React.useRef<FixedSizeList>(null);

    // Item height and consequently page height
    const itemsPerPage = Math.floor(props.height / props.itemHeight);

    // Update selected item index (this will manage bounds)
    const handleIncrementIndex = (event: React.KeyboardEvent, increment: number, index: number) => {
      event.stopPropagation();
      event.preventDefault();
      if (props.citations && index > -1) {
        const maxIndex = props.citations.length - 1;
        const newIndex = Math.min(Math.max(0, index + increment), maxIndex);
        props.onSelectedIndexChanged(newIndex);
      }
    };

    // Toggle the currently selected item as added or removed
    const handleAddItem = (event: React.KeyboardEvent) => {
      event.stopPropagation();
      event.preventDefault();
      const currentCitation = props.selectedIndex > -1 ? props.citations[props.selectedIndex] : undefined;
      if (currentCitation) {
        props.onAddCitation(currentCitation);
      }
    };

    const handleListKeyDown = (event: React.KeyboardEvent) => {
      const currentIndex = props.selectedIndex;
      switch (event.key) {
        case 'ArrowUp':
          if (currentIndex === 0 && props.focusPrevious) {
            props.focusPrevious();
          } else {
            handleIncrementIndex(event, -1, currentIndex);
          }
          break;

        case 'ArrowDown':
          handleIncrementIndex(event, 1, currentIndex);
          break;

        case 'PageDown':
          handleIncrementIndex(event, itemsPerPage, currentIndex);
          break;

        case 'PageUp':
          handleIncrementIndex(event, -itemsPerPage, currentIndex);
          break;

        case 'Enter':
          handleAddItem(event);
          props.onConfirm();
          break;
        case ' ':
          handleAddItem(event);
          break;
      }
    };

    // Ensure the item is scrolled into view
    React.useEffect(() => {
      if (props.selectedIndex > -1) {
        fixedList.current?.scrollToItem(props.selectedIndex);
      }
    });

    // Focus / Blur are used to track whether to show selection highlighting
    const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
      if (props.selectedIndex < 0) {
        props.onSelectedIndexChanged(0);
      }
      event.stopPropagation();
      event.preventDefault();
    };

    const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
    };

    const classes = ['pm-insert-citation-source-panel-list-container'].concat(props.classes || []).join(' ');
    switch (props.status) {
      case CitationSourceListStatus.default:
        if (props.citations.length > 0) {
          return (
            <div
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              onFocus={onFocus}
              onBlur={onBlur}
              ref={ref}
              className={classes}
            >
              <FixedSizeList
                className="pm-insert-citation-source-panel-list"
                height={props.height}
                width="100%"
                itemCount={props.citations.length}
                itemSize={props.itemHeight}
                itemData={{
                  selectedIndex: props.selectedIndex,
                  onSelectedIndexChanged: props.onSelectedIndexChanged,
                  citations: props.citations,
                  citationsToAdd: props.citationsToAdd,
                  onAddCitation: props.onAddCitation,
                  onRemoveCitation: props.onRemoveCitation,
                  onConfirm: props.onConfirm,
                  showSeparator: true,
                  showSelection: true,
                  preventFocus: true,
                  ui: props.ui,
                }}
                ref={fixedList}
              >
                {props.itemProvider}
              </FixedSizeList>
            </div>
          );
        } else {
          return (
            <div className={classes} style={{ height: props.height + 'px' }} ref={ref}>
              <div className="pm-insert-citation-source-panel-list-noresults-text">{props.statusMessage}</div>
            </div>
          );
        }

      case CitationSourceListStatus.inProgress:
        return (
          <div className={classes} style={{ height: props.height + 'px' }} ref={ref}>
            <div className="pm-insert-citation-source-panel-list-noresults-text">
              {!props.ui.prefs.darkMode 
                ? <img src={props.ui.images.search_progress} className="pm-insert-citation-source-panel-list-progress" draggable="false"/>
                : null
              }
              {props.statusMessage}
            </div>
          </div>
        );

      case CitationSourceListStatus.noResults:
        return (
          <div className={classes} style={{ height: props.height + 'px' }} ref={ref}>
            <div className="pm-insert-citation-source-panel-list-noresults-text">{props.statusMessage}</div>
          </div>
        );

      case CitationSourceListStatus.error:
        return (
          <div className={classes} style={{ height: props.height + 'px' }} ref={ref}>
            <div className="pm-insert-citation-source-panel-list-noresults-text">
              {props.statusMessage || props.ui.context.translateText('An error occurred.')}
            </div>
          </div>
        );

      case CitationSourceListStatus.default:
      default:
        if (props.citations.length > 0) {
          return (
            <div
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              onFocus={onFocus}
              onBlur={onBlur}
              ref={ref}
              className={classes}
            >
              <FixedSizeList
                className="pm-insert-citation-source-panel-list"
                height={props.height}
                width="100%"
                itemCount={props.citations.length}
                itemSize={props.itemHeight}
                itemData={{
                  selectedIndex: props.selectedIndex,
                  onSelectedIndexChanged: props.onSelectedIndexChanged,
                  citations: props.citations,
                  citationsToAdd: props.citationsToAdd,
                  onAddCitation: props.onAddCitation,
                  onRemoveCitation: props.onRemoveCitation,
                  onConfirm: props.onConfirm,
                  showSeparator: true,
                  showSelection: true,
                  preventFocus: true,
                  ui: props.ui,
                }}
                ref={fixedList}
              >
                {props.itemProvider}
              </FixedSizeList>
            </div>
          );
        } else {
          return (
            <div className={classes} style={{ height: props.height + 'px' }} ref={ref}>
              <div className="pm-insert-citation-source-panel-list-noresults-text">{props.statusMessage}</div>
            </div>
          );
        }
    }
  },
);
