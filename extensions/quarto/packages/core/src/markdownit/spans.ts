/*
 * span.ts
 *
 * Copyright (C) 2020-2023 Posit Software, PBC
 *
 */

import MarkdownIt from "markdown-it";
import StateInline from "markdown-it/lib/rules_inline/state_inline";


export function spansPlugin(md: MarkdownIt) {
  function span(state: StateInline) {
    const max = state.posMax

    if (state.src.charCodeAt(state.pos) !== 0x5B) {
      // opening [
      return false;
    }

    const labelStart = state.pos + 1;
    const labelEnd   = state.md.helpers.parseLinkLabel(state, state.pos, true);

    if (labelEnd < 0) {
      // parser failed to find closing ]
      return false;
    }

    const pos = labelEnd + 1;
    if (pos < max && state.src.charCodeAt(pos) === 0x7B /* { */) {
      // probably found span

      state.pos = labelStart;
      state.posMax = labelEnd;

      state.push('span_open', 'span', 1);
      state.md.inline.tokenize(state);
      state.push('span_close', 'span', -1);

      state.pos = pos;
      state.posMax = max;
      return true;
    } else {
      return false;
    }
  };
  md.inline.ruler.push('quarto-spans', span);
}
