/*
 * definition_list-pandoc.ts
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

import { Schema, Node as ProsemirrorNode } from 'prosemirror-model';

import { ProsemirrorWriter, PandocToken, PandocOutput, PandocTokenType } from '../../api/pandoc';

export function readPandocDefinitionList(schema: Schema) {
  return (writer: ProsemirrorWriter, tok: PandocToken) => {
    writer.openNode(schema.nodes.definition_list, {});

    const definitions = tok.c;
    definitions.forEach((definition: [PandocToken[], PandocToken[][]]) => {
      const term = definition[0];
      writer.openNode(schema.nodes.definition_list_term, {});
      writer.writeTokens(term);
      writer.closeNode();

      const descriptions = definition[1];
      descriptions.forEach(description => {
        writer.openNode(schema.nodes.definition_list_description, {});
        writer.writeTokens(description);
        writer.closeNode();
      });
    });
    writer.closeNode();
  };
}

export function writePandocDefinitionList(output: PandocOutput, node: ProsemirrorNode) {
  output.writeToken(PandocTokenType.DefinitionList, () => {
    // collect terms and descriptions
    const currentDefinition: {
      term?: ProsemirrorNode;
      descriptions: ProsemirrorNode[];
    } = { descriptions: new Array<ProsemirrorNode>() };

    // functions to manipulate current definition
    function writeCurrent() {
      if (currentDefinition.term) {
        output.writeArray(() => {
          output.writeNode(currentDefinition.term!);
          output.writeArray(() => {
            currentDefinition.descriptions.forEach(description => {
              output.writeNode(description);
            });
          });
        });
      }
    }

    // write the list
    node.forEach(child => {
      if (child.type === child.type.schema.nodes.definition_list_term) {
        writeCurrent();
        currentDefinition.term = child;
        currentDefinition.descriptions = [];
      } else {
        currentDefinition.descriptions.push(child);
      }
    });
    writeCurrent();
  });
}

export function writePandocDefinitionListTerm(output: PandocOutput, node: ProsemirrorNode) {
  output.writeArray(() => {
    output.writeInlines(node.content);
  });
}

export function writePandocDefinitionListDescription(output: PandocOutput, node: ProsemirrorNode) {
  output.writeArray(() => {
    output.writeNodes(node);
  });
}
