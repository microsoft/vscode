/*
 * math-preview.ts
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

import { Plugin, PluginKey } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ResolvedPos } from 'prosemirror-model';

import debounce from 'lodash.debounce';
import zenscroll from 'zenscroll';

import { EditorUI } from '../../api/ui-types';
import { getMarkRange } from '../../api/mark';
import { EditorEvents } from '../../api/event-types';
import { ScrollEvent, ResizeEvent } from '../../api/event-types';
import { applyStyles } from '../../api/css';
import { editingRootNodeClosestToPos, editingRootNode } from '../../api/node';
import { createPopup } from '../../api/widgets/widgets';
import { EditorMath } from '../../api/ui-types';
import { editorScrollContainer } from '../../api/scroll';

const kMathPopupVerticalOffset = 10;
const kMathPopupInputDebuounceMs = 250;

const key = new PluginKey('math-preview');

export class MathPopupPlugin extends Plugin {
  private readonly ui: EditorUI;
  private readonly math: EditorMath;

  private view: EditorView | null = null;

  private popup: HTMLElement | null = null;
  private lastRenderedMath: string | null = null;

  private readonly updatePopupTimer: number;

  private scrollUnsubscribe: VoidFunction;
  private resizeUnsubscribe: VoidFunction;

  constructor(ui: EditorUI, math: EditorMath, events: EditorEvents, onHover: boolean) {
    super({
      key,
      view: () => {
        return {
          update: debounce(
            (view: EditorView) => {
              this.view = view;
              this.updatePopup();
            },
            kMathPopupInputDebuounceMs,
            { leading: true, trailing: true },
          ),
          destroy: () => {
            clearInterval(this.updatePopupTimer);
            this.scrollUnsubscribe();
            this.resizeUnsubscribe();
            this.closePopup();
          },
        };
      },
      props: {
        handleDOMEvents: {
          ...(onHover
            ? {
                mousemove: debounce((view: EditorView, event: Event) => {
                  const ev = event as MouseEvent;
                  const pos = view.posAtCoords({ top: ev.clientY, left: ev.clientX });
                  if (pos && pos.inside !== -1) {
                    this.updatePopup(view.state.doc.resolve(pos.pos));
                  }
                  return false;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }, kMathPopupInputDebuounceMs) as (view: EditorView, event: Event) => boolean,
              }
            : {}),
        },
      },
    });

    // save reference to ui and math
    this.ui = ui;
    this.math = math;

    // update popup for resize, scrolling, as well as every 100ms to cover reflowing
    // of the document as a result of latex math being shown/hidden (will effectively
    // be a no-op if the math text and  document layout / scroll position hasn't changed)
    this.updatePopup = this.updatePopup.bind(this);
    this.updatePopupTimer = window.setInterval(this.updatePopup, 100);
    this.scrollUnsubscribe = events.subscribe(ScrollEvent, () => this.updatePopup());
    this.resizeUnsubscribe = events.subscribe(ResizeEvent, () => this.updatePopup());
  }

  private updatePopup($mousePos?: ResolvedPos) {
    // bail if we don't have a view
    if (!this.view) {
      return;
    }

    // capture state, etc.
    const state = this.view.state;
    const schema = state.schema;

    // determine math range
    let range: false | { from: number; to: number } = false;

    // if a $pos was passed (e.g. for a mouse hover) then check that first
    if ($mousePos) {
      range = getMarkRange($mousePos, schema.marks.math);
    }

    // if that didn't work try the selection
    if (!range) {
      range = getMarkRange(state.selection.$from, schema.marks.math);
    }

    // bail if we don't have a target
    if (!range) {
      this.closePopup();
      return;
    }

    // bail if the user has this disabled
    if (!this.ui.prefs.equationPreview()) {
      this.closePopup();
      return;
    }

    // get the math text. bail if it's empty
    const inlineMath = state.doc.textBetween(range.from, range.to);
    if (inlineMath.match(/^\${1,2}\s*\${1,2}$/)) {
      this.closePopup();
      return;
    }

    // get the position for the range
    const styles = popupPositionStyles(this.view, range);

    // if the popup already exists just move it
    if (this.popup) {
      applyStyles(this.popup, [], styles);
    } else {
      this.popup = createPopup(this.view, ['pm-math-preview'], undefined, {
        ...styles,
        visibility: 'hidden',
      });
      this.view.dom.parentNode?.appendChild(this.popup);
    }

    // typeset the math if we haven't already
    if (inlineMath !== this.lastRenderedMath && this.popup) {
      this.math.typeset!(this.popup, inlineMath, true).then(error => {
        if (!error) {
          if (this.popup) {
            this.popup.style.visibility = 'visible';
            this.lastRenderedMath = inlineMath;
            // autoscroll for non-mouse triggers
            if (!$mousePos && range) {
              this.autoscollPopup(range);
            }
          }
        }
      });
    }
  }

  private closePopup() {
    this.lastRenderedMath = null;
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
  }

  private autoscollPopup(mathRange: { from: number; to: number }) {
    const editingRoot = editingRootNode(this.view!.state.selection);
    if (editingRoot) {
      const editorEl = this.view!.nodeDOM(editingRoot.pos) as HTMLElement;
      const editorBox = editorEl.getBoundingClientRect();
      const popupBox = this.popup!.getBoundingClientRect();
      if (popupBox.top + popupBox.height + kMathPopupVerticalOffset > editorBox.bottom) {
        const mathBottom = this.view!.coordsAtPos(mathRange.to);
        const mathScrollBottom = editorEl.scrollTop + mathBottom.bottom;
        const mathPopupScrollBottom = mathScrollBottom + kMathPopupVerticalOffset + popupBox.height;
        const scrollTop = mathPopupScrollBottom + kMathPopupVerticalOffset - editorBox.top - editorBox.height;
        const scroller = zenscroll.createScroller(editorScrollContainer(editorEl));
        scroller.toY(scrollTop, 100);
      }
    }
  }
}

function popupPositionStyles(view: EditorView, range: { from: number; to: number }) {
  // get coordinates for editor view (use to offset)
  const editorBox = (view.dom.parentNode! as HTMLElement).getBoundingClientRect();

  // +1 to ensure beginning of line doesn't resolve as line before
  // (will subtract it back out below)
  const rangeStartCoords = view.coordsAtPos(range.from + 1);
  const rangeEndCoords = view.coordsAtPos(range.to);

  // default positions
  const top = Math.round(rangeEndCoords.bottom - editorBox.top) + kMathPopupVerticalOffset + 'px';
  let left = `calc(${Math.round(rangeStartCoords.left - editorBox.left)}px - 1ch)`;

  // if it flow across two lines then position at far left of editing root
  // (we give it the 5 pixels of wiggle room so that detection still works
  // when a mathjax preview is shown in place of math text)
  if (Math.abs(rangeStartCoords.bottom - rangeEndCoords.bottom) > 5) {
    const editingRoot = editingRootNodeClosestToPos(view.state.doc.resolve(range.from));
    if (editingRoot) {
      const editingEl = view.nodeDOM(editingRoot.pos) as HTMLElement;
      if (editingEl) {
        const editingElStyle = window.getComputedStyle(editingEl);
        left = `calc(${editingEl.getBoundingClientRect().left}px + ${editingElStyle.paddingLeft} - 1ch - 2px)`;
      }
    }
  }

  // return position
  return { top, left };
}
