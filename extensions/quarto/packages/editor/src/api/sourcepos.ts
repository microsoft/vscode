/*
 * sourcepos.ts
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

import { EditorState } from "prosemirror-state";
import {  Node as ProsemirrorNode } from "prosemirror-model";

import { SourcePos, SourcePosBlock, SourcePosLocation } from "editor-types";
import { PandocTokenType } from "./pandoc";

export function getEditorSourcePos(state: EditorState): SourcePos {

  const paraBlockTypes = [
    'paragraph',
    'table_container',
    'figure',
    'line_block',
    'definition_list',
    'shortcode_block'
  ]

  const blockTypes: Record<string,SourcePosBlock> = {
    'heading': PandocTokenType.Header,
    'code_block': PandocTokenType.CodeBlock,
    'rmd_chunk': PandocTokenType.CodeBlock,
    'div': PandocTokenType.Div,
    'ordered_list': PandocTokenType.OrderedList,
    'bullet_list': PandocTokenType.BulletList,
    'raw_block': PandocTokenType.RawBlock,
    'blockquote': PandocTokenType.BlockQuote,
    'horizontal_rule': PandocTokenType.HorizontalRule
  };
    
  const locations: SourcePosLocation[] = [];
  state.doc.descendants((node: ProsemirrorNode, pos: number) => {
    if (paraBlockTypes.includes(node.type.name)) {
      locations.push({ block: PandocTokenType.Para, pos });
      return false;
    } else {
      const block = blockTypes[node.type.name];
      if (block) {
        locations.push({ block, pos});
      }
      return true;
    }
  });

  return {
    locations,
    pos: state.selection.from
  }

}
