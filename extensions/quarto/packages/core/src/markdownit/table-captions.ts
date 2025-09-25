/*
 * table-captions.ts
 *
 * Copyright (C) 2020-2023 Posit Software, PBC
 *
 */

import MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token";
import { kTokInline, kTokParaClose, kTokParaOpen, kTokTableClose, kTokTableOpen, kTokText } from "./utils/tok.js";


const kTableCaptionRule = "quarto-table-captions";

export const tableCaptionPlugin = (md: MarkdownIt) => {
  
  md.core.ruler.push(
    kTableCaptionRule,
    (state) => {

      const tableIdxs: number[] = [];
      const tablePoss: TablePos[] = [];
  
      // Identify tables that we'd like to process
      // The tables must be the bottom first (we will process them bottom to
      // top to ensure that the positions remain accurate as the tokens
      // are mutated
      for (let i = 0; i < state.tokens.length; i++) {
        const token = state.tokens[i];
        if (token.type === kTokTableOpen) {
          tableIdxs.push(i);
        } else if (token.type === kTokTableClose) {          
          const start = tableIdxs.pop();
          if (start) {
            tablePoss.unshift({
              start,
              end: i
            })
          }
        }
      }

      // Look just past the tables and if there is a paragraph that is 
      // a table caption, extract that and place it in the table      
      for (const tablePos of tablePoss) {
        resolveTableCaption(state.tokens, tablePos.start, tablePos.end);
      }
    });
  }


  function resolveTableCaption(tokens: Token[], tblStartPos: number, tblEndPos: number) {
    // Must have at least three tokens past the table end
    if (tokens.length > tblEndPos + 3) {
      if (tokens[tblEndPos + 1].type === kTokParaOpen 
        && tokens[tblEndPos + 2].type === kTokInline
        && tokens[tblEndPos + 3].type === kTokParaClose) {

          const maybeCaption = tokens[tblEndPos + 2];
          
          const isText = maybeCaption.children !== null && maybeCaption.children.length > 0 && maybeCaption.children[0].type === kTokText;
          const maybeCaptionText = isText ? maybeCaption.children![0].content : "";
          const match = maybeCaptionText.match(/^:\s([^{}]*)(?:\{.*\}){0,1}$/);
          if (match && match[1]) {

            // Carve out the existing tokens
            const capTokens = tokens.splice(tblEndPos + 1, 3);

            // We have the caption, remove the paragraph and return
            // the caption
            capTokens[0].type = "table_caption";
            capTokens[0].tag = "caption";

            // Forward any attributes from the caption up to the table
            tokens[tblStartPos].attrs = capTokens[0].attrs;
            capTokens[0].attrs = [];

            // Trim the content
            capTokens[1].children![0].content = match[1];

            // Close the caption
            capTokens[2].type = "table_caption";
            capTokens[2].tag = "caption";

            tokens.splice(tblStartPos + 1, 0, ...capTokens);
          } 
      } 
    } 
  }

  interface TablePos {
    start: number,
    end: number
  }