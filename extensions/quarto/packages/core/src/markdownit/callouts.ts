/*
* callouts.ts
*
* Copyright (C) 2020-2023 Posit Software, PBC
*
*/
import type MarkdownIt from "markdown-it/lib"
import Renderer from "markdown-it/lib/renderer";
import Token from "markdown-it/lib/token";
import { addClass, readAttrValue } from "./utils/markdownit";
import { kTokDivClose, kTokDivOpen } from "./divs";


const kTokCalloutOpen = "quarto_callout_open";
const kTokCalloutClose = "quarto_callout_close";

const kTokCalloutTitleOpen = "quarto_callout_title_open";
const kTokCalloutTitleClose = "quarto_callout_title_close";

const kTokCalloutContentOpen = "quarto_callout_content_open";
const kTokCalloutContentClose = "quarto_callout_content_close";

const kCalloutPrefix = "callout-";
const kCalloutRuleName = "quarto-callouts";

interface Callout {
  type: "note" | "caution" | "warning" | "important" | "tip" | string;
  clz: string;
  title?: string;
  icon?: boolean;
  appearance?: "default" | "minimal" | "simple";
  collapse?: boolean;
} 

export const calloutPlugin = (md: MarkdownIt) => {
  
  // Handle pandoc-style divs
  md.core.ruler.push(
    kCalloutRuleName,
    (state) => {
      const noteStartCallout = (callout: Callout, depth: number) => {
        if (calloutDepth == -1) {
          calloutDepth = depth;
        }
        state.env['quarto-active-callout'] = callout;
      }

      const noteCloseCallout = () => {
        calloutDepth = -1;
        state.env['quarto-active-callout'] = undefined;
      }

      const activeCallout = () => {
        return state.env['quarto-active-callout'];
      }

      const isCloseCallout = (depth: number) => {
        return calloutDepth === depth;
      }

      const titleOpenTok = (title?: string) => {
        const token = new Token(kTokCalloutTitleOpen, "", 1)
        token.tag = "div";
        token.attrs = [["class", "callout-header"]];
        if (title) {
          token.attrs.push(["title", title]);
        }
        return token;
      }

      const titleCloseTok = () => {
        const token = new Token(kTokCalloutTitleClose, "", -1)
        token.tag = "div";
        return token;       
      }

      const contentOpenTok = () => {
        const token = new Token(kTokCalloutContentOpen, "", 1)
        token.tag = "div";
        token.attrs = [["class", "callout-body-container callout-body"]];
        return token;
      }

      const contentCloseTok = () => {
        const token = new Token(kTokCalloutContentClose, "", -1)
        token.tag = "div";
        return token;        
      }

      const outTokens: Token[] = [];
      let calloutDepth = -1;
      let divDepth = 0;
      // just started callout - process title
      // finished processing title - process content

      let calloutState: "scanning" | "add-title" | "capturing-title" | "add-body" | "capturing-body" =  "scanning";
      for (const token of state.tokens) {

        switch (calloutState) {
          case "add-title":
            if (token.type === "heading_open") {
              outTokens.push(titleOpenTok()); 
              calloutState = "capturing-title";
            } else {
              const callout = activeCallout();
              outTokens.push(titleOpenTok(callout.title)); 
              outTokens.push(titleCloseTok()); 
              calloutState = "add-body";
            }
            break;
          case "capturing-title":
            if (token.type === "heading_close") {
              outTokens.push(titleCloseTok()); 
              calloutState = "add-body";
            } else {
              outTokens.push(token);
            }
            break;
          case "add-body":
            outTokens.push(contentOpenTok());
            outTokens.push(token);
            calloutState = "capturing-body";
            break;
          case "scanning":
          default:
            if (token.type === kTokDivOpen) {
              divDepth++;
              const callout = parseCallout(token.attrs);
              if (callout) {
                noteStartCallout(callout, divDepth);
                calloutState = "add-title";
              
                const openCallout = new Token(kTokCalloutOpen, "", 1);
                openCallout.attrs = openCallout.attrs || [];
                openCallout.meta = callout;
                outTokens.push(openCallout);
              } else {
                outTokens.push(token);
              }
            } else if (token.type === kTokDivClose) {   
              if (isCloseCallout(divDepth)) {
                outTokens.push(contentCloseTok());
                outTokens.push(new Token(kTokCalloutClose, "", -1));
                noteCloseCallout()
              } else {
                outTokens.push(token);
              }
              divDepth--;
              
            } else {
              outTokens.push(token);
            }
            break;
        }
      }
      state.tokens = outTokens;
      return false;
    }
  )
  md.renderer.rules[kTokCalloutOpen] = renderStartCallout
  md.renderer.rules[kTokCalloutClose] = renderEndCallout
  md.renderer.rules[kTokCalloutTitleOpen] = renderStartCalloutTitle
  md.renderer.rules[kTokCalloutTitleClose] = renderEndCalloutTitle
}


// Render pandoc-style divs
function renderStartCallout(tokens: Token[], idx: number, _options: MarkdownIt.Options, _env: unknown, self: Renderer): string {
  const token = tokens[idx];
  const callout = token.meta as Callout;

  // Add classes decorating as callout
  token.attrs = addClass(`callout ${callout.clz}`, token.attrs);

  // Add class that reflects the style
  token.attrs = addClass(appearanceClass(callout.appearance), token.attrs);

  return `<div ${self.renderAttrs(token)}>`;
}

// Render pandoc-style divs
function renderEndCallout(): string {
  return `</div>`;
}

function renderStartCalloutTitle(tokens: Token[], idx: number): string {
  const token = tokens[idx];
  const title = readAttrValue("title", token.attrs) || "";
  const startContent = `
<div class="callout-header">
<div class="callout-icon-container">
  <i class="callout-icon"></i>
</div>
<div class="callout-title-container">${title}
`;
  return startContent;
}

function renderEndCalloutTitle(): string {
  return `</div>\n</div>`;
}


const calloutAppearance = (val: string | undefined) => {
  if (val) {
    switch(val) {
      case "minimal":
        return "minimal";
      case "simple":
        return "simple"
      case "default":
      default:
        return "default";
    }
  } else {
    return "default";
  }
}

const parseCallout = (attrs: null | [string, string][]) : Callout | undefined => {
  if (attrs === null) { 
    return undefined;
  }

  const classAttr = attrs.find((attr) => { return attr[0] === "class"});
  if (!classAttr) {
    return undefined;
  }

  const classes = classAttr[1].split(" ");
  const calloutClass = classes.find((clz) => {
    return clz.startsWith('callout-');
  })

  if (calloutClass) { 
    const type = calloutClass.replace(kCalloutPrefix, "")
    
    const title = readAttrValue("title", attrs) || type.slice(0, 1).toUpperCase() + type.slice(1);;
    const appearance = calloutAppearance(readAttrValue("appearance", attrs));

    return {
      type: type || "note",
      clz: calloutClass,
      title,
      appearance
    }

  } else {
    return undefined;
  }

}

const appearanceClass = (appearance?:  "default" | "minimal" | "simple") => {
  const style = appearance || "default";
  return `callout-style-${style}`;
}

