/*
 * table-nodes.ts
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

import { tableNodes } from 'prosemirror-tables';
import { Node as ProsemirrorNode, DOMOutputSpec } from 'prosemirror-model';

import { PandocTokenType } from '../../api/pandoc';

import {
  readPandocTable,
  writePandocTableContainer,
  writePandocTable,
  writePandocTableCaption,
  writePandocTableNodes,
  writePandocTableHeaderNodes,
} from './table-pandoc';
import { tableColumnWidths } from './table-columns';
import { tableBlockCapsuleFilter } from './table-capsule';

export const kDefaultCellClasses = 'pm-table-cell pm-block-border-color';

const nodes = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    align: {
      default: null,
      getFromDOM(dom: Element) {
        return (dom as HTMLElement).style.textAlign || null;
      },
      setDOMAttr(value, attrs) {
        if (value) {
          attrs.style = (attrs.style || '') + `text-align: ${value};`;
        }
      },
    },
    className: {
      default: kDefaultCellClasses,
      getFromDOM(dom: Element) {
        return (dom as HTMLElement).className;
      },
      setDOMAttr(_value, attrs) {
        attrs.class = kDefaultCellClasses;
      },
    },
  },
});

export const tableContainerNode = {
  name: 'table_container',
  spec: {
    content: 'table table_caption',
    group: 'block',
    parseDOM: [{ tag: "div[class*='table-container']" }],
    toDOM(): DOMOutputSpec {
      return ['div', { class: 'table-container pm-table-container' }, 0];
    },
  },
  pandoc: {
    readers: [
      {
        token: PandocTokenType.Table,
        handler: readPandocTable,
      },
    ],
    writer: writePandocTableContainer,
    blockCapsuleFilter: tableBlockCapsuleFilter(),
  },
};

export const tableNode = {
  name: 'table',
  spec: {
    ...nodes.table,
    attrs: {
      ...nodes.table.attrs,
      width: { default: null },
      colpercents: { default: null },
    },
    parseDOM: [
      {
        tag: 'table',
        getAttrs: (dom: Node | string) => {
          const el = dom as HTMLElement;

          // shared colpercents
          let colpercents: number[] | null = null;

          // if we have a colgroup w/ widths then read percents from there
          // <colgroup><col style="width: 44%" /><col style="width: 11%" /></colgroup>
          const colgroup = el.getElementsByTagName('colgroup');
          if (colgroup.length) {
            const cols = colgroup[0].childElementCount;
            colpercents = new Array<number>(cols).fill(0);
            for (let i = 0; i < cols; i++) {
              const col = colgroup[0].children.item(i) as HTMLElement;
              if (col.style.width) {
                colpercents[i] = (parseInt(col.style.width, 10) || 0) / 100;
              }
            }
            if (colpercents.every(value => !!value)) {
              return {
                colpercents,
              };
            }
          }

          // otherwise read from data-colwidth
          let width: number | null = null;
          const rows = el.getElementsByTagName('tr');
          if (rows.length) {
            const firstRow = rows.item(0)!;
            const numCells = firstRow.cells.length;
            const colWidths = new Array<number>(numCells).fill(0);
            for (let i = 0; i < numCells; i++) {
              const cell = firstRow.cells.item(i)!;
              const colWidth = cell.getAttribute('data-colwidth');
              if (colWidth) {
                colWidths[i] = Number(colWidth);
              }
            }
            if (colWidths.every(colWidth => colWidth > 0)) {
              width = colWidths.reduce((total, value) => total + value, 0);
              colpercents = colWidths.map(colWidth => colWidth / width!);
            }
          }

          return {
            width,
            colpercents,
          };
        },
      },
    ],
    toDOM(node: ProsemirrorNode): DOMOutputSpec {
      const attrs: Record<string,unknown> = {};
      if (node.attrs.width) {
        attrs['data-width'] = node.attrs.width.toString();
      }
      attrs['data-colpercents'] = tableColumnWidths(node).join(',');
      return ['table', attrs, ['tbody', 0]];
    },
  },
  pandoc: {
    writer: writePandocTable,
  },
};

export const tableCaptionNode = {
  name: 'table_caption',
  spec: {
    attrs: {
      inactive: { default: false },
    },
    content: 'inline*',
    parseDOM: [
      {
        tag: "p[class*='table-caption']",
        getAttrs(dom: Node | string) {
          return {
            inactive: (dom as HTMLElement).classList.contains('table-caption-inactive'),
          };
        },
      },
    ],
    toDOM(node: ProsemirrorNode): DOMOutputSpec {
      const classes = ['table-caption', 'pm-node-caption'];
      if (node.attrs.inactive) {
        classes.push('table-caption-inactive');
      }
      return ['p', { class: classes.join(' ') }, 0];
    },
  },
  pandoc: {
    writer: writePandocTableCaption,
  },
};

export const tableRowNode = {
  name: 'table_row',
  spec: nodes.table_row,
  pandoc: {
    writer: writePandocTableNodes,
  },
};

export const tableCellNode = (blocks: boolean) => ({
  name: 'table_cell',
  spec: {
    ...nodes.table_cell,
    content: blocks ? 'block+' : 'paragraph',
  },
  pandoc: {
    writer: writePandocTableNodes,
  },
});

export const tableHeaderNode = {
  name: 'table_header',
  spec: nodes.table_header,
  pandoc: {
    writer: writePandocTableHeaderNodes,
  },
};
