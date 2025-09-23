/*
 * shortcode.ts
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

import { Schema, Node as ProsemirrorNode, Mark, Fragment } from 'prosemirror-model';
import { Transaction } from 'prosemirror-state';

import { findChildren } from 'prosemirror-utils';

import { Extension, ExtensionContext } from '../api/extension';
import { detectAndApplyMarks, domAttrNoSpelling, removeInvalidatedMarks } from '../api/mark';
import { MarkTransaction } from '../api/transaction';
import { FixupContext } from '../api/fixup';
import { kShortcodeRegEx } from '../api/shortcode';
import { PandocOutput } from '../api/pandoc';

const extension = (context: ExtensionContext): Extension | null => {
  const { format } = context;

  if (!format.hugoExtensions.shortcodes) {
    return null;
  }

  return {
    marks: [
      {
        name: 'shortcode',
        noInputRules: true,
        noSpelling: true,
        spec: {
          inclusive: false,
          excludes: 'formatting',
          attrs: {},
          parseDOM: [
            {
              tag: "span[class*='shortcode']",
            },
          ],
          toDOM() {
            return ['span', domAttrNoSpelling({ class: 'shortcode pm-markup-text-color pm-fixedwidth-font' })];
          },
        },
        pandoc: {
          readers: [],
          writer: {
            priority: 1,
            write: (output: PandocOutput, _mark: Mark, parent: Fragment) => {
              output.writeRawMarkdown(parent);
            },
          },
        },
      },
    ],

    fixups: (schema: Schema) => {
      return [
        (tr: Transaction, fixupContext: FixupContext) => {
          if (fixupContext === FixupContext.Load) {
            // apply marks
            const markType = schema.marks.shortcode;
            const predicate = (node: ProsemirrorNode) => {
              return node.isTextblock && node.type.allowsMarkType(markType);
            };
            const markTr = new MarkTransaction(tr);
            findChildren(tr.doc, predicate).forEach(nodeWithPos => {
              const { pos } = nodeWithPos;
              detectAndCreateShortcodes(schema, markTr, pos);
            });
          }
          return tr;
        },
      ];
    },

    appendMarkTransaction: () => {
      return [
        {
          name: 'shortcode-marks',
          filter: (node: ProsemirrorNode) =>
            node.isTextblock && node.type.allowsMarkType(node.type.schema.marks.shortcode),
          append: (tr: MarkTransaction, node: ProsemirrorNode, pos: number) => {
            removeInvalidatedMarks(tr, node, pos, kShortcodeRegEx, node.type.schema.marks.shortcode);
            detectAndCreateShortcodes(node.type.schema, tr, pos);
          },
        },
      ];
    },
  };
};

function detectAndCreateShortcodes(schema: Schema, tr: MarkTransaction, pos: number) {
  // apply marks wherever they belong
  detectAndApplyMarks(
    tr,
    tr.doc.nodeAt(pos)!,
    pos,
    kShortcodeRegEx,
    schema.marks.shortcode,
    () => ({}),
    () => true,
    match => match[1],
  );
}

export default extension;
