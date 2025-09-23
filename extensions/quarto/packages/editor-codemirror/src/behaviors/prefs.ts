/*
 * prefs.ts
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

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { indentUnit } from "@codemirror/language";
import { highlightSelectionMatches } from "@codemirror/search";
import { Compartment, Extension } from "@codemirror/state";
import { drawSelection, EditorView, highlightWhitespace, keymap, lineNumbers } from "@codemirror/view";
import { PrefsChangedEvent } from "editor";
import { Behavior, BehaviorContext } from ".";

export function prefsBehavior(context: BehaviorContext) : Behavior {

  const prefsCompartment = new Compartment();

  const configurePrefs = (cmView: EditorView) => {

    // alias prefs
    const prefs = context.pmContext.ui.prefs;

    // line wrapping
    const extensions: Extension[] = [EditorView.lineWrapping];

    // show line numbers
    const options = context.options ;
    const showLineNumbers = options.lineNumbers && prefs.lineNumbers();
    if (showLineNumbers) {
      extensions.push(lineNumbers({
        formatNumber: options.lineNumberFormatter 
          ? (lineNo: number) => options.lineNumberFormatter!(lineNo) 
          : undefined
      }));
    }

    // highlight selected word
    if (prefs.highlightSelectedWord()) {
      extensions.push(highlightSelectionMatches());
    }

    // show whitespace
    if (prefs.showWhitespace()) {
      extensions.push(highlightWhitespace());
    }

    // close brackets
    if (prefs.autoClosingBrackets()) {
      extensions.push(
        closeBrackets(),
        keymap.of(closeBracketsKeymap)
      );
    }

    // indentation
    const indent = prefs.spacesForTab() ? ' '.repeat(prefs.tabWidth()) : '\t';
    extensions.push(indentUnit.of(indent));

    // blinking cursor
    const cursorBlinkRate = prefs.blinkingCursor() ? 1000 : 0;
    extensions.push(drawSelection({ cursorBlinkRate }));

    // reconfigure
    cmView.dispatch({
      effects: prefsCompartment.reconfigure(extensions)
    });
  }

  let unsubscribe: VoidFunction;

  return {

    init(_pmNode, cmView) {
      configurePrefs(cmView)
      unsubscribe = context.pmContext.events.subscribe(PrefsChangedEvent, () => {
        configurePrefs(cmView);
      });
    },

    extensions: [prefsCompartment.of([])],

    cleanup: () => {
      unsubscribe?.();
    }
  }
}
