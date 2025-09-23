/*
 * extension.ts
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


import { PandocExtensions } from './pandoc';

import { Extension, ExtensionContext, ExtensionFn } from './extension-types'

export type { Extension, ExtensionContext, ExtensionFn } ;

// create an ExtensionFn for a given extension and format option that must be enabled
export function extensionIfEnabled(extension: Extension, name: string | string[]) {
  return (context: ExtensionContext) => {
    if (extensionEnabled(context.pandocExtensions, name)) {
      return extension;
    } else {
      return null;
    }
  };
}

export function extensionEnabled(pandocExtensions: PandocExtensions, name: string | string[]) {
  // match single extension name
  if (typeof name === 'string') {
    if (pandocExtensions[name]) {
      return true;
    }

    // match any one of several names
  } else if (Array.isArray(name)) {
    for (const nm of name) {
      if (pandocExtensions[nm]) {
        return true;
      }
    }
  }

  return false;
}
