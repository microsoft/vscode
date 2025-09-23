/* eslint-disable @typescript-eslint/naming-convention */
/*
 * schemes.ts
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

import { Uri } from "vscode";

export const Schemes = Object.freeze({
  http: "http:",
  https: "https:",
  file: "file:",
  untitled: "untitled",
  mailto: "mailto:",
  data: "data:",
  vscode: "vscode:",
  "vscode-insiders": "vscode-insiders:",
  notebookCell: 'vscode-notebook-cell',
});

export function hasFileScheme(uri: Uri) {
  return uri.scheme === Schemes.file.slice(0, Schemes.file.length - 1);
}

export function isOfScheme(scheme: string, link: string): boolean {
  return link.toLowerCase().startsWith(scheme + ':');
}
