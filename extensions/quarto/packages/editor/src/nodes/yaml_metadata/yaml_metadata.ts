/*
 * yaml_metadata.ts
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

import { Node as ProsemirrorNode, DOMOutputSpec, ParseRule } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';
import { setTextSelection } from 'prosemirror-utils';

import { ExtensionContext, Extension } from '../../api/extension';
import { PandocOutput, PandocTokenType } from '../../api/pandoc';
import { EditorUI } from '../../api/ui-types';
import { ProsemirrorCommand, EditorCommandId } from '../../api/command';
import { canInsertNode } from '../../api/node';
import { codeNodeSpec } from '../../api/code';
import { selectionIsBodyTopLevel } from '../../api/selection';
import { yamlMetadataTitlePlugin } from './yaml_metadata-title';
import { yamlMetadataBlockCapsuleFilter } from './yaml_metadata-capsule';
import { OmniInsertGroup } from '../../api/omni_insert';
import { fragmentText } from '../../api/fragment';
import { stripYamlDelimeters } from '../../api/yaml';

const extension = (context: ExtensionContext): Extension => {
  const { ui } = context;

  return {
    nodes: [
      {
        name: 'yaml_metadata',

        spec: {
          ...codeNodeSpec(),
          attrs: {
            navigation_id: { default: null },
          },
          parseDOM: [
            {
              tag: "div[class*='yaml-block']",
              preserveWhitespace: 'full',
            } as ParseRule,
          ],
          toDOM(): DOMOutputSpec {
            return ['div', { class: 'yaml-block pm-code-block' }, 0];
          },
        },

        code_view: {
          lang: () => 'yaml-frontmatter',
          classes: ['pm-metadata-background-color', 'pm-yaml-metadata-block'],
        },

        pandoc: {
          blockCapsuleFilter: yamlMetadataBlockCapsuleFilter(),

          writer: (output: PandocOutput, node: ProsemirrorNode) => {
            output.writeToken(PandocTokenType.Para, () => {
              const yaml = '---\n' + stripYamlDelimeters(fragmentText(node.content)) + '\n---';
              output.writeRawMarkdown(yaml);
            });
          },
        },
      },
    ],

    commands: () => {
      return [new YamlMetadataCommand(ui)];
    },

    plugins: () => [yamlMetadataTitlePlugin()],
  };
};

class YamlMetadataCommand extends ProsemirrorCommand {
  constructor(ui: EditorUI) {
    super(
      EditorCommandId.YamlMetadata,
      [],
      (state: EditorState, dispatch?: (tr: Transaction) => void) => {
        const schema = state.schema;

        if (!canInsertNode(state, schema.nodes.yaml_metadata)) {
          return false;
        }

        // only allow inserting at the top level
        if (!selectionIsBodyTopLevel(state.selection)) {
          return false;
        }

        // create yaml metadata text
        if (dispatch) {
          const tr = state.tr;
          const kYamlLeading = '---\n';
          const kYamlTrailing = '\n---';
          const yamlText = schema.text(kYamlLeading + kYamlTrailing);
          const yamlNode = schema.nodes.yaml_metadata.create({}, yamlText);
          tr.replaceSelectionWith(yamlNode);
          setTextSelection(tr.mapping.map(state.selection.from) - kYamlTrailing.length - 1)(tr);
          dispatch(tr);
        }

        return true;
      },
      {
        name: ui.context.translateText('YAML'),
        description: ui.context.translateText('YAML metadata block'),
        group: OmniInsertGroup.Blocks,
        priority: 3,
        selectionOffset: 4,
        image: () =>
          ui.prefs.darkMode() ? ui.images.omni_insert.yaml_block_dark : ui.images.omni_insert.yaml_block,
      },
    );
  }
}

export default extension;
