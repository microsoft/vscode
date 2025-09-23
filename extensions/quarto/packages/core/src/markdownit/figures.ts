/*
 * figures.ts
 *
 * Copyright (C) 2020-2023 Posit Software, PBC
 *
 */

import MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token";
import { kTokParaClose, kTokParaOpen } from "./utils/tok";

export interface FigureOptions {
  dataType?: boolean;
  link?: boolean;
  figcaption?: boolean;
  copyAttrs?: boolean;
  tabindex?: boolean;
  lazyLoading?: boolean;
}

export const kTokFigureOpen = "figure_open";
export const kTokFigureClose = "figure_close";

export const kTokFigCaptionOpen = "figcaption_open";
export const kTokFigCaptionClose = "figcaption_close";

export const mutateToFigureTok = (token: Token, type: "open" | "close") => {
  token.type = type === "open" ? kTokFigureOpen : kTokFigureClose;
  token.tag = "figure";
}

export function figuresPlugin(md: MarkdownIt, options: FigureOptions) {
  options = options || {};

  md.core.ruler.before("linkify", "implicit_figures", (state) => {
    // reset tabIndex on md.render()
    let tabIndex = 1;

    // do not process first and last token
    for (let i = 1, l = state.tokens.length; i < l - 1; ++i) {
      const token = state.tokens[i];

      if (token.type !== "inline") {
        continue;
      }

      // children: image alone, or link_open -> image -> link_close
      if (
        !token.children ||
        (token.children.length !== 1 && token.children.length !== 3)
      ) {
        continue;
      }
      
      // one child, should be img
      if (token.children.length === 1 && token.children[0].type !== "image") {
        continue;
      }

      // three children, should be image enclosed in link
      if (
        token.children.length === 3 &&
        (token.children[0].type !== "link_open" ||
          token.children[1].type !== "image" ||
          token.children[2].type !== "link_close")
      ) {
        continue;
      }


      // prev token is paragraph open
      if (i !== 0 && state.tokens[i - 1].type !== kTokParaOpen) {
        continue;
      }
      // next token is paragraph close
      if (i !== l - 1 && state.tokens[i + 1].type !== kTokParaClose) {
        continue;
      }

      // The image
      const image = token.children.length === 1 ? token.children[0] : token.children[1];
      
      // The image must have a caption to count as a figure
      if (!image.children || image.children.length === 0) {
        continue;
      }
    
      // We have inline token containing an image only.
      // Previous token is paragraph open.
      // Next token is paragraph close.
      // Lets replace the paragraph tokens with figure tokens.
      const figure = state.tokens[i - 1];
      mutateToFigureTok(figure, "open");
      mutateToFigureTok(state.tokens[i + 1], "close");

      if (options.dataType == true) {
        state.tokens[i - 1].attrPush(["data-type", "image"]);
      }

      if (options.link == true && token.children.length === 1) {
        token.children.unshift(new state.Token("link_open", "a", 1));
        const src = image.attrGet("src");
        if (src !== null) {
          token.children[0].attrPush(["href", src]);
        }
        token.children.push(new state.Token("link_close", "a", -1));
      }



      if (options.figcaption == true) {
        if (image.children && image.children.length) {
          token.children.push(
            new state.Token(kTokFigCaptionOpen, "figcaption", 1)
          );
          token.children.splice(token.children.length, 0, ...image.children);
          token.children.push(
            new state.Token(kTokFigCaptionClose, "figcaption", -1)
          );
          image.children.length = 0;
        }
      }

      if (options.copyAttrs && image.attrs) {
        const f = options.copyAttrs === true ? "" : options.copyAttrs;
        figure.attrs = image.attrs.filter(([k]) => k.match(f));
      }

      if (options.tabindex == true) {
        // add a tabindex property
        // you could use this with css-tricks.com/expanding-images-html5
        state.tokens[i - 1].attrPush(["tabindex", String(tabIndex)]);
        tabIndex++;
      }

      if (options.lazyLoading == true) {
        image.attrPush(["loading", "lazy"]);
      }
    }
  });
}
