/*
 * table-commands.ts
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
import { Node as ProsemirrorNode, Fragment } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';
import { findParentNodeOfType, setTextSelection, findChildrenByType } from 'prosemirror-utils';
import {
  isInTable,
  Rect,
  TableMap,
  selectionCell,
  CellSelection,
  toggleHeader,
  addRow,
  addColumn,
} from 'prosemirror-tables';

import { EditorUI } from '../../api/ui-types';
import { ProsemirrorCommand, EditorCommandId } from '../../api/command';
import { canInsertNode } from '../../api/node';
import { TableCapabilities } from '../../api/table';
import { OmniInsertGroup } from '../../api/omni_insert';

export function insertTable(capabilities: TableCapabilities, ui: EditorUI) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
    const schema = state.schema;

    // can we insert?
    if (!canInsertNode(state, schema.nodes.table_container)) {
      return false;
    }

    // is the selection inside a table caption? if it is then we can't insert
    // as it will "split" the table_container in such a way that an invalid
    // table will be created
    if (findParentNodeOfType(schema.nodes.table_caption)(state.selection)) {
      return false;
    }

    async function asyncInsertTable() {
      if (dispatch) {
        const result = await ui.dialogs.insertTable(capabilities);
        if (result) {
          // create cells
          const numRows = result.rows + (result.header ? 1 : 0);
          const rows: ProsemirrorNode[] = [];
          for (let r = 0; r < numRows; r++) {
            const cells: ProsemirrorNode[] = [];
            const cellType = r === 0 && result.header ? schema.nodes.table_header : schema.nodes.table_cell;
            for (let c = 0; c < result.cols; c++) {
              const content =
                cellType === schema.nodes.table_header
                  ? schema.text(`${ui.context.translateText('Col')}${c + 1}`)
                  : Fragment.empty;
              cells.push(cellType.createAndFill({}, schema.nodes.paragraph.createAndFill({}, content)!)!);
            }
            rows.push(schema.nodes.table_row.createAndFill({}, cells)!);
          }

          // create table
          const table = schema.nodes.table.createAndFill({}, rows)!;
          const tableCaption = schema.nodes.table_caption.createAndFill(
            { inactive: !result.caption },
            result.caption ? schema.text(result.caption) : undefined,
          )!;
          const tableContainer = schema.nodes.table_container.createAndFill({}, [table, tableCaption])!;

          // insert
          const tr = state.tr;
          tr.replaceSelectionWith(tableContainer);

          // select first cell
          const selectionPos = tr.mapping.map(state.selection.from, -1);
          setTextSelection(selectionPos)(tr).scrollIntoView();

          // dispatch & focus
          dispatch(tr);
        }
        if (view) {
          view.focus();
        }
      }
    }
    asyncInsertTable();

    return true;
  };
}

export function insertTableOmniInsert(ui: EditorUI) {
  return {
    name: ui.context.translateText('Table'),
    description: ui.context.translateText('Content in rows and columns'),
    group: OmniInsertGroup.Lists,
    priority: 1,
    noFocus: true,
    image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.table_dark : ui.images.omni_insert.table),
  };
}

export function deleteTable() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const schema = state.schema;
    const container = findParentNodeOfType(schema.nodes.table_container)(state.selection);
    if (container) {
      if (dispatch) {
        const tr = state.tr;
        tr.delete(container.pos, container.pos + container.node.nodeSize);
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    return false;
  };
}

export function deleteTableCaption() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // must be a selection within an empty table caption
    const schema = state.schema;
    const { $head } = state.selection;
    if ($head.parent.type !== schema.nodes.table_caption || $head.parent.childCount !== 0) {
      return false;
    }

    if (dispatch) {
      // set the caption to inactive
      const tr = state.tr;
      const caption = $head.parent;
      tr.setNodeMarkup($head.pos - 1, schema.nodes.table_caption, {
        ...caption.attrs,
        inactive: true,
      });
      setTextSelection($head.pos - 1, -1)(tr);
      dispatch(tr);
    }

    return true;
  };
}

export function addColumns(after: boolean) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    if (!isInTable(state)) {
      return false;
    }
    if (dispatch) {
      let tr = state.tr;
      const rect = selectedRect(state);
      const columns = rect.right - rect.left;
      for (let i = 0; i < columns; i++) {
        tr = addColumn(tr, rect, after ? rect.right : rect.left);
      }
      dispatch(tr);
    }
    return true;
  };
}

export function addRows(after: boolean) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    if (!isInTable(state)) {
      return false;
    }
    if (dispatch) {
      // add the rows
      let tr = state.tr;
      const rect = selectedRect(state);
      const rows = rect.bottom - rect.top;
      for (let i = 0; i < rows; i++) {
        tr = addRow(tr, rect, after ? rect.bottom : rect.top);
      }

      // sync column alignments for table
      const table = findParentNodeOfType(state.schema.nodes.table)(tr.selection);
      if (table) {
        const alignments = new Array<CssAlignment | null>(rect.map.width);
        table.node.forEach((rowNode, rowOffset, rowIndex) => {
          rowNode.forEach((cellNode, cellOffset, colIndex) => {
            const cellPos = table.pos + 1 + rowOffset + 1 + cellOffset;
            if (rowIndex === 0) {
              const cell = tr.doc.nodeAt(cellPos);
              alignments[colIndex] = cell?.attrs.align || null;
            } else {
              tr.setNodeMarkup(cellPos, cellNode.type, {
                ...cellNode.attrs,
                align: alignments[colIndex] || null,
              });
            }
          });
        });
      }

      dispatch(tr);
    }
    return true;
  };
}

export class TableToggleHeaderCommand extends ProsemirrorCommand {
  constructor() {
    super(EditorCommandId.TableToggleHeader, [], toggleHeader('row'));
  }

  public isActive(state: EditorState): boolean {
    if (!isInTable(state)) {
      return false;
    }
    const { table } = selectedRect(state);
    const firstCell = table.firstChild!.firstChild!;
    return firstCell.type === state.schema.nodes.table_header;
  }
}

export class TableToggleCaptionCommand extends ProsemirrorCommand {
  constructor() {
    super(
      EditorCommandId.TableToggleCaption,
      [],
      (state: EditorState, dispatch?: (tr: Transaction, view?: EditorView) => void) => {
        if (!isInTable(state)) {
          return false;
        }
        const caption = this.tableCaptionNode(state);
        if (!caption) {
          return false;
        }

        if (dispatch) {
          const focus = caption.node.attrs.inactive;
          const tr = state.tr;
          tr.setNodeMarkup(caption.pos + 1, state.schema.nodes.table_caption, {
            ...caption.node.attrs,
            inactive: !caption.node.attrs.inactive,
          });
          if (focus) {
            setTextSelection(caption.pos + 1)(tr).scrollIntoView();
          }
          dispatch(tr);
        }

        return true;
      },
    );
  }

  public isActive(state: EditorState): boolean {
    if (!isInTable(state)) {
      return false;
    }

    const caption = this.tableCaptionNode(state);
    if (!caption) {
      return false;
    }

    return !caption.node.attrs.inactive;
  }

  private tableCaptionNode(state: EditorState) {
    const container = findParentNodeOfType(state.schema.nodes.table_container)(state.selection);
    if (container) {
      const caption = findChildrenByType(container.node, state.schema.nodes.table_caption);
      return {
        node: caption[0].node,
        pos: container.pos + caption[0].pos,
      };
    } else {
      return undefined;
    }
  }
}

export enum CssAlignment {
  Left = 'left',
  Right = 'right',
  Center = 'center',
}

export class TableRowCommand extends ProsemirrorCommand {
  public plural(state: EditorState) {
    if (!isInTable(state)) {
      return 1;
    }

    const rect = selectedRect(state);
    return rect.bottom - rect.top;
  }
}

export class TableColumnCommand extends ProsemirrorCommand {
  public plural(state: EditorState) {
    if (!isInTable(state)) {
      return 1;
    }

    const rect = selectedRect(state);
    return rect.right - rect.left;
  }
}

export class TableColumnAlignmentCommand extends ProsemirrorCommand {
  private readonly align: CssAlignment | null;

  constructor(id: EditorCommandId, align: CssAlignment | null) {
    super(id, [], (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      if (!isInTable(state)) {
        return false;
      }

      if (dispatch) {
        const { table, tableStart, left, right } = selectedRect(state);
        const tr = state.tr;
        table.forEach((rowNode, rowOffset) => {
          rowNode.forEach((cellNode, cellOffset, i) => {
            if (i >= left && i < right) {
              const cellPos = tableStart + 1 + rowOffset + cellOffset;
              tr.setNodeMarkup(cellPos, cellNode.type, {
                ...cellNode.attrs,
                align,
              });
            }
          });
        });
        dispatch(tr);
      }

      return true;
    });
    this.align = align;
  }

  public isActive(state: EditorState): boolean {
    if (!isInTable(state)) {
      return false;
    }
    const { table, top, left } = selectedRect(state);
    const cell = table.child(top).child(left);
    return cell.attrs.align === this.align;
  }
}

// from: https://github.com/ProseMirror/prosemirror-tables/blob/master/src/commands.js

interface SelectedRect extends Rect {
  tableStart: number;
  map: TableMap;
  table: ProsemirrorNode;
}

function selectedRect(state: EditorState): SelectedRect {
  const sel = state.selection;
  const $pos = selectionCell(state)!;
  const table = $pos.node(-1);
  const tableStart = $pos.start(-1);
  const map = TableMap.get(table);
  let rect: Rect;
  if (sel instanceof CellSelection) {
    rect = map.rectBetween(sel.$anchorCell.pos - tableStart, sel.$headCell.pos - tableStart);
  } else {
    rect = map.findCell($pos.pos - tableStart);
  }
  return {
    ...rect,
    tableStart,
    map,
    table,
  };
}
