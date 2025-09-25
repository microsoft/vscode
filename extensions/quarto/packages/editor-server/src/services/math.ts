/*
 * math.ts
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

import { JsonRpcServerMethod } from "../../../core/src/jsonrpc.js";
import { kMathMathjaxTypesetSvg, MathjaxTypesetOptions, MathServer } from "../../../editor-types/src/index.js";

import { mathjaxTypeset } from "../core/mathjax.js";
import { EditorServerDocuments } from "../core/index.js";

export function mathServer(documents: EditorServerDocuments) : MathServer {
  return {
    async mathjaxTypeset(tex: string, options: MathjaxTypesetOptions, docPath: string | null) {
      const docText = docPath ? documents.getDocument(docPath).code : undefined;
      return mathjaxTypeset(tex, options, docText);
    },
  };
}

export function mathServerMethods(documents: EditorServerDocuments) : Record<string, JsonRpcServerMethod> {
  const server = mathServer(documents);
  const methods: Record<string, JsonRpcServerMethod> = {
    [kMathMathjaxTypesetSvg]: args => server.mathjaxTypeset(args[0], args[1], args[2]),
  }
  return methods;
}

