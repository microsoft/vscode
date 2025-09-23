/*
* divs.ts
*
* Copyright (C) 2020-2023 Posit Software, PBC
*
*/
import type MarkdownIt from "markdown-it/lib"
import Token from "markdown-it/lib/token"
import Renderer from "markdown-it/lib/renderer";
import { addClass } from "./utils/markdownit";

export const kDivRuleName = "pandocDiv";

export const kTokDivOpen = 'pandoc_div_open';
export const kTokDivClose = 'pandoc_div_close';

export const divPlugin = (md: MarkdownIt) => {
  
  // Render pandoc-style divs
  function renderStartDiv(tokens: Token[], idx: number, _options: MarkdownIt.Options, _env: unknown, self: Renderer): string {

    // Add a class to designate that this is a quarto dev
    const token = tokens[idx];
    token.attrs = addClass("quarto-div", token.attrs)

    return `<div ${self.renderAttrs(token)}>`;
  }

  // Render pandoc-style divs
  function renderEndDiv(): string {
    return `</div>`;
  }

  // TODO Implement a better test during validation run
  // Handle pandoc-style divs
  md.block.ruler.before(
    "fence",
    kDivRuleName,
    (state, start, _end, silent) => {

      // This is a validation run, can ignore
      if (silent) {
        return true;
      }
      
      // Get the line for parsing
      const lineStart = state.bMarks[start] + state.tShift[start];
      const lineEnd = state.eMarks[start];
      const line = state.src.slice(lineStart, lineEnd)
      
      // The current state of the divs (e.g. is there an open)
      // div. Data structure holds key that is the number of colons
      const divState = state.env.quartoOpenDivs || {};



      const incrementDivCount = (fence: string) => {
        state.env.quartoDivLevel = (state.env.quartoDivLevel ?? 0) + 1;
        state.env.quartoOpenDivs = state.env.quartoOpenDivs || {};
        const current = state.env.quartoOpenDivs[fence] || 0;
        state.env.quartoOpenDivs[fence] = Math.max(0, current + 1);
      }

      const decrementDivCount = (fence: string) => {
        state.env.quartoDivLevel--;
        state.env.quartoOpenDivs = state.env.quartoOpenDivs || {};
        const current = state.env.quartoOpenDivs[fence] || 0;
        state.env.quartoOpenDivs[fence] = Math.max(0, current - 1);
      }

      // Three or more colons followed by a an optional brace with attributes
      const divBraceRegex = /^(:::+)\s*(?:(\{[\s\S]+?\}))?$/;

      // Three or more colons followed by a string with no braces
      const divNoBraceRegex = /^(:::+)\s*(?:([^{}\s]+?))?$/;

      const matchers = [divBraceRegex, divNoBraceRegex];

      let match;
      for (const matcher of matchers) {
        match = matcher.exec(line);
        if (match) {
          break;
        }
      }

      if (match) {
        // There is a div here, is one already open?
        const divFence = match[1];
        const attr = match[2];

        // Is this open?
        let isOpenDiv = false;
        const openCount = divState[divFence];
        if (!openCount || openCount === 0) {
          // There isn't an existing open div at this level (number of colons)
          isOpenDiv = true;
        } else if (attr) {
          // If it has attributes it is always open
          isOpenDiv = true;
        }

        if (isOpenDiv) {
          
          // Add to the open count (or set it to 1)
          incrementDivCount(divFence);

          // Make an open token
          const token = state.push(kTokDivOpen, "div", 1)
          token.markup = line;
          // Allow this to be parsed for attributes by markdown-it-attr
          if (attr && attr.startsWith("{")) {
            token.info = attr;
          } else if (attr) {
            token.info = `{.${attr}}`;
          }
          token.block = true;
          token.meta = {
            line: state.line,
            level: state.env.quartoDivLevel 
          }
        } else {
          // Subtract from the open count (min zero)
          const level = state.env.quartoDivLevel;
          decrementDivCount(divFence);

          // Make a close token
          const token = state.push(kTokDivClose, "div", -1)
          token.markup = line; 
          token.meta = {
            line: state.line,
            level 
          }
        }

        state.line = start + 1
        return true  
      } else {
        return false;
      }
    },
    { alt: [] }
  )

  md.renderer.rules[kTokDivOpen] = renderStartDiv
  md.renderer.rules[kTokDivClose] = renderEndDiv
}
