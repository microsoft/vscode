/*
* shortcodes.ts
*
* Copyright (C) 2020-2023 Posit Software, PBC
*
*/
import type MarkdownIt from "markdown-it/lib"
import Token from "markdown-it/lib/token"

import StateInline from "markdown-it/lib/rules_inline/state_inline";
import { escapeHtml } from "markdown-it/lib/common/utils";

export const kShortcode = "shortcode";

export const shortcodePlugin = (md: MarkdownIt) => {
  const shortcode = (state: StateInline, silent: boolean): boolean => {
    // {{< shortcode >}}
    if (state.src.slice(state.pos, state.pos + 3) !== "{{<") {
      return false;
    }
    const shortcodeEndRegex = />}}/g;

    // ignore if shortcode doesn't end
    const end = state.src.slice(state.pos).search(shortcodeEndRegex);
    if (end === -1) {
      return false;
    }

    const shortcodeContent = state.src.slice(state.pos + 3, state.pos + end);
    if (!silent) {
      const token = state.push("shortcode", "shortcode", 0);
      token.markup = "";
      token.content = shortcodeContent;
    }
    state.pos += end + 3;
    return true;
  }
  md.inline.ruler.after("escape", kShortcode, shortcode);

  const renderShortcode = (tokens: Token[], idx: number): string => {
    const token = tokens[idx];
    const content = token.content;
    // insert shortcode braces and escape content's html entities
    return `<span class="shortcode">${escapeHtml(`{{<${content}>}}`)}</span>`;
  }

  md.renderer.rules[kShortcode] = renderShortcode;
}