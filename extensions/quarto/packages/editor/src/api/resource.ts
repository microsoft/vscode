/*
 * resource.ts
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


import { EditorUIContext } from "./ui-types";

// mapResourceToURL can return a string or promise, this function
// normalizes the call so its always a promise
export function mapResourceToURL(uiContext: EditorUIContext, path: string) : Promise<string> {
  return new Promise(resolve => {
    const result = uiContext.mapResourceToURL(path);
    if (typeof(result) === "string") {
      resolve(result);
    } else {
      result.then(resolve);
    }
  });

}