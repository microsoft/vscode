
/*
 * diagnostics.ts
 *
 * Copyright (C) 2025 by Posit Software, PBC
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
import { EditorView } from "@codemirror/view";
import { Behavior, BehaviorContext } from ".";

import { Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";

import {
  CodeViewCellContext,
  codeViewCellContext,
  kEndColumn,
  kEndRow,
  kStartColumn,
  kStartRow,
  LintItem,
  stripYamlFrontmatterDelimiters
} from "editor";
import { lines } from "core";
import { Position } from "vscode-languageserver-types";

const EMPTY_CODEVIEW_SELECTION = { start: Position.create(0, 0), end: Position.create(0, 0) };

const ERROR_ICON_HTML_STR = `<span style="color: red; font-size: 24px; vertical-align: text-bottom; padding-right: 8px;">⚠︎</span>`;
const ERROR_TOOLTIP_DIV_STYLES = {
  "box-shadow": 'rgba(0, 0, 0, 0.16) 0px 0px 8px 2px',
  border: '1px solid lightgrey',
  padding: '4px 11px',
  "font-family": 'monospace'
};

export function diagnosticsBehavior(behaviorContext: BehaviorContext): Behavior {
  // don't provide behavior if we don't have validation
  if (!behaviorContext.pmContext.ui.codeview) {
    return {};
  }

  return {
    extensions: [underlinedErrorHoverTooltip],

    async init(pmNode, cmView) {
      const language = behaviorContext.options.lang(pmNode, pmNode.textContent);
      if (language === null) return;
      if (language !== "yaml-frontmatter") return;

      const filepath = behaviorContext.pmContext.ui.context.getDocumentPath();
      if (filepath === null) return;

      const code = lines(pmNode.textContent);
      const strippedCodeLines = stripYamlFrontmatterDelimiters(code);

      // here we hand-craft an artisinal cellContext because `codeViewCellContext(..)`
      // seems to return undefined inside of init
      const cellContext = {
        filepath,
        language: 'yaml',
        code: strippedCodeLines,
        cellBegin: 0,
        cellEnd: code.length - 1,
        selection: EMPTY_CODEVIEW_SELECTION
      };

      const diagnostics = await getDiagnostics(cellContext, behaviorContext);
      if (!diagnostics) return;

      for (const error of diagnostics) {
        underline(cmView,
          rowColumnToIndex(code, [error[kStartColumn], error[kStartRow]]),
          rowColumnToIndex(code, [error[kEndColumn], error[kEndRow]]),
          error.text
        );
      }
    },
    async pmUpdate(_, updatePmNode, cmView) {
      clearUnderlines(cmView);
      const filepath = behaviorContext.pmContext.ui.context.getDocumentPath();
      if (filepath === null) return;

      const cellContext = codeViewCellContext(filepath, behaviorContext.view.state);
      if (cellContext === undefined) return;

      const diagnostics = await getDiagnostics(cellContext, behaviorContext);
      if (!diagnostics) return;

      const codeLines = lines(updatePmNode.textContent);
      for (const error of diagnostics) {
        underline(cmView,
          rowColumnToIndex(codeLines, [error[kStartColumn], error[kStartRow]]),
          rowColumnToIndex(codeLines, [error[kEndColumn], error[kEndRow]]),
          error.text
        );
      }
    }
  };
}

async function getDiagnostics(
  cellContext: CodeViewCellContext,
  behaviorContext: BehaviorContext
): Promise<LintItem[] | undefined> {
  return await behaviorContext.pmContext.ui.codeview?.codeViewDiagnostics(cellContext);
}

//Check if there is an underline at position and display a tooltip there
//We want to show the error message as well
const underlinedErrorHoverTooltip = hoverTooltip((view, pos) => {
  const f = view.state.field(underlineField, false);
  if (!f) return null;

  const rangeAndSpec = rangeAndSpecOfDecorationAtPos(pos, f);
  if (!rangeAndSpec) return null;
  const { range: { from, to }, spec } = rangeAndSpec;

  return {
    pos: from,
    end: to,
    above: true,
    create() {
      const dom = document.createElement("div");
      Object.assign(dom.style, ERROR_TOOLTIP_DIV_STYLES);
      dom.innerHTML = ERROR_ICON_HTML_STR;

      const messageSpanEl = document.createElement("span");
      messageSpanEl.innerText = spec.message;
      dom.append(messageSpanEl);

      return { dom };
    }
  };
});

const addUnderline = StateEffect.define<{ from: number, to: number, message: string; }>({
  map: ({ from, to, message }, change) => ({ from: change.mapPos(from), to: change.mapPos(to), message })
});
const removeUnderlines = StateEffect.define({
  map: () => { }
});
const underlineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(underlines, tr) {
    underlines = underlines.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(addUnderline)) {
        underlines = underlines.update({
          add: [Decoration.mark({ class: "cm-underline", message: e.value.message }).range(e.value.from, e.value.to)]
        });
      }
      if (e.is(removeUnderlines)) {
        underlines = underlines.update({ filter: () => false });
      };
    }
    return underlines;
  },
  provide: f => EditorView.decorations.from(f)
});

const underlineTheme = EditorView.baseTheme({
  ".cm-underline": {
    textDecoration: "underline dotted 2px red",
  }
});

const underline = (cmView: EditorView, from: number, to: number, message: string) => {
  const effects: StateEffect<unknown>[] = [addUnderline.of({ from, to, message })];
  if (!cmView.state.field(underlineField, false)) {
    effects.push(StateEffect.appendConfig.of([underlineField, underlineTheme]));
  }
  cmView.dispatch({ effects });
};

const clearUnderlines = (cmView: EditorView) => {
  if (!!cmView.state.field(underlineField, false)) {
    cmView.dispatch({ effects: [removeUnderlines.of()] });
  }
};

//----------------
// HELPERS
//----------------

// helper function for positionally picking data from a DecorationSet
const rangeAndSpecOfDecorationAtPos = (pos: number, d: DecorationSet) => {
  let spec: any | undefined;
  let from: number | undefined;
  let to: number | undefined;
  d.between(pos, pos, (decoFrom, decoTo, deco) => {
    if (decoFrom <= pos && pos < decoTo) {
      spec = deco.spec;
      from = decoFrom;
      to = decoTo;
      return false;
    }
    return undefined;
  });
  return spec !== undefined ? { range: { from: from!, to: to! }, spec } : undefined;
};

/**
 * @param lines A representation of a string, split by newlines.
 * @param [row, col] row and column into the string, row being the same as line number
 * @returns An index into the string i.e. An index into `lines.join('\n')`
 */
function rowColumnToIndex(lines: string[], [col, row]: [number, number]): number {
  let index = 0;
  for (let i = 0; i < row; i++) {
    // + 1 to account for the newline character
    index += lines[i].length + 1;
  }
  return index + col;
}
