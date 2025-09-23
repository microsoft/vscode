/*
 * footnote-editor.ts
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
import { EditorView, DecorationSet, NodeView } from 'prosemirror-view';
import { findParentNodeOfType, NodeWithPos, findChildrenByType, findChildren } from 'prosemirror-utils';
import { EditorState, TextSelection, Plugin, PluginKey, Transaction } from 'prosemirror-state';

import { nodeDecoration } from '../../api/decoration';
import { firstNode, lastNode } from '../../api/node';
import { selectionIsWithin } from '../../api/selection';
import { scrollIntoView } from '../../api/scroll';

import { findFootnoteNode, selectedFootnote, selectedNote } from './footnote';

const key = new PluginKey<DecorationSet>('footnote-editor-activate');

export function footnoteEditorActivationPlugin() {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init() {
        return DecorationSet.empty;
      },

      // whenever an edit affecting this mark type occurs then update the decorations
      apply(tr: Transaction, set: DecorationSet, oldState: EditorState, newState: EditorState) {
        if (selectedFootnote(newState.selection) || selectedNote(newState.selection)) {
          // if we are in the same note selection as before just return the set
          if (oldState.selection.$head.node() === newState.selection.$head.node()) {
            return set.map(tr.mapping, tr.doc);
          } else {
            return footnoteEditorDecorations(newState);
          }
        } else {
          return DecorationSet.empty;
        }
      },
    },
    props: {
      decorations(state: EditorState) {
        return key.getState(state);
      },
    },

    view: () => ({
      // scroll footnote into view (if necessary) when note editor is active
      update: (view: EditorView) => {
        const note = selectedNote(view.state.selection);
        if (note) {
          const footnote = findFootnoteNode(view.state.doc, note.node.attrs.ref);
          if (footnote) {
            scrollIntoView(view, footnote.pos, false, 0, 30);
          }
        }
      },
    }),
  });
}

// selection-driven decorations (mostly css classes) required to activate the footnote editor
function footnoteEditorDecorations(state: EditorState) {
  const schema = state.schema;

  // see if either a footnote node or note (footnote editor) node has the selection
  let footnoteNode = selectedFootnote(state.selection);
  let noteNode = selectedNote(state.selection);

  // if they do then we need to enable footnote editing/behavior by
  // using decorators to inject appropriate css classes
  if (footnoteNode || noteNode) {
    // get body and notes nodes
    const bodyNode = findChildrenByType(state.doc, schema.nodes.body)[0];
    const notesNode = findChildrenByType(state.doc, schema.nodes.notes)[0];

    // resolve the specific footnote node or specific note node
    if (footnoteNode) {
      const ref = footnoteNode.node.attrs.ref;
      const matching = findChildren(notesNode.node, node => node.attrs.ref === ref);
      if (matching.length) {
        noteNode = matching[0];
        noteNode.pos = notesNode.pos + 1 + noteNode.pos;
      }
    } else if (noteNode) {
      const ref = noteNode.node.attrs.ref;
      const matching = findChildren(
        state.doc,
        node => node.type === schema.nodes.footnote && node.attrs.ref === ref,
        true,
      );
      if (matching.length) {
        footnoteNode = matching[0];
      }
    }

    if (footnoteNode && noteNode) {
      return DecorationSet.create(state.doc, [
        // make notes node visible
        nodeDecoration(noteNode, { class: 'active' }),

        // paint outline over footnote
        nodeDecoration(footnoteNode, { class: 'active pm-selected-node-outline-color' }),

        // position body and notes nodes for footnote editing
        nodeDecoration(bodyNode, { class: 'editing-footnote pm-pane-border-color' }),
        nodeDecoration(notesNode, { class: 'editing-footnote pm-pane-border-color' }),
      ]);
    } else {
      return DecorationSet.empty;
    }
  } else {
    return DecorationSet.empty;
  }
}

// node view that display the note number alongside the note content
export function footnoteEditorNodeViews() {
  return {
    note(node: ProsemirrorNode) {
      return new NoteEditorView(node);
    },
  };
}

class NoteEditorView implements NodeView {
  public readonly dom: HTMLElement;
  public readonly contentDOM: HTMLElement;

  private readonly node: ProsemirrorNode;


  constructor(node: ProsemirrorNode) {
    this.node = node;
  
    this.dom = window.document.createElement('div');
    this.dom.setAttribute('data-ref', this.node.attrs.ref);
    this.dom.classList.add('note');

    const label = window.document.createElement('div');
    label.classList.add('note-label');
    label.contentEditable = 'false';
    label.innerHTML = `<p>${this.node.attrs.number}:</p>`;
    this.dom.appendChild(label);

    const content = window.document.createElement('div');
    content.classList.add('note-content');
    this.contentDOM = content;
    this.dom.appendChild(content);
  }
}

// custom handling for arrow keys that cause selection to escape the editor
export function footnoteEditorKeyDownHandler() {
  return (view: EditorView, event: KeyboardEvent) => {
    // alias schema & selection
    const schema = view.state.schema;
    const selection = view.state.selection;

    // pass if the selection isn't in a note
    const noteNode: NodeWithPos | undefined = findParentNodeOfType(schema.nodes.note)(selection);
    if (!noteNode) {
      return false;
    }

    // function to find and move selection to associated footnote
    // will call this from Escape, ArrowLeft, and ArrowUp handlers below
    const selectFootnote = (before = true) => {
      const footnoteNode = findFootnoteNode(view.state.doc, noteNode.node.attrs.ref);
      if (footnoteNode) {
        const tr = view.state.tr;
        tr.setSelection(TextSelection.near(tr.doc.resolve(footnoteNode.pos + (before ? 0 : 1))));
        view.dispatch(tr);
      }
    };

    // if this is the Escape key then close the editor
    if (event.key === 'Escape') {
      selectFootnote();
      return true;
    }

    // ...otherwise check to see if the user is attempting to arrow out of the footnote

    // get first and last text block nodes (bail if we aren't in either)
    const firstTextBlock = firstNode(noteNode, node => node.isTextblock);
    const lastTextBlock = lastNode(noteNode, node => node.isTextblock);
    if (!firstTextBlock && !lastTextBlock) {
      return false;
    }

    // exiting from first text block w/ left or up arrow?
    if (firstTextBlock) {
      if (selectionIsWithin(selection, firstTextBlock)) {
        switch (event.key) {
          case 'ArrowLeft':
            if (selection.anchor === firstTextBlock.pos + 1) {
              selectFootnote(true);
              return true;
            }
            break;
          case 'ArrowUp': {
            if (view.endOfTextblock('up')) {
              selectFootnote(true);
              return true;
            }
            break;
          }
        }
      }
    }

    // exiting from last text block with right or down arrow?
    if (lastTextBlock) {
      if (selectionIsWithin(selection, lastTextBlock)) {
        switch (event.key) {
          case 'ArrowRight':
            if (selection.anchor === lastTextBlock.pos + lastTextBlock.node.nodeSize - 1) {
              selectFootnote(false);
              return true;
            }
            break;
          case 'ArrowDown': {
            if (view.endOfTextblock('down')) {
              selectFootnote(false);
              return true;
            }
            break;
          }
        }
      }
    }

    return false;
  };
}
