/*
 * parser.ts
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

import { Token } from "./token";
import { Document } from "../document"


export type Parser = (document: Document) => Token[];


export function cachingParser(parser: Parser) : Parser {

  // pandoc element cache for last document requested
  let elementCache: Token[] | undefined;
  let elementCacheDocUri: string | undefined;
  let elementCacheDocVersion: number | undefined;

  return (doc: Document): Token[] => {
    if (
      !elementCache ||
      doc.uri.toString() !== elementCacheDocUri ||
      doc.version !== elementCacheDocVersion
    ) {
      elementCache = parser(doc);
      elementCacheDocUri = doc.uri.toString();
      elementCacheDocVersion = doc.version;
    }
    return elementCache;
  }
  
}


