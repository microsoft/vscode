/*
 * figure-divs.ts
 *
 * Copyright (C) 2020-2023 Posit Software, PBC
 *
 */

import MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token";
import { readAttrValue } from "./utils/markdownit.js";
import { kTokInline, kTokParaClose, kTokParaOpen } from "./utils/tok.js";
import { kTokDivClose, kTokDivOpen } from "./divs";
import { kTokFigCaptionClose, kTokFigCaptionOpen, mutateToFigureTok } from "./figures";


const kFigureDivRuleName = "quarto-figure-divs";
const kFigurePrefix = "fig-";


export const figureDivsPlugin = (md: MarkdownIt) => {
  
  // Handle pandoc-style divs
  md.core.ruler.push(
    kFigureDivRuleName,
    (state) => {

      const isFigureDiv: boolean[] = [];

      for (let i = 0; i < state.tokens.length; i++) {
        const token = state.tokens[i];
        if (token.type === kTokDivOpen) {
          const id = readAttrValue("id", token.attrs);
          if (id?.startsWith(kFigurePrefix)) {
            isFigureDiv.push(true);  
            mutateToFigureTok(token, "open");
          } else {
            // Note the div, but not a figure div
            isFigureDiv.push(false);
          }
        } else if (token.type === kTokDivClose) {
          const isFigDiv = isFigureDiv.pop();
          if (isFigDiv) {

            // If the preview token is paragraph, use that as the caption
            if (i - 3 >= 0) {
              const maybeParaStart = state.tokens[i-3];
              const maybeInline = state.tokens[i-2];
              const maybeParaEnd = state.tokens[i-1];
              if (maybeParaStart.type === kTokParaOpen && maybeParaEnd.type === kTokParaClose && maybeInline.type === kTokInline) {
                mutateToFigCaption(state.tokens[i-3], "open");
                mutateToFigCaption(state.tokens[i-1], "close");
              }
            }
            mutateToFigureTok(token, "close");
          }  
        }
      }
    });
  }

  const mutateToFigCaption = (token: Token, type: "open" | "close") => {
    token.tag = "figcaption";
    token.type = type === "open" ? kTokFigCaptionClose : kTokFigCaptionOpen;
  }

