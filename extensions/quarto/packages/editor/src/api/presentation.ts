/*
 * presentation.ts
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

import { EditorState } from 'prosemirror-state';

import { findTopLevelBodyNodes } from './node';
import { titleFromState, valueFromYamlText, yamlFrontMatter } from './yaml';

export interface PresentationEditorLocation {
  items: PresentationEditorLocationItem[];
  auto_slide_level: number;
  toc: boolean;
}

export const kPresentationEditorLocationTitle = "title";
export const kPresentationEditorLocationHeading = "heading";
export const kPresentationEditorLocationHr = "hr";
export const kPresentationEditorLocationCursor = "cursor";

export interface PresentationEditorLocationItem {
  type: string;
  level: number;
  // extra field we use internally for navigation
  pos: number;
}

export function getPresentationEditorLocation(state: EditorState) : PresentationEditorLocation {
  
  // not the cursor position
  const cursorPos = state.selection.from;

  // build list of items
  let autoSlideLevel = Number.MAX_VALUE;
  const items: PresentationEditorLocationItem[] = [];

  // get top level headings and horizontal rules
  const schema = state.schema;
  const bodyNodes = findTopLevelBodyNodes(state.doc, () => true);

  // bail if empty
  if (bodyNodes.length === 0) {
    return { items, auto_slide_level: 0, toc: false };
  }

  // start with title if we have one. note that pandoc will make the title slide
  // first no matter where it appears in the document, so we do the same here
  const title = titleFromState(state);
  if (title) {
    items.push({ 
      type: kPresentationEditorLocationTitle, 
      level: 0,
      pos: bodyNodes[0].pos
    });
  }

  // toc
  const toc = !!valueFromYamlText('toc', yamlFrontMatter(state.doc));

  // get top level headings and horizontal rules
  let pendingAutoSlideLevel = 0;
  let foundCursor = false;
  for (const nodeWithPos of bodyNodes) {
    // if node is past the selection then add the cursor token
    if (!foundCursor && (nodeWithPos.pos > cursorPos)) {
      foundCursor = true;
      items.push({
        type: kPresentationEditorLocationCursor,
        level: 0,
        pos: nodeWithPos.pos
      });
    }
    // add the node with the requisite type
    const node = nodeWithPos.node;
    if (node.type === schema.nodes.heading) {
      const level = node.attrs.level || 0;
      // track pending auto slide level
      if (level < autoSlideLevel) {
        pendingAutoSlideLevel = level;
      } else{
        pendingAutoSlideLevel= 0;
      }
      items.push({
        type: kPresentationEditorLocationHeading,
        level,
        pos: nodeWithPos.pos
      });
    } else if (node.type === schema.nodes.horizontal_rule) {
      items.push({
        type: kPresentationEditorLocationHr,
        level: 0,
        pos: nodeWithPos.pos
      });
      pendingAutoSlideLevel= 0;
    } else if (pendingAutoSlideLevel > 0) {
      autoSlideLevel = pendingAutoSlideLevel;
      pendingAutoSlideLevel = 0;
    }
  }

  // if we didn't find the cursor then put it at the end
  if (!foundCursor && items.length > 0) {
    items.push({
      type: kPresentationEditorLocationCursor,
      level: 0,
      pos: items[items.length-1].pos
    });
  }

  // last chance to collect pending auto slide level
  if (pendingAutoSlideLevel > 0){
    autoSlideLevel = pendingAutoSlideLevel;
  }
  
  // didn't find an auto slide level
  if (autoSlideLevel === Number.MAX_VALUE) {
    autoSlideLevel = 0;
  }
  
  // return the items
  return { items, auto_slide_level: autoSlideLevel, toc };
}

export function positionForPresentationEditorLocation(
  state: EditorState, 
  location: PresentationEditorLocation
) : number {
  // get the positions of the editor's current state (filter out cursor)
  const editorItems = getPresentationEditorLocation(state).items
    .filter(item => item.type !== kPresentationEditorLocationCursor);
  
  // get the index of the cursor passed in the location
  const cursorIdx = location.items.findIndex(
    item => item.type === kPresentationEditorLocationCursor)
  ;

  // go one slide before the cursor
  if (cursorIdx >= 0) {
    const locationItem = editorItems[cursorIdx];
    return locationItem.pos;
  }

  // default if we can't find a location
  return -1;
}

export function slideIndexForPresentationEditorLocation(location: PresentationEditorLocation) {
  let slideIndex = -1;
  for (const item of location.items) {
    if (item.type === kPresentationEditorLocationCursor) {
      slideIndex = (slideIndex > 0 && location.toc) ? slideIndex + 1 : slideIndex;
      return Math.max(slideIndex, 0);
    } else if (item.type === kPresentationEditorLocationTitle || 
                item.type === kPresentationEditorLocationHr) {
      slideIndex++;
    } else if (item.type === kPresentationEditorLocationHeading && 
                item.level <= location.auto_slide_level + 1) {
      slideIndex++;
    }
  }
  return 0;
}