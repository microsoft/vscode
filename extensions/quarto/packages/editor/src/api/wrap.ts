/*
 * wrap.ts
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
import { Transform } from 'prosemirror-transform';
import { Node as ProsemirrorNode } from 'prosemirror-model';


import { split } from 'sentence-splitter';

import { trTransform } from './transaction';
import { findChildrenByType, findParentNodeOfTypeClosestToPos } from 'prosemirror-utils';

export function wrapSentences(tr: Transaction) {
  trTransform(tr, wrapSentencesTransform);
}

function wrapSentencesTransform(tr: Transform) {
  // find all paragraphs in doc
  const schema = tr.doc.type.schema;
  const paragraphs = findChildrenByType(tr.doc, schema.nodes.paragraph);

  // insert linebreaks in paragraphs (go backwards to preserve positions)
  paragraphs.reverse().forEach(paragraph => {
    // don't break sentences inside tight list items
    const $pos = tr.doc.resolve(paragraph.pos);
    const parent = $pos.node($pos.depth);
    if (parent.type === schema.nodes.list_item && $pos.node($pos.depth - 1).attrs.tight) {
      return;
    }

    // don't break sentences inside tables
    if (schema.nodes.table && findParentNodeOfTypeClosestToPos($pos, schema.nodes.table)) {
      return;
    }

    // extract text (use \n for hard_break)
    // based on https://github.com/ProseMirror/prosemirror-model/blob/eef20c8c6dbf841b1d70859df5d59c21b5108a4f/src/fragment.js#L46
    // (but do no handling for leafs b/c we don't have any in our schema and nothing for blocks
    // b/c this is a paragraph so won't have nested blocks. We use our own implementation so that
    // we can correctly count node types that imply text but don't actually have any text
    // (e.g. hard_break)
   
    let textContent = "";
    const paraContent = paragraph.node.content;
    const from = 0;
    const to = paraContent.size;
    paraContent.nodesBetween(from, to, (node: ProsemirrorNode, pos: number) => {
      if (node.isText) {
        textContent += node.text!.slice(Math.max(from, pos) - pos, to - pos);
      } else if (node.type.name === "hard_break") {
        textContent += "\n";
      }
    }, 0);

    // don't break bookdown text references
    if (/^\(ref:[^\s]+\)\s+[^\s]/.test(textContent)) {
      return;
    }

    // split into parts
    const parts = split(textContent);

    // only consider sentences that aren't already followed by a hard break
    const sentences: typeof parts = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type === 'Sentence') {
        if (i === parts.length - 1 || 
            parts[i + 1].type !== 'WhiteSpace' || 
            parts[i + 1].value !== '\n') {
          sentences.push(parts[i]);
        }
      }
    }

    // reverse so we can insert line breaks without messing up positions
    sentences
      .reverse()
      .forEach(sentence => {
        // don't break sentence if at least one mark is active
        if (tr.doc.resolve(paragraph.pos + sentence.range[1] + 1).marks().length === 0) {
          const hardBreak = schema.text('\n');
          const hardBreakPos = paragraph.pos + sentence.range[1] + 2;
          tr.insert(hardBreakPos, hardBreak);
        }
      });
  });
}
