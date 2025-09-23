/*
 * TextPopup.ts
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

import { DecorationSet, Decoration, EditorView } from 'prosemirror-view';
import { Selection, Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state';

import * as React from 'react';

import { getMarkRange, getMarkAttrs } from './mark';
import { kRestoreLocationTransaction, kNavigationTransaction } from './transaction';

import { reactRenderForEditorView } from './widgets/react';
import { textRangePopupDecorationPosition } from './widgets/decoration';
import { kPlatformMac } from './platform';
import { MarkType } from 'prosemirror-model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TextPopupTarget<AttrsType = any> {
  attrs: AttrsType;
  text: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TextPopupDecoration<AttrsType = any> {
  key: PluginKey<DecorationSet>;
  markType: MarkType;
  maxWidth: number;
  createPopup: (
    view: EditorView,
    target: TextPopupTarget<AttrsType>,
    style: React.CSSProperties,
  ) => Promise<JSX.Element | null>;
  dismissOnEdit?: boolean;
  makeLinksAccessible?: boolean;
  specKey?: (target: TextPopupTarget<AttrsType>) => string;
  filter?: (selection: Selection) => boolean;
  onCmdClick?: (target: TextPopupTarget<AttrsType>) => void;
}

export function textPopupDecorationPlugin(deco: TextPopupDecoration): Plugin<DecorationSet> {
  const {
    key,
    markType,
    maxWidth,
    createPopup,
    specKey,
    dismissOnEdit,
    makeLinksAccessible,
    filter,
    onCmdClick,
  } = deco;

  let editorView: EditorView;

  return new Plugin<DecorationSet>({
    key,
    view(view: EditorView) {
      editorView = view;
      return {};
    },
    state: {
      init: () => {
        return DecorationSet.empty;
      },
      apply: (tr: Transaction, _old: DecorationSet, _oldState: EditorState, newState: EditorState) => {
        // if this a restore location or navigation then return empty
        if (tr.getMeta(kRestoreLocationTransaction) || tr.getMeta(kNavigationTransaction)) {
          return DecorationSet.empty;
        }

        // if this is doc update and we have dismiss on edit then return empty
        if (dismissOnEdit && tr.docChanged) {
          return DecorationSet.empty;
        }

        // if the selection is contained within the mark then show the popup
        const selection = newState.selection;

        // TODO JJA: The mark range is undefined when the the selection is 'after' the mark
        // e.g.  [@allaire2012|]
        // which means that the preview doesn't show
        const range = getMarkRange(selection.$from, markType);

        if (range) {
          // selection has to be bounded by the range
          if (selection.from < range.from || selection.to > range.to) {
            return DecorationSet.empty;
          }

          // apply the filter
          if (filter && !filter(selection)) {
            return DecorationSet.empty;
          }

          // don't show the link popup if it's positioned at the far left of the mark
          // (awkward when cursor is just left of an image)
          if (selection.empty && range.from === selection.from) {
            return DecorationSet.empty;
          }

          // mark target
          const attrs = getMarkAttrs(newState.doc, range, markType);
          const text = newState.doc.textBetween(range.from, range.to);
          const target = { attrs, text };

          // compute position (we need this both for setting the styles on the LinkPopup
          // as well as for setting the Decorator pos)
          const decorationPosition = textRangePopupDecorationPosition(editorView, range, maxWidth);

          // key if one was provided
          let decoratorSpec: Record<string,unknown> | undefined;
          if (specKey) {
            decoratorSpec = {
              key: decorationPosition.key + specKey(target),
              ignoreSelection: true,
              stopEvent: () => {
                return true;
              },
            };
          }

          // create decorator
          const textPopupDecorator = Decoration.widget(
            decorationPosition.pos,

            (view: EditorView) => {
              // create decorator and render popup into it
              const decorationEl = window.document.createElement('div');
              decorationEl.style.visibility = 'hidden';

              // create popup component
              createPopup(view, target, decorationPosition.style).then(popup => {
                if (popup) {
                  reactRenderForEditorView(popup, decorationEl, view);

                  // make sure links responsd to spacebar
                  if (makeLinksAccessible) {
                    const links = decorationEl.getElementsByTagName('a');
                    // tslint:disable-next-line: prefer-for-of
                    for (let i = 0; i < links.length; i++) {
                      const link = links[0];
                      link.onkeydown = (e: KeyboardEvent) => {
                        if (e.keyCode === 32) {
                          e.preventDefault();
                          link.click();
                        }
                      };
                    }
                  }

                  decorationEl.style.visibility = 'visible';
                }
              });

              return decorationEl;
            },

            decoratorSpec,
          );

          // return decorations
          return DecorationSet.create(tr.doc, [textPopupDecorator]);
        } else {
          return DecorationSet.empty;
        }
      },
    },
    props: {
      decorations: (state: EditorState) => {
        return key.getState(state);
      },
      handleClick: onCmdClick
        ? (view: EditorView, pos: number, event: MouseEvent) => {
            const keyPressed = kPlatformMac && event.metaKey;
            if (keyPressed) {
              const attrs = getMarkAttrs(view.state.doc, { from: pos, to: pos }, markType);
              const range = getMarkRange(view.state.doc.resolve(pos));
              if (attrs && range) {
                event.stopPropagation();
                event.preventDefault();
                const text = view.state.doc.textBetween(range.from, range.to);
                onCmdClick({ attrs, text });
                return true;
              }
            }
            return false;
          }
        : undefined,
    },
  });
}
