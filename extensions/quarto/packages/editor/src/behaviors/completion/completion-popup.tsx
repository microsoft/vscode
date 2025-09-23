/*
 * completion-popup.tsx
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

import { EditorView } from 'prosemirror-view';

import React, { useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';

import zenscroll from 'zenscroll';

import { applyStyles } from '../../api/css';
import {
  CompletionHandler,
  kCompletionDefaultItemHeight,
  kCompletionDefaultMaxVisible,
  kCompletionDefaultWidth,
} from '../../api/completion';
import { Popup } from '../../api/widgets/popup';

import './completion-popup.css';
import { EditorUI } from '../../api/ui-types';
import { editorScrollContainer } from '../../api/scroll';

const kNoResultsHeight = 22;

export interface CompletionListProps<T = unknown>{
  handler: CompletionHandler<T>;
  pos: number;
  completions: T[];
  selectedIndex: number;
  noResults: string;
  onHover: (index: number) => void;
  onClick: (index: number) => void;
  ui: EditorUI;
}

export interface CompletionPopup {
  el: HTMLElement;
  root: Root;
}

export function createCompletionPopup(): CompletionPopup {
  const popup = window.document.createElement('div');
  popup.style.position = 'absolute';
  popup.style.zIndex = '900';
  window.document.body.appendChild(popup);
  return {
    el: popup,
    root: createRoot(popup)
  }
}

export function renderCompletionPopup(view: EditorView, props: CompletionListProps<unknown>, popup: CompletionPopup) {
  // position popup
  const size = completionPopupSize(props);
  const positionStyles = completionPopupPositionStyles(view, props.pos, size.width, size.height);
  applyStyles(popup.el, [], positionStyles);

  // render popup
  popup.root.render(<CompletionPopup {...props} />);
}

export function destroyCompletionPopup(popup: CompletionPopup) {
  popup.root.unmount();
  popup.el.remove();
}

const CompletionPopup: React.FC<CompletionListProps<unknown>> = props => {
  // main completion popup + class + dark mode if appropriate
  const classes = ['pm-completion-popup'].concat(props.ui.prefs.darkMode() ? ['pm-dark-mode'] : []);
  return (
    <Popup classes={classes}>
      <CompletionList {...props} />
    </Popup>
  );
};

const CompletionList: React.FC<CompletionListProps<unknown>> = props => {
  const size = completionPopupSize(props);
  const itemHeight = props.handler.view.height || kCompletionDefaultItemHeight;

  // keep selected index in view
  const containerRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const containerEl = containerRef.current;
    if (containerEl) {
      const rows = containerEl.getElementsByClassName('pm-completion-list-item-row');
      const scrollToRow = rows.item(props.selectedIndex);
      if (scrollToRow) {
        const scroller = zenscroll.createScroller(editorScrollContainer(containerEl));
        scroller.intoView(scrollToRow as HTMLElement);
      }
    }
  }, [props.selectedIndex]);

  // item event handler
  const itemEventHandler = (index: number, handler: (index: number) => void) => {
    return (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      handler(index);
    };
  };

  // completion source based on orientation
  const completions = props.handler.view.horizontal ? horizontalCompletions : verticalCompletions;

  const classes = ['pm-completion-list'].concat(props.handler.view.horizontal ? ['pm-completion-list-horizontal'] : []);

  return (
    <div
      ref={containerRef}
      className={classes.join(' ')}
      style={{ width: size.width + 'px', height: size.height + 'px' }}
    >
      <table>
        {completionsHeader(props.handler, props.completions.length, props)}
        <tbody>
          {completions(props, itemHeight, itemEventHandler)}
          {props.completions.length === 0 ? completionsNoResults(props) : null}
        </tbody>
      </table>
    </div>
  );
};

function completionsHeader(handler: CompletionHandler, completionCount: number, props: CompletionListProps) {
  if (handler.view.header) {
    const completionHeader = handler.view.header ? handler.view.header() : undefined;
    const headerProps = { message: completionHeader?.message, ...props };

    if (completionHeader) {
      const header = React.createElement(completionHeader.component, headerProps);
      return (
        <thead>
          <tr>
            <th
              style={{ lineHeight: completionHeader.height + 'px' }}
              colSpan={props.handler.view.horizontal ? completionCount : undefined}
            >
              {header}
            </th>
          </tr>
        </thead>
      );
    } else {
      return null;
    }
  } else {
    return null;
  }
}

type ItemEventHandler = (index: number, handler: (index: number) => void) => (event: React.MouseEvent) => void;

function verticalCompletions(props: CompletionListProps, itemHeight: number, itemEventHandler: ItemEventHandler) {
  return props.completions.map((completion, index) => {
    const { key, cell } = completionItemCell(props, completion, index);
    return (
      <tr
        key={key}
        style={{ lineHeight: itemHeight + 'px' }}
        className={'pm-completion-list-item-row'}
        onClick={itemEventHandler(index, props.onClick)}
        onMouseMove={itemEventHandler(index, props.onHover)}
      >
        {cell}
      </tr>
    );
  });
}

function horizontalCompletions(props: CompletionListProps, itemHeight: number, itemEventHandler: ItemEventHandler) {
  const cellWidths = horizontalCellWidths(props);
  return (
    <tr style={{ lineHeight: itemHeight + 'px' }}>
      {props.completions.map((completion, index) => {
        const { cell } = completionItemCell(props, completion, index, cellWidths[index], itemEventHandler);
        return cell;
      })}
    </tr>
  );
}

function completionItemCell(
  props: CompletionListProps,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  completion: any,
  index: number,
  width?: number,
  itemEventHandler?: ItemEventHandler,
) {
  // need to provide key for both wrapper and item
  // https://stackoverflow.com/questions/28329382/understanding-unique-keys-for-array-children-in-react-js#answer-28329550
  const key = props.handler.view.key(completion) as React.Key;
  const itemProps = typeof(completion) === "object" ? completion : {};
  const item = React.createElement(props.handler.view.component, { ...itemProps, key });
  const className = 'pm-completion-list-item' + (index === props.selectedIndex ? ' pm-selected-list-item' : '');
  const cell = (
    <td
      key={key}
      style={width ? { width: width + 'px' } : undefined}
      className={className}
      onClick={itemEventHandler ? itemEventHandler(index, props.onClick) : undefined}
      onMouseMove={itemEventHandler ? itemEventHandler(index, props.onHover) : undefined}
    >
      {item}
    </td>
  );
  return { key, cell };
}

function completionsNoResults(props: CompletionListProps) {
  return (
    <tr
      className={'pm-completion-no-results pm-placeholder-text-color'}
      style={{ lineHeight: kNoResultsHeight + 'px' }}
    >
      <td>{props.noResults}</td>
    </tr>
  );
}

function completionPopupSize(props: CompletionListProps) {
  // kicker for list margins/border/etc
  const kCompletionsChrome = 8;

  // get view props (apply defaults)
  let { height: itemHeight = kCompletionDefaultItemHeight } = props.handler.view;
  const { maxVisible = kCompletionDefaultMaxVisible, width = kCompletionDefaultWidth } = props.handler.view;

  // add 2px for the border to item heights
  const kBorderPad = 2;
  itemHeight += kBorderPad;

  // compute header height
  let headerHeight = 0;
  if (props.handler.view.header) {
    const completionHeader = props.handler.view.header();
    if (completionHeader) {
      headerHeight = completionHeader.height + kBorderPad;
    }
  }

  // complete based on horizontal vs. vertical
  if (props.handler.view.horizontal) {
    // horizontal mode can provide explicit item widths
    const kTablePadding = 8;
    const kCellPadding = 8;
    const kCellBorders = 2;
    const totalWidth =
      horizontalCellWidths(props).reduce((total, current) => {
        return total + (current + kCellPadding + kCellBorders);
      }, 0) + kTablePadding;

    return {
      width: totalWidth,
      height: headerHeight + itemHeight + kCompletionsChrome,
    };
  } else {
    // compute height (subject it to a minimum require to display 'no results')
    const height =
      headerHeight +
      kCompletionsChrome +
      Math.max(itemHeight * Math.min(maxVisible, props.completions.length), kNoResultsHeight);

    // return
    return { width, height };
  }
}

function horizontalCellWidths(props: CompletionListProps) {
  const { width = kCompletionDefaultWidth } = props.handler.view;
  return props.completions.map((_completion, index) => {
    if (props.handler.view.horizontalItemWidths) {
      return props.handler.view.horizontalItemWidths[index] || width;
    } else {
      return width;
    }
  });
}

function completionPopupPositionStyles(view: EditorView, pos: number, width: number, height: number) {
  // some constants
  const kMinimumPaddingToEdge = 5;
  const kCompletionsVerticalPadding = 5;

  // default position
  const selectionCoords = view.coordsAtPos(pos);

  let top = selectionCoords.bottom + kCompletionsVerticalPadding;
  let left = selectionCoords.left;

  // see if we need to be above
  if (top + height + kMinimumPaddingToEdge >= window.innerHeight) {
    top = Math.max(selectionCoords.top - height - kCompletionsVerticalPadding, kCompletionsVerticalPadding);
  }

  // see if we need to be to the left (use cursor as pos in this case)
  if (left + width + kMinimumPaddingToEdge >= window.innerWidth) {
    const cursorCoords = view.coordsAtPos(view.state.selection.head);
    left = cursorCoords.right - width;
  }

  return {
    left: left + 'px',
    top: top + 'px',
  };
}
