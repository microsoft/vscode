/*
 * source.ts
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

import { CSL, ZoteroCSL, ZoteroCollection, ZoteroCollectionSource, ZoteroCollectionSpec, ZoteroResult } from "../../../../../editor-types/src/index.js"
import { Item, Library, User, ZoteroApi, ZoteroAuthorizationError, ZoteroObjectNotFoundError, ZoteroServiceUnavailable, zoteroApi } from "./api.js";
import { groupsLocal } from "./groups.js";
import { libraryCollectionName, libraryList } from "./libraries.js";
import { libraryRead, libraryReadCollections, libraryReadVersions, userWebLibrariesDir } from "./storage.js";
import { zoteroSyncWebLibraries, zoteroSyncWebLibrary } from "./sync.js";
import { zoteroTrace } from "./trace.js";
import { resolveCslJsonCheaterKeyForValue } from "../util.js";


export function zoteroWebCollectionSource(zoteroKey: string) : ZoteroCollectionSource {
  let zotero: ZoteroApi | undefined;
  return {
    async getCollections(collections: string[], cached: ZoteroCollectionSpec[]) : Promise<ZoteroResult> {
      try {
        try {
          zotero = zotero || await zoteroApi(zoteroKey);
        } catch(error) {
          console.error(error);
          return handleZoteroError(error);
        }
      

        const libraries = collections.length === 0 
          ? await localLibraries(zotero.user)
          : await collectionNamesToLibraries(zotero.user, collections);
        const zoteroCollections: ZoteroCollection[] = [];
        for (const library of libraries) {
          // ensure we have the most up to date version of the library
          await zoteroSyncWebLibrary(zotero, library.type, library.id);
          const versions = await libraryReadVersions(zotero.user, library);
          const cachedSpec = cached.find(spec => spec.key === String(library.id));
          if (cachedSpec?.version === versions.items) {
            zoteroCollections.push({...cachedSpec, items: []});
          } else {
            const libraryData = await libraryRead(userWebLibrariesDir(zotero.user), library);
            zoteroCollections.push({
              name: libraryCollectionName(library),
              version: libraryData.versions.items,
              key: String(library.id),
              parentKey: "",
              items: asCollectionSourceItems(library, libraryData.items)
            })
          }
        }
        return {
          status: 'ok',
          message: zoteroCollections,
          warning: '',
          error: ''
        }
      } catch(error) {
        return handleZoteroError(error);
      }
      
    },

    async getLibraryNames(): Promise<ZoteroResult> {
      try {
        // ensure we have access to the api
        zotero = zotero || await zoteroApi(zoteroKey);

        // sync all libraries so our list of libraries is up to date
        await zoteroSyncWebLibraries(zotero);

        // return names
        const names = (await localLibraries(zotero.user)).map(libraryCollectionName);
        return {
          status: "ok",
          message: names,
          warning: '',
          error: ''
        }
      } catch(error) {
        return handleZoteroError(error);
      }
       
    },

    async getActiveCollectionSpecs(collections: string[]): Promise<ZoteroResult> {
      try { 
        // ensure we have access to the api
        zotero = zotero || await zoteroApi(zoteroKey);

        // get libraries
        const libraries = collections.length === 0 
          ? await localLibraries(zotero.user)
          : await collectionNamesToLibraries(zotero.user, collections);

        // read collections specs
        const collectionSpecs: ZoteroCollectionSpec[] = [];
        for (const library of libraries) {

          // NOTE: we don't perform a full sync on the library here because
          // this call always follows a call to getCollections which does the sync
          const versions = await libraryReadVersions(zotero.user, library);
          
          // read main library
          collectionSpecs.push({
            name: libraryCollectionName(library),
            version: versions.items,
            key: String(library.id),
            parentKey: ""
          });

          // read sub-collections
          const collections = await libraryReadCollections(zotero.user, library);
          for (const collection of collections) {
            collectionSpecs.push({
              name: collection.name,
              version: collection.version,
              key: collection.key,
              parentKey: typeof(collection.parentCollection) === "string" 
                ? collection.parentCollection 
                : String(library.id)
            });
          }
        }
        return {
          status: 'ok',
          message: collectionSpecs,
          warning: '',
          error: ''
        }
      } catch(error) {
        return handleZoteroError(error)
      }
    }
  };
}

async function localLibraries(user: User) {
  const groups = await groupsLocal(user);
  return libraryList(user, groups);
}


async function collectionNamesToLibraries(user: User, collections: string[]) {
  const libraries: Library[] = [];
  const allLibraries = await localLibraries(user);
  for (const collection of collections) {
    const library = allLibraries.find(lib => collection === libraryCollectionName(lib));
    if (library) {
      libraries.push(library);
    } else {
      zoteroTrace(`Library named "${collection}" not found for user ${user.username}`);
    }
  }
  return libraries;
}

function asCollectionSourceItems(library: Library, items: Item[]) : ZoteroCSL[] {
  return items.map(item => {
    const collectionKeys: string[] = [String(library.id)];
    if (item.data?.["collections"]) {
      collectionKeys.push(...((item.data["collections"] as unknown[]).map(String)));
    }
    return {
      libraryID: String(library.id),
      collectionKeys,
      ...cslJsonFromItem(item),
    }
  })
}


function cslJsonFromItem(item: Item) {

  // The ids generated by Web Zotero are pretty rough, so just strip them
  // and allow the caller to generate an id if they'd like
  const csljson: CSL = { ...item.csljson, id: "" };
 
  const dataExtra = item.data["extra"];
  if (typeof(dataExtra) === "string") {
    resolveCslJsonCheaterKeyForValue(csljson, dataExtra);
  }
  const cslNote = csljson["note"];
  if (typeof(cslNote) === "string") {
    resolveCslJsonCheaterKeyForValue(csljson, cslNote);
  }

  return csljson;
}


function handleZoteroError(error: unknown) : ZoteroResult {
  if (error instanceof ZoteroAuthorizationError || error instanceof ZoteroObjectNotFoundError) {
    return {
      status: 'notfound',
      message: null,
      warning: '',
      error: error.message,
      unauthorized: error instanceof ZoteroAuthorizationError,
    }
  } else if (error instanceof ZoteroServiceUnavailable) {
    return {
      status: "nohost",
      message: null,
      warning: "",
      error: error.message
    }
  } else {
    return {
      status: "error",
      message: null,
      warning: '',
      error: error instanceof Error ? error.message : JSON.stringify(error),
    }
  }
}