/*
 * mark-highlight.ts
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

import { PluginKey, Plugin, EditorState, Transaction, EditorStateConfig } from 'prosemirror-state';
import { DecorationSet, Decoration } from 'prosemirror-view';
import { Node as ProsemirrorNode, MarkType } from 'prosemirror-model';
import { findChildrenByMark } from 'prosemirror-utils';
import { AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';

import { getMarkRange, getMarkAttrs } from './mark';
import { forChangedNodes } from './transaction';

export type MarkHighligher = (
  text: string,
  attrs: { [key: string]: unknown },
  range: { from: number; to: number },
) => Decoration[];

export function markHighlightDecorations(
  markRange: { from: number; to: number },
  text: string,
  re: RegExp,
  className: string,
) {
  const decorations: Decoration[] = [];
  re.lastIndex = 0;
  let match = re.exec(text);
  while (match) {
    decorations.push(
      Decoration.inline(markRange.from + match.index, markRange.from + re.lastIndex, { class: className }),
    );
    match = re.exec(text);
  }
  re.lastIndex = 0;
  return decorations;
}

export function markHighlightPlugin(key: PluginKey<DecorationSet>, markType: MarkType, highlighter: MarkHighligher) {
  function decorationsForDoc(doc: ProsemirrorNode) {
    let decorations: Decoration[] = [];
    findChildrenByMark(doc, markType, true).forEach(markedNode => {
      decorations = decorations.concat(markDecorations(doc, markType, markedNode.pos, highlighter));
    });
    return DecorationSet.create(doc, decorations);
  }

  return new Plugin<DecorationSet>({
    key,
    state: {
      // initialize by highlighting the entire document
      init(_config: EditorStateConfig, instance: EditorState) {
        return decorationsForDoc(instance.doc);
      },

      // whenever an edit affecting this mark type occurs then update the decorations
      apply(tr: Transaction, set: DecorationSet, oldState: EditorState, newState: EditorState) {
        // ignore selection changes
        if (!tr.docChanged) {
          return set.map(tr.mapping, tr.doc);
        }

        // if one of the steps added or removed a mark of our type then rescan the doc.
        if (
          tr.steps.some(
            step =>
              (step instanceof AddMarkStep && step.mark.type === markType) ||
              (step instanceof RemoveMarkStep && step.mark.type === markType),
          )
        ) {
          // rehighlight entire doc
          return decorationsForDoc(newState.doc);

          // incremental rehighlighting based on presence of mark in changed regions
        } else {
          // adjust decoration positions to changes made by the transaction (decorations that apply
          // to removed chunks of content will be removed by this)
          set = set.map(tr.mapping, tr.doc);

          // function to rehighlight parent of specified pos
          const rehighlightParent = (pos: number) => {
            const resolvedPos = tr.doc.resolve(pos);
            const parent = resolvedPos.node();
            const from = resolvedPos.start();
            const marks = findChildrenByMark(parent, markType);
            marks.forEach(mark => {
              const markRange = getMarkRange(tr.doc.resolve(from + mark.pos), markType) as { from: number; to: number };
              const removeDecorations = set.find(markRange.from, markRange.to);
              set = set.remove(removeDecorations);
              const addDecorations = markDecorations(tr.doc, markType, markRange.from, highlighter);
              set = set.add(tr.doc, addDecorations);
            });
          };

          // rehighlight nodes that changed and have our mark type
          forChangedNodes(
            oldState,
            newState,
            node => node.type.allowsMarkType(markType),
            (node, pos) => {
              if (newState.doc.rangeHasMark(pos, pos + node.nodeSize, markType)) {
                rehighlightParent(pos);
              }
            },
          );

          return set;
        }
      },
    },
    props: {
      decorations(state: EditorState) {
        return key.getState(state);
      },
    },
  });
}

function markDecorations(doc: ProsemirrorNode, markType: MarkType, pos: number, highlighter: MarkHighligher) {
  const markRange = getMarkRange(doc.resolve(pos), markType);
  if (markRange) {
    const attrs = getMarkAttrs(doc, markRange, markType);
    const text = doc.textBetween(markRange.from, markRange.to);
    return highlighter(text, attrs, markRange);
  } else {
    return [];
  }
}
