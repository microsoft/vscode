/*
 * yaml_metadata-title.ts
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

import { Plugin, PluginKey, Transaction, EditorState } from 'prosemirror-state';

import { transactionsAreTypingChange, transactionsHaveChange } from '../../api/transaction';
import {
  isYamlMetadataNode,
  yamlMetadataNodes,
  kYamlMetadataTitleRegex,
  titleFromState,
} from '../../api/yaml';

const plugin = new PluginKey<string>('yaml-metadata-title');

export function yamlMetadataTitlePlugin() {
  return new Plugin<string>({
    key: plugin,
    state: {
      init(_config, state: EditorState) {
        return titleFromState(state);
      },

      apply(tr: Transaction, title: string, oldState: EditorState, newState: EditorState) {
        const transactions = [tr];

        // doc didn't change, return existing title
        if (!tr.docChanged) {
          return title;

          // non-typing change, do a full rescan
        } else if (!transactionsAreTypingChange(transactions)) {
          return titleFromState(newState);

          // change that affects a yaml metadata block, do a full rescan
        } else if (transactionsHaveChange(transactions, oldState, newState, isYamlMetadataNode)) {
          return titleFromState(newState);
        }

        // otherwise return the existing title
        else {
          return title;
        }
      },
    },
  });
}

export function getTitle(state: EditorState) {
  return plugin.getState(state);
}

export function setTitle(state: EditorState, title: string) {
  // alias schema
  const schema = state.schema;

  // no-op if yaml_metadata isn't available
  if (!schema.nodes.yaml_metadata) {
    return;
  }

  // create transaction
  const tr = state.tr;

  // escape quotes in title then build the title line
  const escapedTitle = title.replace(/"/g, `\\"`);
  const titleLine = `\ntitle: "${escapedTitle}"\n`;

  // attempt to update existing title
  const yamlNodes = yamlMetadataNodes(tr.doc);
  let foundTitle = false;
  for (const yaml of yamlNodes) {
    const titleMatch = yaml.node.textContent.match(kYamlMetadataTitleRegex);
    if (titleMatch) {
      const updatedMetadata = yaml.node.textContent.replace(kYamlMetadataTitleRegex, titleLine);
      const updatedNode = schema.nodes.yaml_metadata.createAndFill({}, schema.text(updatedMetadata));
      if (updatedNode) {
        tr.replaceRangeWith(yaml.pos, yaml.pos + yaml.node.nodeSize, updatedNode);
        foundTitle = true;
        break;
      }
    }
  }

  // if we didn't find a title then inject one at the top
  if (!foundTitle) {
    const yamlText = schema.text(`---${titleLine}---`);
    const yamlNode = schema.nodes.yaml_metadata.create({}, yamlText);
    tr.insert(1, yamlNode);
  }

  // return transaction
  return tr;
}

