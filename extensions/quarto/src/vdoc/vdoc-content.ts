/*
 * vdoc-content.ts
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

import { Uri, workspace } from "vscode";
import { VirtualDoc } from "./vdoc";

const kQmdEmbeddedContent = "quarto-qmd-embedded-content";
const virtualDocumentContents = new Map<string, string>();

export function activateVirtualDocEmbeddedContent() {
  workspace.registerTextDocumentContentProvider(kQmdEmbeddedContent, {
    provideTextDocumentContent: (uri) => {
      const path = uri.path.slice(1);
      const originalUri = path.slice(0, path.lastIndexOf("."));
      const decodedUri = decodeURIComponent(originalUri);
      const content = virtualDocumentContents.get(decodedUri);
      return content;
    },
  });
}

export function virtualDocUriFromEmbeddedContent(
  virtualDoc: VirtualDoc,
  parentUri: Uri
) {
  // set virtual doc
  const originalUri = parentUri.toString();
  virtualDocumentContents.set(originalUri, virtualDoc.content);

  // form uri
  const vdocUriString = `${kQmdEmbeddedContent}://${virtualDoc.language
    }/${encodeURIComponent(originalUri)}.${virtualDoc.language.extension}`;
  const vdocUri = Uri.parse(vdocUriString);

  // return it
  return vdocUri;
}
