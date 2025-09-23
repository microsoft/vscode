/*
 * outline.ts
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

import { Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

import { NodeWithPos, findChildrenByType, findChildren } from 'prosemirror-utils';

import { 
  EditingOutlineLocation, 
  EditingOutlineLocationItem, 
  kHeadingOutlineItemType, 
  kRmdchunkOutlineItemType, 
  kYamlMetadataOutlineItemType 
} from 'editor-types';

import { findTopLevelBodyNodes } from './node';
import { titleFromYamlMetadataNode } from './yaml';
import { rmdChunkEngineAndLabel } from './rmd';



export function getEditingOutlineLocation(state: EditorState): EditingOutlineLocation {
  // traverse document outline to get base location info
  const itemsWithPos = getDocumentOutline(state).map(nodeWithPos => {
    const schema = state.schema;
    const node = nodeWithPos.node;
    const item: EditingOutlineLocationItem = {
      type: kYamlMetadataOutlineItemType,
      level: 0,
      title: '',
      active: false,
      position: nodeWithPos.pos,
    };
    if (node.type === schema.nodes.yaml_metadata) {
      item.type = kYamlMetadataOutlineItemType;
      item.title = titleFromYamlMetadataNode(node) || '';
    } else if (node.type === schema.nodes.rmd_chunk) {
      item.type = kRmdchunkOutlineItemType;
      const chunk = rmdChunkEngineAndLabel(node.textContent);
      if (chunk) {
        item.title = chunk.label;
      }
    } else if (node.type === schema.nodes.heading) {
      item.type = kHeadingOutlineItemType;
      item.level = node.attrs.level;
      item.title = node.textContent;
    }
    return {
      item,
      pos: nodeWithPos.pos,
    };
  });

  // return the location, set the active item by scanning backwards until
  // we find an item with a position before the cursor
  let foundActive = false;
  const items: EditingOutlineLocationItem[] = [];
  for (let i = itemsWithPos.length - 1; i >= 0; i--) {
    const item = itemsWithPos[i].item;
    if (!foundActive && itemsWithPos[i].pos < state.selection.from) {
      item.active = true;
      foundActive = true;
    }
    items.unshift(item);
  }

  // return the outline
  return { items };
}

// get a document outline that matches the scheme provided in EditingOutlineLocation:
//  - yaml metadata blocks
//  - top-level headings
//  - rmd chunks at the top level or within a top-level list or div,
export function getDocumentOutline(state: EditorState): NodeWithPos[] {
  // get top level body nodes
  const schema = state.schema;
  const bodyNodes = findTopLevelBodyNodes(state.doc, node => {
    return [
      schema.nodes.yaml_metadata,
      schema.nodes.rmd_chunk,
      schema.nodes.heading,
      schema.nodes.bullet_list,
      schema.nodes.ordered_list,
      schema.nodes.div
    ].includes(node.type);
  });

  // reduce (explode lists into contained rmd chunks)
  const outlineNodes: NodeWithPos[] = [];
  bodyNodes.forEach(bodyNode => {
    // explode lists
    if ([schema.nodes.bullet_list, schema.nodes.ordered_list].includes(bodyNode.node.type)) {
      // look for rmd chunks within list items (non-recursive, only want top level)
      findChildrenByType(bodyNode.node, schema.nodes.list_item, false).forEach(listItemNode => {
        findChildrenByType(listItemNode.node, schema.nodes.rmd_chunk, false).forEach(rmdChunkNode => {
          outlineNodes.push({
            node: rmdChunkNode.node,
            pos: bodyNode.pos + 1 + listItemNode.pos + 1 + rmdChunkNode.pos,
          });
        });
      });

      // find headings and rmd chunks within divs
    } else if (schema.nodes.div === bodyNode.node.type) {
      findChildren(bodyNode.node, 
                   node => [schema.nodes.rmd_chunk, schema.nodes.heading].includes(node.type),
                   true)
        .forEach(childNode => {
          outlineNodes.push({
            node: childNode.node,
            pos: bodyNode.pos + 1 + childNode.pos
          });
        }
      );
    
      // other nodes go straight through
    } else {
      outlineNodes.push(bodyNode);
    }
  });

  // return outline nodes
  return outlineNodes;
}

export function getOutlineNodes(doc: ProsemirrorNode) {
  return findTopLevelBodyNodes(doc, isOutlineNode);
}

export function isOutlineNode(node: ProsemirrorNode) {
  if (node.type.spec.attrs) {
    return Object.prototype.hasOwnProperty.call(node.type.spec.attrs,'navigation_id');
  } else {
    return false;
  }
}
