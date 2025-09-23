/*
 * attr_edit.ts
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
import { findChildren } from 'prosemirror-utils';
import { Plugin, PluginKey, Transaction, EditorState, Selection, EditorStateConfig } from 'prosemirror-state';
import { DecorationSet, Decoration } from 'prosemirror-view';

import { EditorUI } from '../../api/ui-types';
import { pandocAttrEnabled, pandocAttrAvailable } from '../../api/pandoc_attr';
import { kSetMarkdownTransaction, transactionsAreTypingChange, forChangedNodes, kThemeChangedTransaction } from '../../api/transaction';

import { PandocExtensions } from '../../api/pandoc';
import { Extension } from '../../api/extension';
import { hasFencedCodeBlocks } from '../../api/pandoc_format';
import { selectionIsWithinRange } from '../../api/selection';

import { AttrEditOptions } from '../../api/attr_edit';
import { attrEditDecorationWidget } from '../../api/attr_edit/attr_edit-decoration';

import { AttrEditCommand, attrEditNodeCommandFn } from './attr_edit-command';
import { EditorFormat } from '../../api/format';

export function attrEditExtension(
  pandocExtensions: PandocExtensions,
  ui: EditorUI,
  format: EditorFormat,
  editors: AttrEditOptions[],
): Extension {
  const hasAttr = pandocAttrEnabled(pandocExtensions) || hasFencedCodeBlocks(pandocExtensions);

  return {
    commands: () => {
      if (hasAttr) {
        return [new AttrEditCommand(ui, format, pandocExtensions, editors)];
      } else {
        return [];
      }
    },

    plugins: () => {
      if (hasAttr) {
        return [new AttrEditDecorationPlugin(ui, pandocExtensions, editors)];
      } else {
        return [];
      }
    },
  };
}

const key = new PluginKey<DecorationSet>('attr_edit_decoration');

class AttrEditDecorationPlugin extends Plugin<DecorationSet> {
  constructor(ui: EditorUI, pandocExtensions: PandocExtensions, editors: AttrEditOptions[]) {

    const decoratorForNode = (editor: AttrEditOptions, 
                              selection: Selection, 
                              node: ProsemirrorNode, 
                              pos: number) => {

      // if we prefer hidden and have no attributes then bail
      const range = { from: pos, to: pos + node.nodeSize };
      if (editor.preferHidden && 
          !pandocAttrAvailable(node.attrs, !editor.noKeyvalueTags) && 
          !selectionIsWithinRange(selection, range)) {
        return undefined;
      }

      // provide some editor defaults
      editor.tags = editor.tags ||
        (editorNode => {
          const attrTags = [];
          if (editorNode.attrs.id) {
            attrTags.push(`#${editorNode.attrs.id}`);
          }
          if (editorNode.attrs.classes && editorNode.attrs.classes.length) {
            attrTags.push(`${editorNode.attrs.classes.map((clz: string) => '.' + clz).join(' ')}`);
          }
          if (!editor.noKeyvalueTags && editorNode.attrs.keyvalue && editorNode.attrs.keyvalue.length) {
            attrTags.push(`${editorNode.attrs.keyvalue.map(
              (kv: [string,string]) => kv[0] + '="' + (kv[1] || '1') + '"').join(' ')}
            `);
          }
          return attrTags;
        });
      editor.offset = editor.offset || { top: 0, right: 0 };

      // get editFn
      const editFn = attrEditNodeCommandFn(
        { node, pos }, 
        ui, 
        pandocExtensions, 
        editors
      );

      // attr_edit controls
      return attrEditDecorationWidget({
        pos,
        tags: editor.tags(node),
        editFn,
        ui,
        offset: editor.offset,
        preferHidden: editor.preferHidden
      });
     
    };

    function decoratorsForDoc(state: EditorState)  {
      const decorations: Decoration[] = [];
      const nodeTypes = editors.map(ed => ed.type(state.schema));
      findChildren(state.doc, node => nodeTypes.includes(node.type), true).forEach(attrNode => {
        const editor = editors.find(ed => ed.type(state.schema) === attrNode.node.type)!;
        if (!editor.noDecorator) {
          const decorator = decoratorForNode(editor, state.selection, attrNode.node, attrNode.pos);
          if (decorator) {
            decorations.push(decorator);
          }
       
        }
      });
      return DecorationSet.create(state.doc, decorations);
    }
    
    super({
      key,
      state: {
        init: (_config: EditorStateConfig, state: EditorState) => {
          return decoratorsForDoc(state);
        },
        apply: (tr: Transaction, set: DecorationSet, oldState: EditorState, newState: EditorState) => {

          // replacing the entire editor triggers decorations
          if (tr.getMeta(kSetMarkdownTransaction) || tr.getMeta(kThemeChangedTransaction)) {
            return decoratorsForDoc(newState);
          }

          // get schema and nodetypes
          const schema = newState.schema;
          const nodeTypes = editors.map(ed => ed.type(schema));

          // map 
          set = set.map(tr.mapping, tr.doc);

          // typing change, return existing decorations
          if (transactionsAreTypingChange([tr])) {
            return set;
          }

          // selection change, might need to toggle some decorations on/off
          if (tr.selectionSet) {
            
            // look through each decorator, if it has preferHidden, it's node has no attributes,
            // and it's no longer in the selection then remove it
            const preferHiddenDecorators = set.find(undefined, undefined, spec => !!spec.preferHidden);
            for (const dec of preferHiddenDecorators) {
              const node = newState.doc.nodeAt(dec.from);
              if (node && !pandocAttrAvailable(node.attrs)) {
                if (!selectionIsWithinRange(tr.selection, 
                  { from: dec.from, to: dec.from + node.nodeSize })) {
                    set = set.remove([dec]);
                }
              }
            }
         
            // now look for nodes above us with preferHidden and add decorators for them
            const $head = tr.selection.$head;
            for (let i=1; i<=$head.depth; i++) {
              const parentWithAttrs = { node: $head.node(i), pos: $head.before(i) };
              if (!nodeTypes.includes(parentWithAttrs.node.type)) {
                continue;
              }
              const { pos, node } = parentWithAttrs;
              const editor = editors.find(ed => ed.type(schema) === parentWithAttrs.node.type)!;
              if (editor?.preferHidden && set.find(pos, pos).length === 0) {
                const decorator = decoratorForNode(editor, tr.selection, node, pos);
                if (decorator) {
                  set = set.add(tr.doc, [decorator]);
                }
              }
            }
          }

          // doc didn't change, return existing decorations
          if (!tr.docChanged && !tr.storedMarksSet) {
            return set;
          }
        
          // scan for added/modified nodes that have attr_edit decorations
          forChangedNodes(
            oldState,
            newState,
            node => nodeTypes.includes(node.type),
            (node, pos) => {
              // remove existing decorations for changed nodes
              const removeDecorations = set.find(pos, pos);
              if (removeDecorations.length > 0) {
                set = set.remove(removeDecorations);
              }

              // get editor and screen on noDecorator
              const editor = editors.find(ed => ed.type(schema) === node.type)!;
              if (!editor.noDecorator) {
                const decorator = decoratorForNode(editor, newState.selection, node, pos);
                if (decorator) {
                  set = set.add(tr.doc, [decorator]);
                }
              }
            },
          );
          
          // return the updated set
          return set;
        }
      },
      props: {
        decorations: (state: EditorState) => {
          return key.getState(state);
        },
      },
    });
  }
}


