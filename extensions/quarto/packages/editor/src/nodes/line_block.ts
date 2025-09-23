/*
 * line_block.ts
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

import { Node as ProsemirrorNode, Schema, DOMOutputSpec } from 'prosemirror-model';

import { ExtensionContext } from '../api/extension';
import { PandocOutput, PandocTokenType, PandocToken, kWriteSpaces } from '../api/pandoc';

import { EditorCommandId, WrapCommand } from '../api/command';
import { OmniInsertGroup } from '../api/omni_insert';

import './line_block-styles.css';

const extension = (context: ExtensionContext) => {
  const { pandocExtensions, ui } = context;

  if (!pandocExtensions.line_blocks) {
    return null;
  }

  return {
    nodes: [
      {
        name: 'line_block',
        spec: {
          content: 'paragraph+',
          group: 'block',
          defining: true,
          parseDOM: [
            {
              tag: "div[class*='line-block']",
            },
          ],
          toDOM(): DOMOutputSpec {
            return ['div', { class: 'line-block pm-line-block pm-block-border-color pm-margin-bordered' }, 0];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.LineBlock,
              block: 'line_block',
              getChildren: (tok: PandocToken) => {
                return tok.c.map((line: PandocToken[]) => ({ t: PandocTokenType.Para, c: line }));
              },
            },
          ],
          writer: (output: PandocOutput, node: ProsemirrorNode) => {
            output.withOption(kWriteSpaces, false, () => {
              output.writeToken(PandocTokenType.LineBlock, () => {
                node.forEach(line => {
                  output.writeArray(() => {
                    output.writeInlines(line.content);
                  });
                });
              });
            });
          },
        },
      },
    ],
    commands: (schema: Schema) => {
      return [
        new WrapCommand(
          EditorCommandId.LineBlock,
          [],
          schema.nodes.line_block,
          {},
          {
            name: ui.context.translateText('Line Block'),
            description: ui.context.translateText('Preserve leading spaces and line breaks'),
            group: OmniInsertGroup.Blocks,
            priority: 2,
            image: () =>
              ui.prefs.darkMode() ? ui.images.omni_insert.line_block_dark : ui.images.omni_insert.line_block,
          },
        ),
      ];
    },
  };
};

export default extension;
