/*
 * remove_section.ts
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
import { Transaction, EditorState, Selection, Plugin, PluginKey } from 'prosemirror-state';
import { ReplaceStep, ReplaceAroundStep } from 'prosemirror-transform';

import { findParentNodeOfType } from 'prosemirror-utils';

import { Extension } from '../api/extension';
import { isList } from '../api/list';
import { transactionsDocChanged } from '../api/transaction';

const extension: Extension = {

  plugins: (schema: Schema) => {
    return [
      new Plugin({
        key: new PluginKey('remove-section'),
        appendTransaction: (transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) => {
          
          // skip for selection-only changes
          if (!transactionsDocChanged(transactions)) {
            return undefined;
          }

          if (isSectionRemoval(transactions, oldState)) {

            // if we had selected the entire contents of a div then prosemirror will remove
            // the div entirely -- we actually want to leave an empty div in place
            const fullySelectedDiv = fullySelectedDivSection(oldState); 
            if (fullySelectedDiv) {
              const tr = newState.tr;
              tr.replaceSelectionWith(
                schema.nodes.div.create(fullySelectedDiv.node.attrs,
                                        schema.nodes.paragraph.create()));
              return tr;
            }
      
      
            // if we are left with an empty selection in an empty heading block this may
            // have been the removal of a section (more than 1 textBlock). in that case
            // remove the empty heading node
            else if (isEmptyHeadingSelection(newState.selection)) {
              const tr = newState.tr;
              const $head = tr.selection.$head;
              const start = $head.start();
              const end = start + 2;
              tr.deleteRange(start, end);
              return tr;
            } else {
              return undefined;
            }
          } else {
            return undefined;
          }
        }
      })
    ];
  },
};


function isSectionRemoval(transactions: readonly Transaction[], oldState: EditorState) {
  // was this the removal of a section?
  let isRemoval = false;
  if (transactions.length === 1 && transactions[0].steps.length === 1) {
    // see if this is a delete step
    let isDeleteStep = false;
    const step = transactions[0].steps[0];
    if (step instanceof ReplaceStep) {
      isDeleteStep = step.slice.content.size === 0;
    } else if (step instanceof ReplaceAroundStep) {
      const { gapFrom, gapTo } = step;
      isDeleteStep = gapFrom === gapTo;
    }
   
    if (isDeleteStep) {
      let numBlocks = 0;
      const { from, to } = step as ReplaceStep;
      oldState.doc.nodesBetween(from, to, node => {
        if (isRemoval) {
          return false;
        }
        if (isList(node)) {
          isRemoval = true;
          return false;
        } else if (node.isTextblock) {
          if (numBlocks++ >= 1) {
            isRemoval = true;
            return false;
          }
        }
        return true;
      });
    }
   
  }

  return isRemoval;
}


function fullySelectedDivSection(state: EditorState) {

  if (!state.selection.empty && state.schema.nodes.div) {

    const div = findParentNodeOfType(state.schema.nodes.div)(state.selection);
    if (div) {
     
      // calculate the inner selection of the div (accounting for container position offsets)
      let divSelFrom = div.start + 1; // offset to get to beginning first block text
      let divSelTo = div.pos + div.node.nodeSize - 2; // offset to end of last block text
     
      // if the div's first child is a list we need to push in 2 more
      if (isList(div.node.firstChild)) {
        divSelFrom += 2;
      }
      // if the div's last child is a list we need to push in 2 more
      if (isList(div.node.lastChild)) {
        divSelTo -=2;
      }

      // does the selection span the entire div?
      if (state.selection.from === divSelFrom && state.selection.to === divSelTo) {
        return div;
      } else {
        return false;
      }
    }
  }

  return false;
}


function isEmptyHeadingSelection(selection: Selection) {
  const parent = selection.$head.parent;
  const schema = parent.type.schema;
  return selection.empty && parent.type === schema.nodes.heading && parent.content.size === 0;
}


export default extension;
