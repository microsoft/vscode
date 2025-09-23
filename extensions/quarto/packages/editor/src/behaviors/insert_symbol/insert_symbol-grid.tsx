/*
 * insert_symbol-grid.tsx
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
import { FixedSizeGrid } from 'react-window';

import debounce from 'lodash.debounce';

import { EditorUI } from '../../api/ui-types';
import { WidgetProps } from '../../api/widgets/react';

import { CharacterGridCellItemData, SymbolCharacterCell } from './insert_symbol-grid-cell';
import { SymbolCharacter } from './insert_symbol-dataprovider';

import './insert_symbol-grid-styles.css';

interface CharacterGridProps extends WidgetProps {
  height: number;
  width: number;
  numberOfColumns: number;
  symbolCharacters: SymbolCharacter[];
  selectedIndex: number;
  onSelectionChanged: (selectedIndex: number) => void;
  onSelectionCommitted: VoidFunction;
  ui: EditorUI;
}

const selectedItemClassName = 'pm-grid-item-selected';

const SymbolCharacterGrid = React.forwardRef<HTMLDivElement, CharacterGridProps>((props, ref) => {
  const columnWidth = Math.floor(props.width / props.numberOfColumns);
  const characterCellData: CharacterGridCellItemData = {
    symbolCharacters: props.symbolCharacters,
    numberOfColumns: props.numberOfColumns,
    selectedIndex: props.selectedIndex,
    onSelectionChanged: props.onSelectionChanged,
    onSelectionCommitted: props.onSelectionCommitted,
    selectedItemClassName,
  };

  const gridRef = React.useRef<FixedSizeGrid>(null);
  const handleScroll = debounce(() => {
    gridRef.current?.scrollToItem({ rowIndex: Math.floor(props.selectedIndex / props.numberOfColumns) });
  }, 5);

  React.useEffect(handleScroll, [props.selectedIndex]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const newIndex = newIndexForKeyboardEvent(
      event,
      props.selectedIndex,
      props.numberOfColumns,
      props.symbolCharacters.length,
    );
    if (newIndex !== undefined) {
      props.onSelectionChanged(newIndex);
      event.preventDefault();
    }
  };

  return (
    <div onKeyDown={handleKeyDown} tabIndex={0} ref={ref}>
      <FixedSizeGrid
        columnCount={props.numberOfColumns}
        rowCount={Math.ceil(props.symbolCharacters.length / props.numberOfColumns)}
        height={props.height}
        width={props.width + 1}
        rowHeight={columnWidth}
        columnWidth={columnWidth}
        itemData={characterCellData}
        className="pm-symbol-grid"
        ref={gridRef}
      >
        {SymbolCharacterCell}
      </FixedSizeGrid>
    </div>
  );
});

function previous(currentIndex: number): number {
  const newIndex = currentIndex - 1;
  return Math.max(0, newIndex);
}
function next(currentIndex: number, _numberOfColumns: number, numberOfCells: number): number {
  const newIndex = currentIndex + 1;
  return Math.min(numberOfCells - 1, newIndex);
}
function prevRow(currentIndex: number, numberOfColumns: number): number {
  const newIndex = currentIndex - numberOfColumns;
  return newIndex >= 0 ? newIndex : currentIndex;
}
function nextRow(currentIndex: number, numberOfColumns: number, numberOfCells: number): number {
  const newIndex = currentIndex + numberOfColumns;
  return newIndex < numberOfCells ? newIndex : currentIndex;
}
function nextPage(currentIndex: number, numberOfColumns: number, numberOfCells: number): number {
  const newIndex = currentIndex + 6 * numberOfColumns;
  return Math.min(numberOfCells - 1, newIndex);
}
function prevPage(currentIndex: number, numberOfColumns: number): number {
  const newIndex = currentIndex - 6 * numberOfColumns;
  return Math.max(0, newIndex);
}

export const newIndexForKeyboardEvent = (
  event: React.KeyboardEvent,
  selectedIndex: number,
  numberOfColumns: number,
  numberOfCells: number,
): number | undefined => {
  switch (event.key) {
    case 'ArrowLeft': // left
      return previous(selectedIndex);

    case 'ArrowUp': // up
      return prevRow(selectedIndex, numberOfColumns);

    case 'ArrowRight': // right
      return next(selectedIndex, numberOfColumns, numberOfCells);

    case 'ArrowDown': // down
      return nextRow(selectedIndex, numberOfColumns, numberOfCells);

    case 'PageDown':
      return nextPage(selectedIndex, numberOfColumns, numberOfCells);

    case 'PageUp':
      return prevPage(selectedIndex, numberOfColumns);

    case 'Home':
      return 0;

    case 'End':
      return numberOfCells - 1;

    default:
      return undefined;
  }
};

export default SymbolCharacterGrid;
