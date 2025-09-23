/*
 * code_block_input.ts
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

import { EditorState, Transaction } from 'prosemirror-state';
import { Schema, ResolvedPos, Fragment, Node as ProsemirrorNode } from 'prosemirror-model';
import { InputRule } from 'prosemirror-inputrules';
import { setTextSelection } from 'prosemirror-utils';

import { PandocExtensions } from '../api/pandoc';
import { EditorFormat } from '../api/format';
import { Extension, ExtensionContext } from '../api/extension';
import { precedingListItemInsertPos, precedingListItemInsert } from '../api/list';
import { pandocAttrFrom } from '../api/pandoc_attr';
import { BaseKey } from '../api/basekeys';

import { markIsActive } from '../api/mark';
import { canInsertRmdChunk } from '../api/rmd';

const extension = (context: ExtensionContext): Extension => {
  const { pandocExtensions, format } = context;

  const fencedAttributes = pandocExtensions.fenced_code_attributes || !!format.rmdExtensions.codeChunks;

  return {
    baseKeys: () => {
      return [{ key: BaseKey.Enter, command: codeBlockInputRuleEnter(pandocExtensions, fencedAttributes, format) }];
    },

    inputRules: () => {
      if (fencedAttributes) {
        return [
          new InputRule(/^```+{$/, (state: EditorState, match: string[], start: number) => {
            if (!canApplyCodeBlockInputRule(state)) {
              return null;
            }
            const tr = state.tr;
            tr.insertText('{}');
            setTextSelection(start + match[0].length)(tr);
            return tr;
          }),
        ];
      } else {
        return [];
      }
    },
  };
};

function codeBlockInputRuleEnter(pandocExtensions: PandocExtensions, fencedAttributes: boolean, format: EditorFormat) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // see if the parent consist of a pending code block input rule
    const schema = state.schema;
    const { $head } = state.selection;

    // selection must be empty
    if (!state.selection.empty) {
      return false;
    }

    // full text of parent must meet the pattern
    // eslint-disable-next-line no-useless-escape
    const match = $head.parent.textContent.match(/^```+(?:(\w+)|\{([\.=]?[^\}]+)\})?$/);
    if (!match) {
      return false;
    }

    // no inline code marks
    if (markIsActive(state, schema.marks.code)) {
      return false;
    }

    // must be able to perform the replacement
    if (!canApplyCodeBlockInputRule(state)) {
      return false;
    }

    // determine nature of insert
    const fenced = fencedAttributes && !!match[2];
    const langAttrib = fenced ? match[2] : match[1] || '';
    const rawBlock = fenced && pandocExtensions.raw_attribute && langAttrib.match(/^=\w.*$/);
    const rmdChunk = fenced && !!format.rmdExtensions.codeChunks && langAttrib.match(/^\w.*$/);

    // if it's an rmd chunk then apply further validation
    if (rmdChunk && !canInsertRmdChunk(state)) {
      return false;
    }

    // execute
    if (dispatch) {
      // eslint-disable-next-line no-useless-escape
      const lang = langAttrib.replace(/^[\.=]/, '');

      // create transaction and clear input
      const tr = state.tr;
      const start = $head.start();
      const end = start + $head.parent.textContent.length;
      tr.deleteRange(start, end);

      // determine type and attrs
      const type = rawBlock ? schema.nodes.raw_block : rmdChunk ? schema.nodes.rmd_chunk : schema.nodes.code_block;
      const content = rmdChunk ? schema.text(`{${match[2]}}\n`) : Fragment.empty;
      const attrs = rawBlock ? { format: lang } : !rmdChunk && lang.length ? pandocAttrFrom({ classes: [lang] }) : {};

      // see if this should go into a preceding list item
      const prevListItemPos = precedingListItemInsertPos(state.doc, state.selection);
      if (prevListItemPos) {
        const block = type.createAndFill(attrs, content) as ProsemirrorNode;
        precedingListItemInsert(tr, prevListItemPos, block);
      } else {
        tr.insert(start, content);
        tr.setBlockType(start, start, type, attrs);
      }

      dispatch(tr);
    }

    return true;
  };
}

function canReplaceNodeWithCodeBlock(schema: Schema, $pos: ResolvedPos) {
  return $pos.node(-1).canReplaceWith($pos.index(-1), $pos.indexAfter(-1), schema.nodes.code_block);
}

function canApplyCodeBlockInputRule(state: EditorState) {
  const schema = state.schema;
  const { $head } = state.selection;
  return canReplaceNodeWithCodeBlock(schema, $head) || precedingListItemInsertPos(state.doc, state.selection);
}

export default extension;
