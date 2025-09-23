/*
 * table.ts
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

import { Schema } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { Transaction, EditorState } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { tableEditing, columnResizing, goToNextCell, deleteColumn, deleteRow } from 'prosemirror-tables';
import { sinkListItem, liftListItem } from 'prosemirror-schema-list';

import { findChildrenByType } from 'prosemirror-utils';

import { Extension, ExtensionContext } from '../../api/extension';
import { BaseKey } from '../../api/basekeys';
import { ProsemirrorCommand, EditorCommandId, exitNode } from '../../api/command';
import { TableCapabilities } from '../../api/table';
import { trTransform } from '../../api/transaction';

import {
  insertTable,
  deleteTable,
  deleteTableCaption,
  addRows,
  addColumns,
  TableColumnAlignmentCommand,
  TableRowCommand,
  TableColumnCommand,
  TableToggleHeaderCommand,
  TableToggleCaptionCommand,
  CssAlignment,
  insertTableOmniInsert,
} from './table-commands';

import {
  tableContainerNode,
  tableNode,
  tableCaptionNode,
  tableCellNode,
  tableHeaderNode,
  tableRowNode,
} from './table-nodes';

import { fixupTableWidths } from './table-columns';
import { tableContextMenuHandler } from './table-contextmenu';
import { tablePaste } from './table-paste';

import 'prosemirror-tables/style/tables.css';
import './table-styles.css';

const extension = (context: ExtensionContext): Extension | null => {
  const { pandocExtensions, ui } = context;

  // not enabled if there are no tables enabled
  if (
    !pandocExtensions.grid_tables &&
    !pandocExtensions.pipe_tables &&
    !pandocExtensions.simple_tables &&
    !pandocExtensions.multiline_tables &&
    !pandocExtensions.raw_html
  ) {
    return null;
  }

  // define table capabilities
  const capabilities: TableCapabilities = {
    captions: pandocExtensions.table_captions,
    headerOptional: pandocExtensions.grid_tables,
    multiline: pandocExtensions.multiline_tables || pandocExtensions.grid_tables,
  };

  return {
    nodes: [
      tableContainerNode,
      tableNode,
      tableCaptionNode,
      tableCellNode(pandocExtensions.grid_tables),
      tableHeaderNode,
      tableRowNode,
    ],

    commands: () => {
      const commands = [
        new ProsemirrorCommand(
          EditorCommandId.Table,
          ['Alt-Mod-t'],
          insertTable(capabilities, ui),
          insertTableOmniInsert(ui),
        ),
        new ProsemirrorCommand(
          EditorCommandId.TableInsertTable,
          [],
          insertTable(capabilities, ui),
        ),
        new ProsemirrorCommand(EditorCommandId.TableNextCell, ['Tab'], goToNextCell(1)),
        new ProsemirrorCommand(EditorCommandId.TablePreviousCell, ['Shift-Tab'], goToNextCell(-1)),
        new TableColumnCommand(EditorCommandId.TableAddColumnAfter, [], addColumns(true)),
        new TableColumnCommand(EditorCommandId.TableAddColumnBefore, [], addColumns(false)),
        new TableColumnCommand(EditorCommandId.TableDeleteColumn, [], deleteColumn),
        new TableRowCommand(EditorCommandId.TableAddRowAfter, [], addRows(true)),
        new TableRowCommand(EditorCommandId.TableAddRowBefore, [], addRows(false)),
        new TableRowCommand(EditorCommandId.TableDeleteRow, [], deleteRow),
        new ProsemirrorCommand(EditorCommandId.TableDeleteTable, [], deleteTable()),
        new TableColumnAlignmentCommand(EditorCommandId.TableAlignColumnLeft, CssAlignment.Left),
        new TableColumnAlignmentCommand(EditorCommandId.TableAlignColumnRight, CssAlignment.Right),
        new TableColumnAlignmentCommand(EditorCommandId.TableAlignColumnCenter, CssAlignment.Center),
        new TableColumnAlignmentCommand(EditorCommandId.TableAlignColumnDefault, null),
      ];
      if (capabilities.captions) {
        commands.push(new TableToggleCaptionCommand());
      }
      if (capabilities.headerOptional) {
        commands.push(new TableToggleHeaderCommand());
      }
      return commands;
    },

    plugins: () => {
      return [
        columnResizing({
          handleWidth: 5,
        }),
        tableEditing(),
        tablePaste(),
      ];
    },

    contextMenuHandlers: () => {
      return [tableContextMenuHandler(ui)]
    },


    baseKeys: (schema: Schema) => {
      // core keys
      const keys = [
        { key: BaseKey.Backspace, command: deleteTableCaption() },
        { key: BaseKey.Enter, command: exitNode(schema.nodes.table_caption, -2, false) },
        { key: BaseKey.Tab, command: tableTabKey },
        { key: BaseKey.ShiftTab, command: tableShiftTabKey },
      ];

      // turn enter key variations into tab if we don't support multi-line
      if (!capabilities.multiline) {
        keys.push({ key: BaseKey.Enter, command: goToNextCell(1) });
        keys.push({ key: BaseKey.ShiftEnter, command: goToNextCell(1) });
        keys.push({ key: BaseKey.ModEnter, command: goToNextCell(1) });
      }

      return keys;
    },

    fixups: (_schema: Schema, view: EditorView) => {
      return [fixupTableWidths(view)];
    },

    appendTransaction: () => {
      return [
        {
          name: 'table-repair',
          nodeFilter: node => node.type === node.type.schema.nodes.table,
          append: (tr: Transaction) => {
            trTransform(tr, tableRepairTransform);
          },
        },
      ];
    },
  };
};

export function tableTabKey(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (sinkListItem(state.schema.nodes.list_item)(state)) {
    return false;
  } else {
    return goToNextCell(1)(state, dispatch);
  }
}

export function tableShiftTabKey(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (liftListItem(state.schema.nodes.list_item)(state)) {
    return false;
  } else {
    return goToNextCell(-1)(state, dispatch);
  }
}

function tableRepairTransform(tr: Transform) {
  const schema = tr.doc.type.schema;
  const tables = findChildrenByType(tr.doc, schema.nodes.table);
  tables.forEach(table => {
    // map the position
    const pos = tr.mapping.map(table.pos);

    // get containing node (pos is right before the table)
    const containingNode = tr.doc.resolve(pos).node();

    // table with no container
    if (containingNode.type !== schema.nodes.table_container) {
      // add the container
      const caption = schema.nodes.table_caption.createAndFill({ inactive: true }, undefined)!;
      const container = schema.nodes.table_container.createAndFill({}, [table.node, caption])!;
      tr.replaceWith(pos, pos + table.node.nodeSize, container);
    }

    // table with no content (possible w/ half caption leftover)
    else if (table.node.firstChild && table.node.firstChild.childCount === 0) {
      // delete the table (and container if necessary)
      const hasContainer = containingNode.type === schema.nodes.table_container;
      if (hasContainer) {
        tr.deleteRange(pos - 1, pos - 1 + containingNode.nodeSize);
      } else {
        tr.deleteRange(pos, table.node.nodeSize);
      }
    }
  });
}

export default extension;
