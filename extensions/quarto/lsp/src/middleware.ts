/*
 * middleware.ts
 *
 * Copyright (C) 2023 by Posit Software, PBC
 * Copyright (c) Microsoft Corporation. All rights reserved.
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

import { Connection, ServerCapabilities } from "vscode-languageserver"


// capabilities provided just so we can intercept them w/ middleware on the client
export function middlewareCapabilities(): ServerCapabilities {
  return {
    signatureHelpProvider: {
      // assume for now that these cover all languages (we can introduce
      // a refinement system like we do for completion triggers if necessary)
      triggerCharacters: ["(", ","],
      retriggerCharacters: [")"],
    },
    documentFormattingProvider: true,
    documentRangeFormattingProvider: true,
    definitionProvider: true
  }
};

// methods provided just so we can intercept them w/ middleware on the client
export function middlewareRegister(connection: Connection) {

  connection.onSignatureHelp(async () => {
    return null;
  });

  connection.onDocumentFormatting(async () => {
    return null;
  });

  connection.onDocumentRangeFormatting(async () => {
    return null;
  });

  connection.onDefinition(async () => {
    return null;
  });

}
