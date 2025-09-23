/*
 * rmd_chunk-capsule.ts
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

import { PandocBlockCapsule, parsePandocBlockCapsule, blockCapsuleSourceWithoutPrefix } from '../../api/pandoc_capsule';
import { PandocToken, PandocTokenType, ProsemirrorWriter } from '../../api/pandoc';
import { pandocAttrReadAST, kCodeBlockAttr, PandocAttr, kCodeBlockText } from '../../api/pandoc_attr';
import { uuidv4 } from '../../api/util';

export function rmdChunkBlockCapsuleFilter() {
  // (note that this constant is also defined in VisualMode.java)
  const kBlockCapsuleType = 'F3175F2A-E8A0-4436-BE12-B33925B6D220'.toLowerCase();
  const kBlockCapsuleTextRegEx = new RegExp('```' + kBlockCapsuleType + '\\n[ \\t>]*([^`]+)\\n[ \\t>]*```', 'g');

  return {
    type: kBlockCapsuleType,

    match: /^([\t >]*)((```+)\s*\{[a-zA-Z0-9_-]+(?: *[ ,].*?)?\}[ \t]*\n(?:[\t >]*\3|[\W\w]*?\n[\t >]*\3))([ \t]*)$/gm,

    extract: (_match: string, p1: string, p2: string, _p3: string, p4: string) => {
      return {
        prefix: p1,
        source: p2,
        suffix: p4,
      };
    },

    // textually enclose the capsule so that pandoc parses it as the type of block we want it to
    // (in this case a code block). we use the capsule prefix here to make sure that the code block's
    // content and end backticks match the indentation level of the first line correctly
    enclose: (capsuleText: string, capsule: PandocBlockCapsule) =>
      '```' + kBlockCapsuleType + '\n' + capsule.prefix + capsuleText + '\n' + capsule.prefix + '```',
    // look for one of our block capsules within pandoc ast text (e.g. a code or raw block)
    // and if we find it, parse and return the original source code
    handleText: (text: string, tok: PandocToken) => {
      // if this is a code block then we need to strip the prefix
      const stripPrefix = tok.t === PandocTokenType.CodeBlock;

      return text.replace(kBlockCapsuleTextRegEx, (_match, p1) => {
        const capsuleText = p1;
        const capsule = parsePandocBlockCapsule(capsuleText);
        if (stripPrefix) {
          return blockCapsuleSourceWithoutPrefix(capsule.source, capsule.prefix);
        } else {
          return capsule.source;
        }
      });
    },

    // look for a block capsule of our type within a code block (indicated by the
    // presence of a special css class)
    handleToken: (tok: PandocToken) => {
      if (tok.t === PandocTokenType.CodeBlock) {
        const attr = pandocAttrReadAST(tok, kCodeBlockAttr) as PandocAttr;
        if (attr.classes.includes(kBlockCapsuleType)) {
          return tok.c[kCodeBlockText];
        }
      }
      return null;
    },

    // write the node as an rmd_chunk, being careful to remove the backticks
    // preserved as part of the source, and striping out the base indentation
    // level implied by the prefix
    writeNode: (schema: Schema, writer: ProsemirrorWriter, capsule: PandocBlockCapsule) => {
      // open node
      writer.openNode(schema.nodes.rmd_chunk, {
        navigation_id: uuidv4(),
        md_index: capsule.position,
      });

      // source still has leading and trailing backticks, remove them
      const source = capsule.source.replace(/^```+/, '').replace(/\n[\t >]*```+$/, '');

      // write the lines w/o the source-level prefix
      writer.writeText(blockCapsuleSourceWithoutPrefix(source, capsule.prefix));

      // all done
      writer.closeNode();
    },
  };
}
