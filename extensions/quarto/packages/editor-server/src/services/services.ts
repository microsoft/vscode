/*
 * services.ts
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


import { CodeViewServer, EditorServices } from "editor-types";

import { mathServer, mathServerMethods } from "./math";
import { dictionaryServer, dictionaryServerMethods, DictionaryServerOptions } from './dictionary';
import { JsonRpcServerMethod } from 'core';
import { prefsServer, prefsServerMethods } from "./prefs";
import { sourceServer, sourceServerMethods } from "./source";
import { PandocServerOptions } from "../core/pandoc";
import { codeViewServerMethods } from "./codeview";
import { EditorServerDocuments } from "../core";

export {
  mathServer, 
  mathServerMethods, 
  dictionaryServer, 
  dictionaryServerMethods,
  prefsServer,
  prefsServerMethods,
  codeViewServerMethods,
  sourceServer,
  sourceServerMethods
};
export type { DictionaryServerOptions };

export interface EditorServicesOptions {
  documents: EditorServerDocuments;
  dictionary: DictionaryServerOptions;
  pandoc: PandocServerOptions,
  codeview?: CodeViewServer;
}

export function editorServices(options: EditorServicesOptions) : EditorServices {
  return {
    math: mathServer(options.documents),
    dictionary: dictionaryServer(options.dictionary),
    prefs: prefsServer(),
    source: sourceServer(options.pandoc),
    codeview: options.codeview
  };
} 

export function editorServicesMethods(options: EditorServicesOptions): Record<string,JsonRpcServerMethod> {
  return {
    ...mathServerMethods(options.documents),
    ...dictionaryServerMethods(options.dictionary),
    ...prefsServerMethods(prefsServer()),
    ...sourceServerMethods(options.pandoc),
    ...(options.codeview ? codeViewServerMethods(options.codeview) : {})
  };
}
