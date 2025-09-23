
/*
 * zotero.ts
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

import { CSL } from './csl';

export const kZoteroSetLibraryConfig = 'zotero_set_library_config';
export const kZoteroValidateWebApiKey = 'zotero_validate_web_api_key';
export const kZoteroGetCollections = 'zotero_get_collections';
export const kZoteroGetLibraryNames = 'zotero_get_library_names';
export const kZoteroGetActiveCollectionSpecs = 'zotero_get_active_collection_specs';
export const kZoteroBetterBibtexExport = 'zotero_better_bibtex_export';

export type ZoteroResultMessage = ZoteroCollection[] | ZoteroCollectionSpec[] | string | string[] | null;

export interface ZoteroResult {
  status:
    | 'ok' // ok (results in 'message')
    | 'notfound' // invalid api key
    | 'nohost' // no internet connectivity
    | 'error'; // unexpected error (details in 'error')
  message: ZoteroResultMessage;
  warning: string;
  error: string;
  unauthorized?: boolean;
}

export interface ZoteroCollectionSpec {
  name: string;
  version: number;
  key: string;
  parentKey: string;
}

export interface ZoteroCollection extends ZoteroCollectionSpec {
  items: ZoteroCSL[];
}

export interface ZoteroCSL extends CSL {
  libraryID: string;
  collectionKeys: string[];
}

export const kZoteroMyLibrary = "My Library";

export interface ZoteroCollectionSource {
  getCollections: (
    collections: string[], 
    cached: ZoteroCollectionSpec[]
  ) => Promise<ZoteroResult> ;
  getLibraryNames: () => Promise<ZoteroResult>;
  getActiveCollectionSpecs: (collections: string[]) => Promise<ZoteroResult>;
}

export interface ZoteroLibraryConfig {
  type: "none" | "local" | "web",
  dataDir?: string,
  apiKey?: string,
}

export interface ZoteroServer {

  setLibraryConfig: (config: ZoteroLibraryConfig) => Promise<void>;

  validateWebAPIKey: (key: string) => Promise<boolean>;

  getCollections: (
    file: string | null,
    collections: string[],
    cached: ZoteroCollectionSpec[],
    useCache: boolean,
  ) => Promise<ZoteroResult>;

  getLibraryNames: () => Promise<ZoteroResult>;

  getActiveCollectionSpecs: (file: string | null, collections: string[]) => Promise<ZoteroResult>;

  // Return status: nohost w/ warning text if it fails to
  // communciate w/ Better BibTeX. Otherwise returns
  // status: ok with exported text in message.
  betterBibtexExport: (itemKeys: string[], translatorId: string, libraryId: number) => Promise<ZoteroResult>;
}
