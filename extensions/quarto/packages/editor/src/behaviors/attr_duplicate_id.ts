/*
 * attr_duplicate_id.ts
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

import { Transaction } from 'prosemirror-state';
import { Node as ProsemirrorNode } from 'prosemirror-model';
import { Step, AddMarkStep } from 'prosemirror-transform';
import { findChildren } from 'prosemirror-utils';

import { Extension } from '../api/extension';
import { getMarkAttrs, getMarkRange } from '../api/mark';
import { extensionIfPandocAttrEnabled } from '../api/pandoc_attr';

const extension: Extension = {
  appendTransaction: () => {
    // detect changes in content with ids
    const hasAttrId = (node: ProsemirrorNode) => {
      return !!node.attrs.id || node.marks.some(mark => !!mark.attrs.id);
    };

    // detect mark steps with new ids
    const attrMarkStep = (step: Step) => {
      return step instanceof AddMarkStep && !!step.mark.attrs.id;
    };

    return [
      {
        name: 'attr_duplicate_id',
        filter: (transactions: readonly Transaction[]) => transactions.some(transaction => transaction.steps.some(attrMarkStep)),
        nodeFilter: hasAttrId,
        append: (tr: Transaction) => {
          const usedIds = new Set<string>();
          const scannedRanges: Array<{ from: number; to: number }> = [];
          findChildren(tr.doc, hasAttrId, true).forEach(attrNode => {
            if (attrNode.node.attrs.id) {
              const id = attrNode.node.attrs.id;
              if (usedIds.has(id)) {
                const node = attrNode.node;
                tr.setNodeMarkup(attrNode.pos, undefined, { ...node.attrs, id: null }, node.marks);
              } else {
                usedIds.add(id);
              }
            } else {
              const mark = attrNode.node.marks.find(mk => !!mk.attrs.id)!;
              const markRange = getMarkRange(tr.doc.resolve(attrNode.pos), mark.type) as { from: number; to: number };
              const markAttrs = getMarkAttrs(tr.doc, markRange, mark.type);
              const id = markAttrs.id;
              if (id && !scannedRanges.find(range => range.from === markRange.from && range.to === markRange.to)) {
                scannedRanges.push(markRange);
                if (usedIds.has(id)) {
                  tr.removeMark(markRange.from, markRange.to, mark.type);
                  tr.addMark(markRange.from, markRange.to, mark.type.create({ ...mark.attrs, id: null }));
                } else {
                  usedIds.add(id);
                }
              }
            }
          });
        },
      },
    ];
  },
};

export default extensionIfPandocAttrEnabled(extension);
