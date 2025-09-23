/*
* citation.ts
*
* Copyright (C) 2020-2023 Posit Software, PBC
*
*/


import type MarkdownIt from "markdown-it/lib"
import Renderer from "markdown-it/lib/renderer";
import Token from "markdown-it/lib/token";

const kTokCite = "quarto_cite";

export const citationPlugin = (md: MarkdownIt) => {

  // Very simple plugin example that surrounds @text with `code`
  md.core.ruler.push('quarto-citation', function replaceAtSymbol(state) {
    const tokens = state.tokens;

    for (const token of tokens) {
      if (token.type === 'inline' && token.children) {

        // Rebuild the child list
        const children: Token[] = [];
        for (let i = 0; i < token.children.length; i++) {
          const child = token.children[i];
          if (child.type === 'text') {
            const content = child.content;


            const textToken = (text: string[]) => {
              const newToken = new state.Token('text', '', 0);
              newToken.content = text.join("");
              
              return newToken;
            }

            let text: string[] = [];
            const flushText = () => {
              if (text.length) {
                children.push(textToken(text));
                text = [];                  
              }
            }

            let cite: string[] = [];
            const flushCite = () => {
              if (cite.length) {
                // Determine the cite style
                let style = cite[0] === "-" ? "suppress-author" : "in-text";
                if (bracketCount > 0) {
                  style = "normal";
                }

                // The classes
                const clz = ["cite", style];

                // If the cite ends in punctuation, trim that off and make that text
                const puncText: string[] = [];

                // Trim off ending punctuation
                if ([":",".","#","$","%","&","-","+","?","<",">","~","/","!"].includes(cite[cite.length - 1])) {
                  puncText.push(cite[cite.length - 1]);
                  cite = cite.slice(0, -1);
                }

                // Make a cite token
                const newToken = new state.Token(kTokCite, '', 0);
                newToken.content = cite.join("");
                newToken.attrs = newToken.attrs || [];
                newToken.attrs?.push(["class", clz.join(" ")]);
                children.push(newToken);
                cite = []; 
                
                if (puncText.length > 0) {
                  children.push(textToken(puncText));
                }
              }
            }

            let capture: "text" | "cite" = "text";
            let bracketCount = 0;
            for (let j = 0; j < content.length; j++) {

              const char = content.charAt(j);
              if (char === "@") {
                if ((text.length === 1 && text[0] === '-') || 
                    text.length > 1 && text[text.length - 1] === "-" && text[text.length - 2] === "[") {
                  cite.push('-');
                  cite.push(char);
                  text.pop();
                  flushText();
                  capture = 'cite';
                } else if (text[text.length - 1] === ' ') {
                  flushText();   
                  cite.push(char);
                  capture = 'cite';               
                } else if (text[text.length- 1] === '-' && text[text.length - 2] === ' ') {
                  text = text.slice(0, -1);
                  flushText();
                  cite.push('-');
                  cite.push(char);
                  capture = 'cite';
                } else if (text[text.length - 1] === '[' && text[text.length - 2] === ' ') {
                  flushText();
                  cite.push(char);
                  capture = 'cite';
                } else if (text.length === 0) {
                  cite.push(char);
                  capture = 'cite';
                }
                else {
                  if (capture === 'cite') {
                    cite.push(char);
                  } else {
                    text.push(char);
                  }  
                }
              } else if (char === " ") { 
                capture = 'text';
                flushCite();
                text.push(char);
              } else if (char === "[") {
                bracketCount++;
                text.push(char);
              } else if (char === "]") {
                bracketCount--;
                capture = 'text';
                flushCite();
                text.push(char);
              }
              else {
                if (capture === 'cite') {
                  cite.push(char);
                } else {
                  text.push(char);
                }
              }
            }
            flushCite();
            flushText();
          } else {
            children.push(child);
          }
        }
        token.children = children.length > 0 ? children : null;
      }
    }
  });

  md.renderer.rules[kTokCite] = renderCite
}


// Render pandoc-style divs
function renderCite(tokens: Token[], idx: number, _options: MarkdownIt.Options, _env: unknown, self: Renderer): string {
  const token = tokens[idx]; 
  const citeContent =  `<code ${self.renderAttrs(token)}>${token.content}</code>`;
  return citeContent;
}
