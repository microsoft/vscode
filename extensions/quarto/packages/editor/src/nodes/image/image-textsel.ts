/*
 * image-textsel.ts
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

import { EditorState, Transaction, NodeSelection, Plugin, PluginKey } from 'prosemirror-state';
import { DecorationSet, Decoration } from 'prosemirror-view';
import { nodeDecoration } from '../../api/decoration';

const pluginKey = new PluginKey('image-text-selection');

export function imageTextSelectionPlugin() {
  return new Plugin<DecorationSet>({
    key: pluginKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr: Transaction, _value: DecorationSet, _oldState: EditorState, newState: EditorState) {
        // no decorations for empty or node selection
        if (tr.selection.empty || tr.selection instanceof NodeSelection) {
          return DecorationSet.empty;
        }

        const schema = newState.schema;
        const decorations: Decoration[] = [];
        tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
          if ([schema.nodes.image, schema.nodes.figure].includes(node.type)) {
            decorations.push(nodeDecoration({ node, pos }, { class: 'pm-image-text-selection' }));
          }
        });

        return DecorationSet.create(tr.doc, decorations);
      },
    },
    props: {
      decorations(state: EditorState) {
        return pluginKey.getState(state);
      },
    },
  });
}
