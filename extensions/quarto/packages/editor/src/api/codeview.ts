/*
 * code.ts
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

import { Node as ProsemirrorNode, NodeType } from 'prosemirror-model';

import { GapCursor } from 'prosemirror-gapcursor';
import { EditorView } from 'prosemirror-view';
import { EditorState } from 'prosemirror-state';

import { Position } from "vscode-languageserver-types";

import zenscroll from 'zenscroll';

import { lines } from 'core';

import { CommandFn } from "./command";
import { ExtensionFn } from "./extension-types";
import { editingRootNode } from './node';
import { editorScrollContainer } from './scroll';

import { rmdChunk } from './rmd';
import { CodeViewActiveBlockContext, CodeViewCellContext, CodeViewCompletionContext, CodeViewSelectionAction } from 'editor-types';
import { navigateToPos } from './navigation';

export const kCodeViewNextLineTransaction = "codeViewNextLine";

export type CodeViewExtensionFn = (codeViews: { [key: string]: CodeViewOptions; }) => ExtensionFn;

export interface CodeViewOptions {
  lang: (attrs: ProsemirrorNode, content: string) => string | null;
  attrEditFn?: CommandFn;
  createFromPastePattern?: RegExp;
  classes?: string[];
  borderColorClass?: string;
  firstLineMeta?: boolean;
  lineNumbers?: boolean;
  bookdownTheorems?: boolean;
  lineNumberFormatter?: (lineNumber: number, lineCount?: number, line?: string) => string;
}

/**
 * Track all code view node view instances to implement additional behavior
 * (e.g. gap cursor for clicks between editor instances)
 */

export interface CodeEditorNodeView {
  isFocused(): boolean;
  getPos(): number;
  dom: HTMLElement;
  setGapCursorPending(pending: boolean): void;
}

export class CodeEditorNodeViews {
  private nodeViews: CodeEditorNodeView[];

  constructor() {
    this.nodeViews = [];
  }
  public add(nodeView: CodeEditorNodeView) {
    this.nodeViews.push(nodeView);
  }

  public remove(nodeView: CodeEditorNodeView) {
    const index = this.nodeViews.indexOf(nodeView);
    if (index >= 0) {
      this.nodeViews.splice(index, 1);
    }
  }

  public activeNodeView(): CodeEditorNodeView | undefined {
    return this.nodeViews.find(view => view.isFocused());
  }

  public handleClick(view: EditorView, event: Event): boolean {
    // alias to mouseEvent
    const mouseEvent = event as MouseEvent;

    // see if the click is between 2 contiguously located node views
    for (const nodeView of this.nodeViews) {
      // gap cursor we might detect
      let gapCursor: GapCursor | null = null;

      // get the position
      const pos = nodeView.getPos();
      const $pos = view.state.doc.resolve(pos);

      // if the previous node is code, see if the click is between the 2 nodes
      if ($pos.nodeBefore && $pos.nodeBefore.type.spec.code) {
        // get our bounding rect
        const dom = nodeView.dom;
        const nodeViewRect = dom.getBoundingClientRect();

        // get the previous node's bounding rect
        const prevNodePos = pos - $pos.nodeBefore!.nodeSize;
        const prevNodeView = this.nodeViews.find(nv => nv.getPos() === prevNodePos);
        if (prevNodeView) {
          const prevNodeRect = prevNodeView.dom.getBoundingClientRect();

          // check for a click between the two nodes
          const mouseY = mouseEvent.clientY;
          if (mouseY > prevNodeRect.top + prevNodeRect.height && mouseY < nodeViewRect.top) {
            gapCursor = new GapCursor($pos);
          }
        }

        // if there is no previous node and the click is above us then gap cursor above
        // (only do this if the cursor is within 150 pixels of the left edge)
      } else if (
        !$pos.nodeBefore &&
        $pos.depth === 1 &&
        mouseEvent.clientY < nodeView.dom.getBoundingClientRect().top &&
        Math.abs(mouseEvent.clientX - nodeView.dom.getBoundingClientRect().left) < 150
      ) {
        gapCursor = new GapCursor($pos);
      }

      // return gapCursor if we found one
      if (gapCursor) {
        const tr = view.state.tr;

        // notify the node views that we are setting a gap cursor
        this.nodeViews.forEach(ndView => ndView.setGapCursorPending(true));

        // ensure the view is focused
        view.focus();

        // set the selection
        tr.setSelection(gapCursor);
        view.dispatch(tr);

        // notify the node views that we are done setting the gap cursor
        this.nodeViews.forEach(ndView => ndView.setGapCursorPending(false));

        // prevent default event handling
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
    }

    return false;
  }
}


export function scrollCodeViewElementIntoView(ele: HTMLElement, codeViewDom: HTMLElement, view: EditorView) {
  const editingRoot = editingRootNode(view.state.selection);
  if (editingRoot) {
    const container = view.nodeDOM(editingRoot.pos) as HTMLElement;
    const scroller = zenscroll.createScroller(editorScrollContainer(container));

    let top = 0;

    // The DOM node representing this editor chunk (this.dom) may not be a
    // direct child of the scrollable container. If it isn't, walk up the DOM
    // tree until we find the main content node (pm-content), which is the
    // offset parent against which we need to compute scroll position.
    let scrollParent = codeViewDom;
    while (scrollParent.offsetParent != null &&
      !scrollParent.offsetParent.classList.contains("pm-content")) {
      top += scrollParent.offsetTop;
      scrollParent = scrollParent.offsetParent as HTMLElement;
    }

    // Since the element we want to scroll into view is not a direct child of
    // the scrollable container, do a little math to figure out the
    // destination scroll position.
    top += ele.offsetTop + scrollParent.offsetTop;
    const bottom = top + ele.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = container.scrollTop + container.offsetHeight;

    // Scroll based on element's current position and size
    if (top > viewTop && bottom < viewBottom) {
      // Element is already fully contained in the viewport
      return;
    } else if (ele.offsetHeight > container.offsetHeight) {
      // Element is taller than the viewport, so show the first part of it
      scroller.toY(top);
    } else if (top < viewTop) {
      // Element is above viewport, so scroll it into view
      scroller.toY(top);
    } else if (bottom > viewBottom) {
      // Part of the element is beneath the viewport, so scroll just enough to
      // bring it into view
      scroller.toY(container.scrollTop - (viewBottom - bottom));
    }
  }
}

export function codeViewSetBlockSelection(
  view: EditorView,
  context: CodeViewActiveBlockContext,
  action: CodeViewSelectionAction
) {


  const activeIndex = context.blocks.findIndex(block => block.active);

  if (activeIndex !== -1) {
    if (action === "nextline") {
      const tr = view.state.tr;
      tr.setMeta(kCodeViewNextLineTransaction, true);
      view.dispatch(tr);
    } else {
      let navigatePos: number | undefined;
      if (action === "nextblock") {
        navigatePos = context.blocks[activeIndex + 1]?.pos;
      } else if (action === "prevblock") {
        navigatePos = context.blocks[activeIndex - 1]?.pos;
      }
      if (navigatePos) {
        navigateToPos(view, navigatePos!, false);
      }
    }
  }



}


export function codeViewActiveBlockContext(state: EditorState): CodeViewActiveBlockContext | undefined {
  return codeViewBlockContext(state, false, [state.schema.nodes.rmd_chunk]);
}


function codeViewBlockContext(state: EditorState, activeLanguageOnly = false, nodeTypes?: NodeType[]): CodeViewActiveBlockContext | undefined {

  // alias schema
  const schema = state.schema;

  // default to all types
  nodeTypes = nodeTypes || [schema.nodes.yaml_metadata, schema.nodes.rmd_chunk, schema.nodes.raw_block];

  // function to examine a node and see if has executable codes
  const nodeAsLanguageCodeBlock = (node: ProsemirrorNode, pos: number) => {
    const languageCodeBlock = (language: string, code?: string, metaLine?: boolean) => {
      return {
        language,
        pos,
        code: code || node.textContent,
        metaLine
      };
    };
    if (nodeTypes?.includes(node.type)) {
      if (node.type === schema.nodes.yaml_metadata) {
        return languageCodeBlock('yaml');
      } else if (node.type === schema.nodes.rmd_chunk) {
        const parts = rmdChunk(node.textContent);
        if (parts) {
          return languageCodeBlock(parts.lang, parts.code, true);
        } else {
          return undefined;
        }
      } else if (node.type === schema.nodes.raw_block) {
        return languageCodeBlock(node.attrs.format);
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  };

  // check the currently active node to see if it has a langauge
  const { parent, parentOffset, pos } = state.selection.$from;
  const { parentOffset: toParentOffset } = state.selection.$to;

  const activeBlock = nodeAsLanguageCodeBlock(parent, pos - parentOffset);
  if (activeBlock) {

    // compute start index (skip over meta line if there is one)
    const startIndex = activeBlock.metaLine
      ? lines(parent.textContent)[0].length + 1
      : 0;

    // compute position within the active block
    const positionForOffset = (offset: number) => {
      let line = 0, character = 0;
      for (let i = startIndex; i < offset; i++) {
        const ch = parent.textContent.at(i);
        if (!ch) {
          break;
        }
        if (ch === "\n") {
          line++;
          character = 0;
        } else {
          character++;
        }
      }
      return Position.create(line, character);
    };


    // collect all the blocks with this language
    const blocks: Array<{ pos: number, language: string, code: string; active: boolean; }> = [];
    state.doc.descendants((node, pos) => {
      const languageBlock = nodeAsLanguageCodeBlock(node, pos + 1);
      if (languageBlock) {
        if (!activeLanguageOnly || (languageBlock.language === activeBlock.language)) {
          blocks.push({
            ...languageBlock,
            active: languageBlock.pos === activeBlock.pos
          });
        }
      }
    });

    return {
      activeLanguage: activeBlock.language,
      blocks,
      selection: {
        start: positionForOffset(parentOffset),
        end: positionForOffset(toParentOffset)
      },
      selectedText: state.doc.textBetween(
        activeBlock.pos + Math.max(parentOffset, startIndex),
        activeBlock.pos + toParentOffset
      )
    };
  } else {
    return undefined;
  }
}


export function codeViewCompletionContext(filepath: string, state: EditorState, explicit: boolean): CodeViewCompletionContext | undefined {
  const context = codeViewCellContext(filepath, state);
  if (context) {
    return { ...context, explicit };
  } else {
    return undefined;
  }
}

export function stripYamlFrontmatterDelimiters(lines: string[]): string[] {
  return lines.map(line => !/^(---|\.\.\.)\s*$/.test(line) ? line : "");
}

export function codeViewCellContext(filepath: string, state: EditorState): CodeViewCellContext | undefined {

  // get blocks (for active language only)
  const activeBlockContext = codeViewBlockContext(state, true);

  if (activeBlockContext) {
    // if this is yaml we strip the delimiters and use only the active block
    if (activeBlockContext.activeLanguage === "yaml") {
      const activeBlock = activeBlockContext.blocks.find(block => block.active) || activeBlockContext.blocks[0];
      const codeLines = stripYamlFrontmatterDelimiters(lines(activeBlock.code));
      return {
        filepath,
        language: activeBlockContext.activeLanguage,
        code: codeLines,
        cellBegin: 0,
        cellEnd: codeLines.length - 1,
        selection: activeBlockContext.selection,
      };
      // concatenate together all of the code, and indicate start/end lines of active block
    } else {
      const code: string[] = [];
      let cellBegin = -1, cellEnd = -1;
      activeBlockContext.blocks.forEach(block => {
        const blockLines = lines(block.code);
        if (block.active) {
          cellBegin = code.length;
          cellEnd = code.length + blockLines.length - 1;
        }
        if (blockLines[blockLines.length - 1].trim().length !== 0) {
          blockLines.push("");
        }
        code.push(...blockLines);
      });
      return {
        filepath,
        language: activeBlockContext.activeLanguage,
        code,
        cellBegin,
        cellEnd,
        selection: {
          start: {
            line: cellBegin + activeBlockContext.selection.start.line,
            character: activeBlockContext.selection.start.character
          },
          end: {
            line: cellBegin + activeBlockContext?.selection.end.line,
            character: activeBlockContext?.selection.end.character
          }
        },
      };
    }
  } else {
    return undefined;
  }
}
