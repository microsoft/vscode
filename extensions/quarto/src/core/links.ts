/*
 * links.ts
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

import * as vscode from "vscode";
import { kImageExtensions } from "core";
import { Schemes } from "./schemes";

const knownSchemes = [...Object.values(Schemes), `${vscode.env.uriScheme}:`];

export function getUriForLinkWithKnownExternalScheme(
  link: string
): vscode.Uri | undefined {
  if (knownSchemes.some((knownScheme) => isOfScheme(knownScheme, link))) {
    return vscode.Uri.parse(link);
  }

  return undefined;
}

export function isOfScheme(scheme: string, link: string): boolean {
  return link.toLowerCase().startsWith(scheme);
}


export function isImageLink(link: string) {
  return kImageExtensions.some((ext) => link.toLowerCase().endsWith(ext));
}
