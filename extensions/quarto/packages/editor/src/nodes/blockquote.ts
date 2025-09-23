/*
 * blockquote.ts
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

import { wrappingInputRule } from 'prosemirror-inputrules';
import { Node as ProsemirrorNode, Schema, DOMOutputSpec } from 'prosemirror-model';

import { WrapCommand, EditorCommandId } from '../api/command';
import { ExtensionContext } from '../api/extension';
import { PandocOutput, PandocTokenType } from '../api/pandoc';
import { EditorUI } from '../api/ui-types';
import { OmniInsertGroup } from '../api/omni_insert';

const extension = (context: ExtensionContext) => {
  const { ui } = context;

  return {
    nodes: [
      {
        name: 'blockquote',
        spec: {
          content: 'block+',
          group: 'block',
          defining: true,
          parseDOM: [{ tag: 'blockquote' }],
          toDOM(): DOMOutputSpec {
            return ['blockquote', { class: 'pm-blockquote pm-block-border-color' }, 0];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.BlockQuote,
              block: 'blockquote',
            },
          ],
          writer: (output: PandocOutput, node: ProsemirrorNode) => {
            output.writeToken(PandocTokenType.BlockQuote, () => {
              output.writeNodes(node);
            });
          },
        },
      },
    ],

    commands: (schema: Schema) => {
      return [new WrapCommand(EditorCommandId.Blockquote, [], schema.nodes.blockquote, {}, blockquoteOmniInsert(ui))];
    },

    inputRules: (schema: Schema) => {
      return [wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote)];
    },
  };
};

function blockquoteOmniInsert(ui: EditorUI) {
  return {
    name: ui.context.translateText('Blockquote'),
    description: ui.context.translateText('Section quoted from another source'),
    group: OmniInsertGroup.Blocks,
    priority: 8,
    image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.blockquote_dark : ui.images.omni_insert.blockquote),
  };
}

export default extension;
