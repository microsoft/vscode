import { Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { NodeWithPos } from 'prosemirror-utils';

import { 
  EditingOutlineLocation, 
  EditingOutlineLocationItem, 
  kHeadingOutlineItemType, 
  kRmdchunkOutlineItemType, 
  kYamlMetadataOutlineItemType 
} from 'editor-types';


import { bodyElement } from './dom';
import {
  getDocumentOutline,
} from './outline';
import { restoreSelection } from './selection';
import { scrollToPos } from './scroll';

export interface EditingLocation {
  pos: number;
  scrollTop: number;
}

export function getEditingLocation(view: EditorView): EditingLocation {
  const pos = view.state.selection.from;
  const bodyEl = bodyElement(view);
  const scrollTop = bodyEl.scrollTop;
  return { pos, scrollTop };
}

export function setEditingLocation(
  view: EditorView,
  outlineLocation?: EditingOutlineLocation,
  previousLocation?: EditingLocation,
) {
  // get the current document outline
  const documentOutline = getDocumentOutline(view.state);

  // if all of the types and levels match up to the active outline item,
  // then we have a candidate match
  let docOutlineLocationNode: NodeWithPos | undefined;

  if (outlineLocation) {
    for (let i = 0; i < outlineLocation.items.length && i < documentOutline.length; i++) {
      // get the item and it's peer
      const item = outlineLocation.items[i];
      const docOutlineNode = documentOutline[i];

      // if they don't match then bail (can't resolve different interpretations of the outline)
      if (!outlineItemSimillarToNode(item, docOutlineNode.node)) {
        break;
      }

      // if this is the active item
      if (item.active) {
        // see if the previous location is actually a better target (because it's between this location and
        // the next outline node). in that case we don't set the target node and we leave the restorePos
        // at the previous location
        if (!locationIsBetweenDocOutlineNodes(docOutlineNode, documentOutline[i + 1], previousLocation)) {
          // set the target
          docOutlineLocationNode = docOutlineNode;

          // if this is an rmd chunk then advance to the second line
          if (docOutlineNode.node.type === view.state.schema.nodes.rmd_chunk) {
            const chunkText = docOutlineNode.node.textContent;
            const newlineIdx = chunkText.indexOf('\n');
            if (newlineIdx !== -1) {
              docOutlineLocationNode.pos += newlineIdx + 2;
            }
          }
        }

        break;
      }
    }
  }

  // do the restore
  if (docOutlineLocationNode) {
    restoreSelection(view, docOutlineLocationNode.pos);
    scrollToPos(view, docOutlineLocationNode.pos);
  } else if (previousLocation) {
    restoreSelection(view, previousLocation.pos);
    bodyElement(view).scrollTop = previousLocation.scrollTop;
  }
}

function outlineItemSimillarToNode(outlineItem: EditingOutlineLocationItem, docOutlneNode: ProsemirrorNode) {
  const schema = docOutlneNode.type.schema;
  if (outlineItem.type === kYamlMetadataOutlineItemType) {
    return docOutlneNode.type === schema.nodes.yaml_metadata;
  } else if (outlineItem.type === kRmdchunkOutlineItemType) {
    return docOutlneNode.type === schema.nodes.rmd_chunk;
  } else if (outlineItem.type === kHeadingOutlineItemType) {
    return docOutlneNode.type === schema.nodes.heading && docOutlneNode.attrs.level === outlineItem.level;
  } else {
    return false;
  }
}

function locationIsBetweenDocOutlineNodes(nodeA: NodeWithPos, nodeB?: NodeWithPos, location?: EditingLocation) {
  // bail if we don't have all the arguments
  if (!nodeB || !location) {
    return false;
  }
  return nodeA.pos < location.pos && nodeB.pos > location.pos;
}
