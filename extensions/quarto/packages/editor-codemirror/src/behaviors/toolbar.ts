/*
 * toolbar.ts
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


import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { Transaction } from "prosemirror-state";

import { languageDiagramEngine } from "editor-core";

import { CodeViewActiveBlockContext, codeViewActiveBlockContext, CodeViewExecute, DispatchEvent } from "editor";
import { Behavior, BehaviorContext } from ".";
import { previewDiagram } from "./diagram";
import { asCodeMirrorSelection } from "./trackselection";

export function toolbarBehavior(context: BehaviorContext) : Behavior {
  
  let unsubscribe: VoidFunction;

  const toggleToolbar = StateEffect.define<boolean>();

  const toolbarDecoration = Decoration.widget({
    widget: {
      toDOM() {
        return createToolbarPanel();
      },
      eq: () => false,
      updateDOM: () => false,
      estimatedHeight: -1,
      ignoreEvent: () => true,
      destroy: () => { /* */ }
    },
    side: 0
  });
  
  const toolbarState = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      for (const e of tr.effects) if (e.is(toggleToolbar)) {
        if (e.value) {
          return Decoration.set([toolbarDecoration.range(0,0)]);
        } else {
          return Decoration.none;
        }
      }
      return value;
    },
    provide: f => EditorView.decorations.from(f)
  });

  function createToolbarPanel() {
      
    // get context
    const cvContext = codeViewActiveBlockContext(context.view.state)!;
        
    // create toolbar
    const toolbar = document.createElement("div");
    toolbar.classList.add("pm-codemirror-toolbar");

    // add an execute button
    const addButton = (title: string, onClick: VoidFunction, ...classes: string[]) => {
      const button = document.createElement("i");
      button.title = title;
      button.classList.add("codicon", ...classes);
      button.addEventListener('click', (ev) => {
        onClick();
        ev.preventDefault();
        ev.stopPropagation();
        return false;
      });
      toolbar.appendChild(button);
      return button;
    }

    const addExecuteButton = (execute: CodeViewExecute, title: string, ...classes: string[]) => {
      addButton(title, () => {
        context.pmContext.ui.codeview?.codeViewExecute(execute, cvContext);
      }, ...classes)
    };
    
    // buttons (conditional on context)
    const t = context.pmContext.ui.context.translateText;
    const diagramEngine = languageDiagramEngine(cvContext.activeLanguage);
    if (diagramEngine) {
      addButton(t("Preview Diagram"), () => {
        previewDiagram(context, true);
      }, "codicon-zoom-in", "pm-codeview-run-button");
    } else {
      if (runnableCellsAbove(cvContext)) {
        addExecuteButton("above", t("Run Cells Above"), "codicon-run-above", "pm-codeview-run-other-button");
      }
      if (runnableCellsBelow(cvContext)) {
        addExecuteButton("below", t("Run Cells Below"), "codicon-run-below", "pm-codeview-run-other-button");
      }
      addExecuteButton("cell", t("Run Cell"), "codicon-play", "pm-codeview-run-button");  
    }

   
    return toolbar;
  }
  
  return {
    extensions: [toolbarState],
    init(pmView, cmView) {

      unsubscribe = context.pmContext.events.subscribe(DispatchEvent, (tr: Transaction | undefined) => {
        // track selection-only changes
        if (tr && tr.selectionSet && !tr.docChanged) {
          const cmSelection = asCodeMirrorSelection(context.view, cmView, context.getPos);
          if (cmSelection) {
            const nodeLang = context.options.lang(pmView, pmView.textContent);
            const cvContext = codeViewActiveBlockContext(context.view.state);
            if (cvContext && nodeLang && 
                // is an executable language
                (context.pmContext.ui.context.executableLanguges?.().includes(nodeLang) ||
                // or is a diagram language
                languageDiagramEngine(nodeLang))) {
              cmView.dispatch({effects: toggleToolbar.of(true)});
            } else {
              cmView.dispatch({effects: toggleToolbar.of(false)});
            }
          } else {
            cmView.dispatch({effects: toggleToolbar.of(false)});
          }
        }
      });
    },
    cleanup: () => {
      unsubscribe?.();
    },
  }
}

function runnableCellsAbove(context: CodeViewActiveBlockContext) {
  const activeIndex = context.blocks.findIndex(block => block.active);
  if (activeIndex !== -1) {
    for (let i=0; i<activeIndex; i++) {
      if (context.blocks[i].language === context.activeLanguage) {
        return true;
      }
    }
  } 
  return false;
}

function runnableCellsBelow(context: CodeViewActiveBlockContext) {
  const activeIndex = context.blocks.findIndex(block => block.active);
  if (activeIndex !== -1) {
    for (let i=(activeIndex+1); i<context.blocks.length; i++) {
      if (context.blocks[i]?.language === context.activeLanguage) {
        return true;
      }
    }
  } 
  return false;
}
