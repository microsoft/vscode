/*
 * codeview.ts
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

import { JsonRpcServerMethod } from "core";

import {
  CodeViewServer,
  kCodeViewGetCompletions,
  kCodeViewExecute,
  kCodeViewPreviewDiagram,
  kCodeViewAssist,
  kCodeViewGetDiagnostics
} from "editor-types";



export function codeViewServerMethods(server: CodeViewServer): Record<string, JsonRpcServerMethod> {
  const methods: Record<string, JsonRpcServerMethod> = {
    [kCodeViewAssist]: args => server.codeViewAssist(args[0]),
    [kCodeViewExecute]: args => server.codeViewExecute(args[0], args[1]),
    [kCodeViewGetCompletions]: args => server.codeViewCompletions(args[0]),
    [kCodeViewGetDiagnostics]: args => server.codeViewDiagnostics(args[0]),
    [kCodeViewPreviewDiagram]: args => server.codeViewPreviewDiagram(args[0], args[1])
  };
  return methods;
}
