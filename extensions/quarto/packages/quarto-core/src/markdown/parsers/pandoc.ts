/*
 * pandoc.ts
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

import path from "node:path"

import { QuartoContext } from "../../context.js";
import { Token, TokenFrontMatter, isCodeBlock, kAttrClasses } from "../token.js";
import { partitionYamlFrontMatter } from "../yaml.js";
import { Parser, cachingParser } from "../parser.js";
import { lines } from "../../../../core/src/index.js";
import { makeRange } from "../../range.js";
import { Document } from "../../document.js";
import { isExecutableLanguageBlock, languageNameFromBlock } from "../language.js";


export function pandocParser(context: QuartoContext, resourcesDir: string) : Parser {
    
  return cachingParser((doc: Document) => {
    const tokens = parseDocument(context, resourcesDir, doc.getText());

    return tokens;
  })
}

function parseDocument(context: QuartoContext, resourcePath: string, markdown: string) : Token[] {
 
  // remove the yaml front matter by replacing it with blank lines 
  // (if its invalid it will prevent parsing of the document)
  const partitioned = partitionYamlFrontMatter(markdown);
  const yaml = partitioned ? partitioned.yaml : null;
  const input = partitioned 
    ? "\n".repeat(lines(partitioned.yaml).length-1) +  partitioned.markdown
    : markdown;

  try {
    const output = context.runPandoc(
      { input },
      "--from", "commonmark_x+sourcepos",
       "--to", "plain",
       "--lua-filter", path.join(resourcePath, 'parser.lua')
    );
  
    // parse json (w/ some fixups)
    const inputLines = lines(input);
    const outputJson = JSON.parse(output) as Record<string,Token>;
    const tokens = (Object.values(outputJson).map((token) : Token => {
  
      // trim blocks
      if ((token.range.end.line > token.range.start.line) && 
          token.range.end.character === 0) {
        token.range = makeRange(
          token.range.start.line,
          token.range.start.character,
          token.range.end.line - 1,
          inputLines[token.range.end.line -1].length
        )
      }
      
      // fixup lang
      if (isCodeBlock(token) && isExecutableLanguageBlock(token)) {
        const lang = languageNameFromBlock(token);
        token.attr![kAttrClasses][0] = `{${lang}}`;
      } 

      // add null if no data
      if (token.data === undefined) {
        token.data = null;
      }
      
      // return token (order fields)
      return {
        type: token.type,
        range: token.range,
        attr: token.attr,
        data: token.data
      };
    }));
  
  
    // add a FrontMatter token if there is front matter
    if (yaml) {
      const yamlLines = lines(yaml);
      const yamlToken: TokenFrontMatter = {
        type: "FrontMatter",
        range: makeRange(0, 0, yamlLines.length, 0),
        attr: undefined,
        data: yaml, 
      }
      tokens.unshift(yamlToken);
    }
  
    return tokens;

  } catch(error) {
    // message has already been written to stderr
    return [];
  
  }
}


