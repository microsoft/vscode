/*
 * markdownit.ts
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


import MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token";

import attrPlugin from 'markdown-it-attrs';

import { Document } from "../../document";

import { Parser, cachingParser } from "../parser";
import { Token as QToken, TokenAttr, TokenType, kAttrAttributes, kAttrClasses, kAttrIdentifier } from "../token";
import { divPlugin, lines, mathjaxPlugin, yamlPlugin } from "core";

import { makeRange } from "../../range";

export function markdownitParser() : Parser {

  // block parser
  const md = MarkdownIt("zero");
  md.enable([
    "blockquote",
    "code",
    "fence",
    "heading",
    "lheading",
    "html_block",
    "list",
    "paragraph",
    "hr",
    "table"
  ]);
  md.use(attrPlugin);
  md.use(mathjaxPlugin, { enableInlines: false } );
  md.use(yamlPlugin);
  md.use(divPlugin);

  // inline parser
  const mdInline = MarkdownIt("commonmark");
  const mdToText = (markdown: string ) => {
    const tokens = mdInline.parseInline(markdown, {});
    return tokensToText(tokens);
  }

  return cachingParser((doc: Document) => {
    return parseDocument(md, mdToText, doc.getText());
  })
}

type MarkdownToPlainText = (markdown: string) => string;

function parseDocument(
  md: MarkdownIt, 
  mdToText: MarkdownToPlainText, 
  markdown: string
) : QToken[] {
  
  // remove unicode newlines
  const UNICODE_NEWLINE_REGEX = /\u2028|\u2029/g;
  markdown = markdown.replace(UNICODE_NEWLINE_REGEX, "");

  type HeaderInfo = { open: Token; body: Token[] };
  let currentHeader: HeaderInfo | undefined;

  // parse markdown and generate tokens
  const tokens: QToken[] = [];
  const inputLines = lines(markdown);
  const mdItTokens = md.parse(markdown, {});

  const tokenRange = (map: [number, number]) => {
    const endLine = map[1] > map[0] && !inputLines[map[1]]?.length ? map[1] - 1 : map[1];
    return makeRange(
      map[0], 
      0, 
      endLine, 
      inputLines[endLine].length
    );
  };

  for (let i=0; i<mdItTokens.length; i++)  {

    const token = mdItTokens[i];

    // look for our tokens
    switch(token.type) {
      case "front_matter": {
        if (token.map) {
          const endLine = lines(token.markup).length;
          tokens.push({
            type: "FrontMatter",
            range: makeRange(0,0,endLine,0),
            attr: undefined,
            data: token.markup
          })
        } else {
          console.log("front_matter did not have map")
        }
        break;
      }
      case "pandoc_div_open": {
        const startLine = token.meta.line as number;
        let endLine = -1;
        for (let j=(i+1); j<mdItTokens.length; j++) {
          const t = mdItTokens[j];
          if (t.type === "pandoc_div_close" && t.meta.level === token.meta.level) {
            endLine = t.meta.line;
            break;
          } 
        }
        if (endLine !== -1) {
          tokens.push({
            type: "Div",
            range: makeRange(startLine, 0, endLine, inputLines[endLine].length),
            attr: asTokenAttr(token.attrs),
            data: null
          })
        }
        break;
      }
      case "paragraph_open":
      case "blockquote_open":
      case "table_open": 
      case "hr": {
        if (token.map) {
          tokens.push({ type: asQuartoTokenType(token.type), range: tokenRange(token.map), data: null });
        } else {
          console.log(`${token.type} did not have map`);
        }
        break;
      }
      case "bullet_list_open":
      case "ordered_list_open": {
        if (token.map) {
          const map = token.map;
          map[1]--;
          tokens.push({ type: asQuartoTokenType(token.type), range: tokenRange(map), data: null });
        } else {
          console.log(`${token.type} did not have map`);
        }
        break;
      }
      case "fence":
      case "code_block": {
        if (token.map) {
          const line = inputLines[token.map[0]];
          const execMatch = line.match(/^([\t >]*)(```+)\s*\{([a-zA-Z0-9_-]+)/);
          const rawMatch = line.match(/\{=(\w+)\}\s*$/);
          const fenceMatch = line.match(/^([\t >]*)(```+)\s*([a-zA-Z0-9_-]+)/);
          if (execMatch) {
            tokens.push({
              type: "CodeBlock",
              range: tokenRange(token.map),
              attr: ["", [`{${execMatch[3]}`], []],
              data: token.content.replace(/\n$/, "")
            })
          }
          else if (rawMatch) {
            tokens.push({
              type: "RawBlock",
              range: tokenRange(token.map),
              attr: undefined,
              data: { format: rawMatch[1], text: token.content }
            })
          } else if (fenceMatch) {
            tokens.push({
              type: "CodeBlock",
              range: tokenRange(token.map),
              attr: ["", [fenceMatch[3]], []],
              data: token.content.replace(/\n$/, "")
            });
          } else {
            tokens.push({ 
              type: "CodeBlock", 
              range: tokenRange(token.map), 
              attr: asTokenAttr(token.attrs),
              data: token.content.replace(/\n$/, "")
            });
          }
        } else {
          console.log("fence did not have map");
        }
        break;
      }
      case "math_block": {
        if (token.map && token.map[1] < inputLines.length) {
          tokens.push({
            type: "Math",
            range: tokenRange(token.map),
            attr: undefined,
            data: { type: "DisplayMath", text: `\n${token.content}`} 
          })
        } 
        break;
      }
      case "heading_open": {
        currentHeader = { open: token, body: [] };
        break;
      }
      case "heading_close": {
        if (currentHeader) {
          const level = currentHeader.open.tag.match(/h(\d+)/)?.[1];
          if (level && currentHeader.open.map) {
            const text = tokensToText(currentHeader.body).trim();
            tokens.push({ 
              type: "Header", 
              range: tokenRange(currentHeader.open.map), 
              attr: asTokenAttr(currentHeader.open.attrs),
              data: { level: parseInt(level), text: mdToText(text)} 
            });
          } else {
            console.log("heading_open did not have level or map")
          }
          currentHeader = undefined;
        }
        break;
      }
      default: {
        if (currentHeader) {
          currentHeader.body.push(token);
        }
        break;
      }
        
    }
  
  }
  
  return tokens;
}


const tokensToText = (tokens: Token[]) : string => {
  return tokens.map(token => {
    if (token.children) {
      return tokensToText(token.children);
    } else {
      return token.content;
    }
  }).join("");
}

const asTokenAttr = (attribs: Array<[string,string]> | null) => {
  const tokenAttr: TokenAttr = ['', [], []];
  if (attribs === null || attribs.length === 0) {
    return tokenAttr;
  }
  for (const attrib of attribs) {
    const key = attrib[0];
    const value = attrib[1];
    switch(key) {
      case 'id':
        tokenAttr[kAttrIdentifier] = value;
        break;
      case 'class':
        tokenAttr[kAttrClasses].push(...value.split(' '));
        break;
      default:
        tokenAttr[kAttrAttributes].push([key,value]);
    }
  }
  return tokenAttr;
}

const asQuartoTokenType = (type: string) : TokenType => {
  switch(type) {
    case "heading_open":
      return "Header";
    case "blockquote_open":
      return "BlockQuote";
    case "hr":
      return "HorizontalRule";
    case "table_open":
      return "Table";
    case "bullet_list_open":
      return "BulletList";
    case "ordered_list_open":
      return "OrderedList";
    default:
      return "Para";
  }
}