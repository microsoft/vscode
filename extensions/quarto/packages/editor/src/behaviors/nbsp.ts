/*
 * nbsp.ts
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

import { DecorationSet, Decoration } from 'prosemirror-view';
import { Plugin, PluginKey, EditorState, Transaction, EditorStateConfig } from 'prosemirror-state';
import { Node as ProsemirrorNode } from 'prosemirror-model';

import { EditorCommandId, InsertCharacterCommand } from '../api/command';
import { forChangedNodes } from '../api/transaction';
import { mergedTextNodes } from '../api/text';

const kNbsp = '\u00A0';
const kNbspRegEx = /\xA0/g;

const extension = {
  commands: () => {
    return [new InsertCharacterCommand(EditorCommandId.NonBreakingSpace, kNbsp, ['Ctrl-Space', 'Ctrl-Shift-Space'])];
  },

  plugins: () => {
    return [nonBreakingSpacePastePlugin(), nonBreakingSpaceHighlightPlugin()];
  },
};

const pastePluginKey = new PluginKey('nbsp-paste');

function nonBreakingSpacePastePlugin() {
  return new Plugin({
    key: pastePluginKey,
    props: {
      transformPastedHTML: (html: string) => {
        // strips spans that contain a single non-breaking space (chrome/webkit seem to
        // do this for spaces surrounding marked html)
        // eslint-disable-next-line no-irregular-whitespace
        return html.replace(/<span> <\/span>/g, ' ');
      },
    },
  });
}

const highlightPluginKey = new PluginKey('nbsp-highlight');

function nonBreakingSpaceHighlightPlugin() {
  return new Plugin<DecorationSet>({
    key: highlightPluginKey,
    state: {
      init(_config: EditorStateConfig, instance: EditorState) {
        return DecorationSet.create(instance.doc, highlightNode(instance.doc));
      },
      apply(tr: Transaction, set: DecorationSet, oldState: EditorState, newState: EditorState) {
        // map
        set = set.map(tr.mapping, tr.doc);

        // find new
        if (tr.docChanged) {
          const decorations: Decoration[] = [];
          forChangedNodes(
            oldState,
            newState,
            node => node.isTextblock && node.textContent.includes(kNbsp),
            (node, pos) => {
              decorations.push(...highlightNode(node, pos + 1));
            },
          );
          set = set.add(tr.doc, decorations);
        }

        // return the set
        return set;
      },
    },
    props: {
      decorations(state: EditorState) {
        return highlightPluginKey.getState(state);
      },
    },
  });
}

function highlightNode(node: ProsemirrorNode, nodePos = 0) {
  const decorations: Decoration[] = [];
  const textNodes = mergedTextNodes(node);
  textNodes.forEach(textNode => {
    const text = textNode.text;
    let m;
    kNbspRegEx.lastIndex = 0;
    // tslint:disable-next-line no-conditional-assignment
    while ((m = kNbspRegEx.exec(text))) {
      if (m[0] === '') {
        break;
      }
      const from = nodePos + textNode.pos + m.index;
      const to = nodePos + textNode.pos + m.index + m[0].length;
      const classes = ['pm-nbsp', 'pm-invisible-text-color'];
      decorations.push(Decoration.inline(from, to, { class: classes.join(' ') }));
    }
    kNbspRegEx.lastIndex = 0;
  });
  return decorations;
}

export default extension;
