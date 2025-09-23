/*
 * footnote.ts
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

import { Node as ProsemirrorNode, Schema, Fragment, NodeType, DOMOutputSpec } from 'prosemirror-model';
import { Plugin, PluginKey, EditorState, Transaction, TextSelection, Selection } from 'prosemirror-state';
import {
  findChildrenByType,
  findParentNodeOfType,
  NodeWithPos,
  findChildren,
} from 'prosemirror-utils';

import { ExtensionContext } from '../../api/extension';
import { uuidv4 } from '../../api/util';
import { PandocOutput, PandocTokenType, ProsemirrorWriter, PandocToken } from '../../api/pandoc';
import { ProsemirrorCommand, EditorCommandId } from '../../api/command';
import { canInsertNode, findSelectedNodeOfType } from '../../api/node';
import { EditorUI } from '../../api/ui-types';
import { OmniInsertGroup } from '../../api/omni_insert';

import {
  footnoteEditorKeyDownHandler,
  footnoteEditorActivationPlugin,
  footnoteEditorNodeViews,
} from './footnote-editor';
import {
  footnoteAppendTransaction,
  footnoteFilterTransaction,
  footnoteSelectNoteAppendTransaction,
} from './footnote-transaction';

import './footnote-styles.css';

const plugin = new PluginKey('footnote');

const extension = (context: ExtensionContext) => {
  const { pandocExtensions, ui } = context;

  if (!pandocExtensions.footnotes) {
    return null;
  }

  return {
    nodes: [
      {
        name: 'footnote',
        spec: {
          inline: true,
          attrs: {
            number: { default: 1 },
            ref: {},
            content: { default: '' },
          },
          group: 'inline',
          // atom: true,
          parseDOM: [
            {
              tag: "span[class*='footnote']",
              getAttrs(dom: Node | string) {
                const el = dom as Element;
                return {
                  ref: el.getAttribute('data-ref'),
                  content: el.getAttribute('data-content'),
                };
              },
            },
          ],
          toDOM(node: ProsemirrorNode): DOMOutputSpec {
            return [
              'span',
              { class: 'footnote pm-footnote', 'data-ref': node.attrs.ref, 'data-content': node.attrs.content },
              node.attrs.number.toString(),
            ];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.Note,
              handler: writePandocNote,
            },
          ],
          writer: (output: PandocOutput, node: ProsemirrorNode) => {
            output.writeNote(node);
          },
        },
      },
    ],

    appendTransaction: () => {
      return [footnoteAppendTransaction()];
    },

    plugins: () => {
      return [
        footnoteEditorActivationPlugin(),

        new Plugin({
          key: plugin,

          // footnote editor
          props: {
            handleKeyDown: footnoteEditorKeyDownHandler(),
            nodeViews: footnoteEditorNodeViews(),
          },

          // footnote transactions (fixups, etc.)
          filterTransaction: footnoteFilterTransaction(),
          appendTransaction: footnoteSelectNoteAppendTransaction(),
        }),
      ];
    },

    commands: () => {
      return [
        new ProsemirrorCommand(EditorCommandId.Footnote, ['Shift-Mod-F7'], footnoteCommandFn(), footnoteOmniInsert(ui)),
      ];
    },
  };
};

function writePandocNote(schema: Schema) {
  return (writer: ProsemirrorWriter, tok: PandocToken) => {
    // generate unique id
    const ref = uuidv4();

    // add note to notes collection (will be handled specially by closeNode b/c it
    // has schema.nodes.node type)
    writer.openNoteNode(ref);
    writer.writeTokens(tok.c);
    const noteNode = writer.closeNode();

    // store json version of node in an attribute of the footnote (we can copy/paste)
    // between different documents
    const content = JSON.stringify(noteNode.content.toJSON());

    // add inline node to the body
    writer.addNode(schema.nodes.footnote, { ref, number: noteNode.attrs.number, content }, []);
  };
}

function footnoteCommandFn() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    if (!canInsertFootnote(state)) {
      return false;
    }
    if (dispatch) {
      const tr = state.tr;
      insertFootnote(tr);
      dispatch(tr);
    }
    return true;
  };
}

function footnoteOmniInsert(ui: EditorUI) {
  return {
    name: ui.context.translateText('Footnote'),
    description: ui.context.translateText('Note placed at the bottom of the page'),
    group: OmniInsertGroup.References,
    priority: 2,
    image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.footnote_dark : ui.images.omni_insert.footnote),
  };
}

function canInsertFootnote(state: EditorState) {
  return (
    canInsertNode(state, state.schema.nodes.footnote) && !findParentNodeOfType(state.schema.nodes.note)(state.selection)
  );
}

function insertFootnote(
  tr: Transaction,
  edit = true,
  content?: Fragment | ProsemirrorNode | ProsemirrorNode[] | undefined,
): string {
  // resolve content
  const schema = tr.doc.type.schema;
  if (!content) {
    content = schema.nodes.paragraph.create();
  }

  // generate note id
  const ref = uuidv4();

  // insert empty note
  const notes = findChildrenByType(tr.doc, schema.nodes.notes, true)[0];
  const note = schema.nodes.note.createAndFill({ ref }, content);
  tr.insert(notes.pos + 1, note as ProsemirrorNode);

  // insert footnote linked to note
  const footnote = schema.nodes.footnote.create({ ref });
  tr.replaceSelectionWith(footnote, false);

  // open note editor
  if (edit) {
    const noteNode = findNoteNode(tr.doc, ref);
    if (noteNode) {
      tr.setSelection(TextSelection.create(tr.doc, noteNode.pos + 1));
    }
  }

  // return ref
  return ref;
}



export function selectedFootnote(selection: Selection): NodeWithPos | undefined {
  const schema = selection.$head.node().type.schema;
  return findSelectedNodeOfType(schema.nodes.footnote, selection);
}

export function selectedNote(selection: Selection): NodeWithPos | undefined {
  const schema = selection.$head.node().type.schema;
  return findParentNodeOfType(schema.nodes.note)(selection);
}

export function findNoteNode(doc: ProsemirrorNode, ref: string): NodeWithPos | undefined {
  return findNodeOfTypeWithRef(doc, doc.type.schema.nodes.note, ref);
}

export function findFootnoteNode(doc: ProsemirrorNode, ref: string): NodeWithPos | undefined {
  return findNodeOfTypeWithRef(doc, doc.type.schema.nodes.footnote, ref);
}

function findNodeOfTypeWithRef(doc: ProsemirrorNode, type: NodeType, ref: string): NodeWithPos | undefined {
  const foundNode = findChildren(doc, node => node.type === type && node.attrs.ref === ref, true);
  if (foundNode.length) {
    return foundNode[0];
  } else {
    return undefined;
  }
}

export default extension;
