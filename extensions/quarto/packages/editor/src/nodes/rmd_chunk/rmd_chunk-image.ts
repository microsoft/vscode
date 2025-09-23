/*
 * rmd_chunk-image.ts
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
import { Plugin, PluginKey, Transaction, EditorState, EditorStateConfig } from 'prosemirror-state';
import { DecorationSet, Decoration, EditorView } from 'prosemirror-view';

import { findChildrenByType, setTextSelection } from 'prosemirror-utils';

import { transactionsAreTypingChange, transactionsHaveChange } from '../../api/transaction';
import { EditorUIContext } from '../../api/ui-types';
import { onElementRemoved } from '../../api/dom';
import { mapResourceToURL } from '../../api/resource';
import { stripQuotes } from 'core';

const key = new PluginKey<DecorationSet>('rmd-chunk-image-preview');

export class RmdChunkImagePreviewPlugin extends Plugin<DecorationSet> {
  constructor(uiContext: EditorUIContext) {
    super({
      key,
      state: {
        init: (_config: EditorStateConfig, state: EditorState) => {
          return imagePreviewDecorations(state, uiContext);
        },
        apply: (tr: Transaction, old: DecorationSet, oldState: EditorState, newState: EditorState) => {
          const transactions = [tr];

          // doc didn't change, return existing decorations
          if (!tr.docChanged) {
            return old.map(tr.mapping, tr.doc);

            // non-typing change, do a full rescan
          } else if (!transactionsAreTypingChange(transactions)) {
            return imagePreviewDecorations(newState, uiContext);

            // change that affects a rmd chunk block, do a full rescan
          } else if (transactionsHaveChange(transactions, oldState, newState, isRmdChunkNode)) {
            return imagePreviewDecorations(newState, uiContext);
          }

          // otherwise return the existing set (mapped)
          else {
            return old.map(tr.mapping, tr.doc);
          }
        },
      },
      props: {
        decorations: (state: EditorState) => {
          return key.getState(state);
        },
      },
    });
  }
}

function imagePreviewDecorations(state: EditorState, uiContext: EditorUIContext) {
  // find all rmd code chunks with knitr::include_graphics
  const decorations: Decoration[] = [];
  findChildrenByType(state.doc, state.schema.nodes.rmd_chunk).forEach(rmdChunk => {
    // look for a line with knitr::include_graphics
    const match = rmdChunk.node.textContent.match(/^(knitr::)?include_graphics\((['"])([^\2]+)\2/m);
    if (match) {
      // see if we can also find an out.width on the first line
      let width = '';
      const firstLine = rmdChunk.node.textContent.split(/\r?\n/)[0];
      const widthMatch = firstLine.match(/^\s*\{[r|R][, ].*out\.width\s*=\s*([^ ,$]+).*}/);
      if (widthMatch) {
        width = stripQuotes(widthMatch[1].trim());
        // revert if they are using out.width = NULL
        if (width === 'NULL') {
          width = '';
        }
      }

      // see if we can find fig.align='center'
      const alignCenter = !!firstLine.match(/^\s*\{[r|R][, ].*fig\.align\s*=\s*['"]?center['"]?/);

      const imagePath = match[3];
      const decoration = Decoration.widget(
        rmdChunk.pos + rmdChunk.node.nodeSize,
        (view: EditorView, getPos: () => number | undefined) => {
          const container = window.document.createElement('div');
          container.style.marginTop = '-1.5em'; // to bridge back to the codemirror block
          // which has a margin-block-end of 1em
          container.classList.add('pm-image-preview');
          container.classList.add('pm-block-border-color');
          const img = window.document.createElement('img');
          if (alignCenter) {
            img.classList.add('pm-image-centered');
          }

          mapResourceToURL(uiContext, imagePath).then(url => {
            img.src = url;
          });
          img.setAttribute('draggable', 'false');

          // watch for changes to the file
          const unsubscribe = uiContext.watchResource(imagePath, () => {
            mapResourceToURL(uiContext, imagePath).then(url => {
              img.src = url;
            });
          });
          onElementRemoved(view.dom, container, unsubscribe);

          if (width) {
            img.setAttribute('width', width);
          }
          img.draggable = false;
          img.onload = () => {
            img.alt = '';
          };
          img.onerror = () => {
            img.alt = ` ${uiContext.translateText('Image not found')}: ${imagePath}`;
          };
          // select rmd_chunk for clicks on the preview image
          img.onclick = () => {
            const pos = getPos();
            if (pos !== undefined) {
              const tr = view.state.tr;
              setTextSelection(pos - 1)(tr);
              view.dispatch(tr);
            }
          };
          container.append(img);
          return container;
        },
        { key: imagePath + 'width:' + width + 'center:' + alignCenter },
      );
      decorations.push(decoration);
    }
  });

  // return decorations
  return DecorationSet.create(state.doc, decorations);
}

function isRmdChunkNode(node: ProsemirrorNode) {
  return node.type === node.type.schema.nodes.rmd_chunk;
}
