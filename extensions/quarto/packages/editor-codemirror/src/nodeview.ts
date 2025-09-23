/*
 * node-view.ts
 *
 * Copyright (C) 2022 by Emergence Engineering (ISC License)
 * https://gitlab.com/emergence-engineering/prosemirror-codemirror-block
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


import { Node } from "prosemirror-model";
import { EditorView as PMEditorView, NodeView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";

import { EditorView } from "@codemirror/view";
import { EditorState, SelectionRange } from "@codemirror/state";

import { 
  CodeEditorNodeView, 
  CodeEditorNodeViews, 
  CodeViewOptions, 
  ExtensionContext 
} from "editor";

import { 
  createBehaviors,
  behaviorExtensions, 
  behaviorInit, 
  behaviorPmUpdate, 
  State,
  behaviorCleanup,
  behaviorCmUpdate, 
} from "./behaviors";

export const codeMirrorNodeView: (
  context: ExtensionContext,
  codeViewOptions: CodeViewOptions,
  nodeViews: CodeEditorNodeViews
) => (
  pmNode: Node,
  view: PMEditorView,
  getPos: (() => number) | boolean
) => NodeView = (context, codeViewOptions, nodeViews) => (pmNode, view, getPos) => {

  // track node
  let node = pmNode;

  // scoped state and function to allow behaviors to set it
  let updating = false;
  let escaping = false;
  const withState = (state: State, fn: () => void) => {
    const setState = (value: boolean) => {
      if (state === State.Updating) updating = value;
      if (state === State.Escaping) escaping = value;
    }
    setState(true);
    fn();
    setState(false);
  }

  // gap cursor pending state (set by the global nodeview click handler)
  let gapCursorPending = false;
  const setGapCursorPending = (pending: boolean) => {
    gapCursorPending = pending;
  }

  // track the last user selection in this code view so we can make it 
  // sticky for when prosemirror calls setSelection (e.g. on a refocus,
  // where by default it passes 0,0)
  let lastUserSelection: SelectionRange | undefined;

  // setup dom
  const dom = document.createElement("div");
  dom.classList.add('pm-code-editor');
  dom.classList.add('pm-codemirror-editor');
  dom.classList.add('pm-codemirror-editor-inactive');
  dom.classList.add(codeViewOptions.borderColorClass || 'pm-block-border-color');
  if (codeViewOptions.classes) {
    codeViewOptions.classes.forEach(className => dom.classList.add(className));
  }

  // create behaviors
  const behaviors = createBehaviors({
    dom,
    view,
    getPos,
    options: codeViewOptions,
    pmContext: context,
    withState
  })

  // editor state/extensions
  const state = EditorState.create({
    extensions: behaviorExtensions(behaviors),
    doc: node.textContent,
  });

  const codeMirrorView = new EditorView({
    state,
    dispatch: (tr) => {
      
      // apply the update to codemirror
      codeMirrorView.update([tr]);

      // if this is a user operation (i.e. not initiated by us) then
      // reflect the update back into prosemirror
      if (!updating) {

        // perform prosemirror update
        const textUpdate = tr.state.toJSON().doc;
        valueChanged(textUpdate, node, getPos, view);
        forwardSelection(codeMirrorView, view, getPos);

        // track last user selection that isn't at the origin
        if (codeMirrorView.state.selection.main.anchor !== 0) {
          lastUserSelection = codeMirrorView.state.selection.main;
        }

      }

      behaviorCmUpdate(behaviors, tr, codeMirrorView, node);
    },
  });
  dom.append(codeMirrorView.dom);

  // initialize behaviors
  behaviorInit(behaviors, node, codeMirrorView);

  // track node view (this is done both so the outer editor can direct
  // commands at the currently active nodeview, as well as for click
  // detection between views for gap cursor handling)
  const cmNodeView : CodeEditorNodeView = {
    isFocused: () => codeMirrorView.hasFocus,
    getPos: typeof(getPos) === "function" ? getPos : (() => 0),
    dom,
    setGapCursorPending
  }; 
  nodeViews.add(cmNodeView);

  // return prosemirror nodeview 
  return {

    dom,
    
    selectNode() {
      codeMirrorView.focus();
    },

    stopEvent: () => true,

    setSelection: (anchor, head) => {

      // if prosemirror attempts to set us to 0,0 (which it does on focus)
      // just restore our last user selection
      if (anchor === 0 && head === 0 && lastUserSelection) {
        anchor = lastUserSelection.anchor;
        head = lastUserSelection.head;
      }

      // set focus and forward selection unless our state precludes this 
      if (!escaping && !gapCursorPending) {
        codeMirrorView.focus();
        forwardSelection(codeMirrorView, view, getPos);
      }
     
      // reflect the prosemirror selection change into codemirror
      withState(State.Updating, () => {
        codeMirrorView.dispatch({
          selection: { anchor: anchor, head: head },
        });
      });
     
    },

    update: (updateNode) => {

      // if the node type changed, no update (standard prosemirror boilerplate)
      if (updateNode.type.name !== node.type.name) {
        return false;
      }
    
      // update node (track prevNode to pass to behaviors)
      const prevNode = node;
      node = updateNode;

      // apply change from update node
      const change = computeChange(codeMirrorView.state.doc.toString(), node.textContent);
      if (change) {
        withState(State.Updating, () => {
          codeMirrorView.dispatch({
            changes: {
              from: change.from,
              to: change.to,
              insert: change.text,
            },
            selection: { anchor: change.from + change.text.length },
          });
        });
      } 

      // trigger update for behaviors
      behaviorPmUpdate(behaviors, prevNode, updateNode, codeMirrorView);

      // success
      return true;
    },

    ignoreMutation: () => true,
    
    destroy: () => {
      behaviorCleanup(behaviors);
      nodeViews.remove(cmNodeView);
      codeMirrorView.destroy();
    },
  };
};


const computeChange = (oldVal: string, newVal: string) => {
  if (oldVal === newVal) return null;
  let start = 0;
  let oldEnd = oldVal.length;
  let newEnd = newVal.length;
  while (
    start < oldEnd &&
    oldVal.charCodeAt(start) === newVal.charCodeAt(start)
  )
    start += 1;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldVal.charCodeAt(oldEnd - 1) === newVal.charCodeAt(newEnd - 1)
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  return { from: start, to: oldEnd, text: newVal.slice(start, newEnd) };
}

const asProseMirrorSelection = (
  pmDoc: Node,
  cmView: EditorView,
  getPos: (() => number) | boolean
) => {
  const offset = (typeof getPos === "function" ? getPos() || 0 : 0) + 1;
  const anchor = cmView.state.selection.main.from + offset;
  const head = cmView.state.selection.main.to + offset;
  return TextSelection.create(pmDoc, anchor, head);
};


const forwardSelection = (
  cmView: EditorView,
  pmView: PMEditorView,
  getPos: (() => number) | boolean
) => {
  if (!cmView.hasFocus) return;
  const selection = asProseMirrorSelection(pmView.state.doc, cmView, getPos);
  if (!selection.eq(pmView.state.selection))
    pmView.dispatch(pmView.state.tr.setSelection(selection));
};

const valueChanged = (
  textUpdate: string,
  node: Node,
  getPos: (() => number) | boolean,
  view: PMEditorView
) => {
  const change = computeChange(node.textContent, textUpdate);
  if (change && typeof getPos === "function") {
    const start = getPos() + 1;

    const pmTr = view.state.tr;
    if (change.text) {
      pmTr.replaceWith(
        start + change.from,
        start + change.to,
        view.state.schema.text(change.text)
      );
    } else {
      pmTr.deleteRange(
        start + change.from,
        start + change.to
      )
    }
    view.dispatch(pmTr);
  }
};

