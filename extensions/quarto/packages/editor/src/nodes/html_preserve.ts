/*
 * html_preserve.ts
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

import { Node as ProsemirrorNode, Schema } from 'prosemirror-model';

import { PandocOutput, PandocTokenType, ProsemirrorWriter } from '../api/pandoc';
import { Extension } from '../api/extension';
import { codeNodeSpec } from '../api/code';

import {
  PandocBlockCapsuleFilter,
  blockCapsuleParagraphTokenHandler,
  encodedBlockCapsuleRegex,
  PandocBlockCapsule,
  blockCapsuleTextHandler,
  blockCapsuleSourceWithoutPrefix,
} from '../api/pandoc_capsule';

const extension = (): Extension | null => {

  return {
    nodes: [
      {
        name: 'html_preserve',

        spec: {
          ...codeNodeSpec(),
          attrs: {},
          parseDOM: [
            {
              tag: "div[class*='pm-html-preserve']",
              preserveWhitespace: 'full',
            },
          ],
          toDOM() {
            return ['div', { class: 'pm-html-preserve pm-fixedwidth-font pm-code-block pm-markup-text-color' }, 0];
          },
        },

        code_view: {
          lang: () => 'html',
          borderColorClass: 'pm-raw-block-border',
        },

        attr_edit: () => ({
          type: (schema: Schema) => schema.nodes.html_preserve,
          tags: () => ['html_preserve'],
          editFn: () => () => false,
        }),

        pandoc: {
          // capture shortcuts w/ begin/end tags
          blockCapsuleFilter: htmlPreserveBlockCapsuleFilter(),

          writer: (output: PandocOutput, node: ProsemirrorNode) => {
            output.writeToken(PandocTokenType.Para, () => {
              output.writeRawMarkdown(node.content);
            });
          },
        },
      },
    ],
  };
};

export function htmlPreserveBlockCapsuleFilter(): PandocBlockCapsuleFilter {
  const kHtmlPreserveBlockCapsuleType = '83CFCBF3-0429-4822-AAC6-D6F31591AEA8'.toLowerCase();

  return {
    type: kHtmlPreserveBlockCapsuleType,

    // eslint-disable-next-line no-useless-escape
    match: /^([\t >]*)(<!--html_preserve-->[\W\w]*?<!--\/html_preserve-->)([ \t]*)$/gm,

    extract: (_match: string, p1: string, p2: string, p3: string) => {
      return {
        prefix: p1,
        source: p2,
        suffix: p3,
      };
    },

    // textually enclose the capsule so that pandoc parses it as the type of block we want it to
    // (in this case we don't do anything because pandoc would have written this as a
    // semantically standalone block)
    enclose: (capsuleText: string) => {
      return capsuleText;
    },

    // look for one of our block capsules within pandoc ast text (e.g. a code or raw block)
    // and if we find it, parse and return the original source code
    handleText: blockCapsuleTextHandler(
      kHtmlPreserveBlockCapsuleType,
      encodedBlockCapsuleRegex(undefined, undefined, 'gm'),
    ),

    // we are looking for a paragraph token consisting entirely of a block capsule of our type.
    // if find that then return the block capsule text
    handleToken: blockCapsuleParagraphTokenHandler(kHtmlPreserveBlockCapsuleType),

    // write the node
    writeNode: (schema: Schema, writer: ProsemirrorWriter, capsule: PandocBlockCapsule) => {
      // remove the source prefix
      const source = blockCapsuleSourceWithoutPrefix(capsule.source, capsule.prefix);

      // write the node
      writer.addNode(schema.nodes.html_preserve, {}, [schema.text(source)]);
    },
  };
}

export default extension;
