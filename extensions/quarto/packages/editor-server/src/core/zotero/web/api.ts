/*
 * api.ts
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

import { sleep } from "../../../../../core/src/wait.js";
import fetch from "cross-fetch";

import { CSL } from "../../../../../editor-types/src/index.js";
import { zoteroTraceProgress } from "./trace.js";
import { SyncProgress } from "./types.js";

export interface Library {
  type: "user" | "group";
  id: number;
  group?: Group;
}

export interface User {
  key: string;
  userID: number;
  username: string;
  displayName: string;
  access: {
    user: {
      library?: boolean;
      files?: boolean;
      notes?: boolean;
      write?: boolean;
    },
    groups: { [key: string]: GroupAccess }
  }
}

export interface GroupAccess {
  library: boolean;
  write: boolean;
}

export interface Group {
  id: number;
  version: number;
  name: string;
  owner: number;
  type: string;
  description: string;
  url: string;
  libraryEditing: string;
  libraryReading: string;
  fileEditing: string;
  members: number[];
}

export interface Collection {
  key: string;
  version: number;
  name: string;
  parentCollection: boolean;
  relations: Record<string,unknown>;
}

export interface Item {
  key: string;
  version: number;
  csljson: CSL;
  data: Record<string,unknown>;
}

export interface Deleted {
  collections: string[];
  searches: string[];
  items: string[];
  tags: string[];
}

export type ObjectVersions = { [objectId: string]: number };

export type VersionedResponse<T> = { data: T, version: number | null } | null;

export class ZoteroAuthorizationError extends Error {
  constructor(url: string) {
    super(`Unauthorized: ${plainUrl(url)}`);
  }
}

export class ZoteroObjectNotFoundError extends Error {
  constructor(url: string) {
    super(`Not found: ${plainUrl(url)}`);
  }
}

export class ZoteroServiceUnavailable extends Error {
  constructor(url: string) {
    super(`Service unavailable: ${plainUrl(url)}`);
  }
}



export interface ZoteroApi {
  
  readonly user: User;

  groupVersions(userID: number) : Promise<ObjectVersions>;
  group(groupID: number, since: number) : Promise<VersionedResponse<Group>>;

  collectionVersions(library: Library, since: number) : Promise<VersionedResponse<ObjectVersions>>;
  collections(library: Library, keys: string[]) : Promise<Collection[]>;
 
  itemVersions(library: Library, since: number) : Promise<VersionedResponse<ObjectVersions>>;
  items(library: Library, keys: string[]) : Promise<Item[]>;

  deleted(library: Library, since: number) : Promise<VersionedResponse<Deleted>>;
}

export async function zoteroApi(key: string, progress?: SyncProgress) : Promise<ZoteroApi> {

  progress = progress || zoteroTraceProgress();

  const user = await zoteroRequest<User>(key, "/keys/current", progress);

  return {
    user,

    groupVersions: (userID: number) => {
      return zoteroRequest<ObjectVersions>(key, `/users/${userID}/groups?format=versions`, progress!);
    },

    group: (groupID: number, since: number) => {
      return zoteroVersionedRequest<Group>(key, `/groups/${groupID}?since=${since}`, since, progress!, x => x.data);
    },

    collectionVersions: (library: Library, since: number) => {
      const prefix = objectPrefix(library);
      return zoteroVersionedRequest<ObjectVersions>(key, `${prefix}/collections?since=${since}&format=versions`, since, progress!);
    },

    collections: async (library: Library, keys: string[]) => {
      return (await zoteroKeyedItems<{ data: Collection }>(key, library, keys, pageKeys => {
        return `/collections?collectionKey=${pageKeys.join(',')}`;
      }, progress!)).map(collection => {
        return collection.data;
      });
    },

    itemVersions: (library: Library, since: number) => {
      const prefix = objectPrefix(library);
      const query = `/items?since=${since}&itemType=-attachment&format=versions&includeTrashed=1`;
      return zoteroVersionedRequest<ObjectVersions>(key, `${prefix}${query}`, since, progress!);
    },

    items: async (library: Library, keys: string[]) => {
      return zoteroKeyedItems<Item>(key, library, keys, (pageKeys => {
        return  `/items?itemKey=${pageKeys.join(',')}&format=json&include=csljson,data&includeTrashed=1`
      }), progress!);
    },

    deleted: (library: Library, since: number) => {
      const prefix = objectPrefix(library);
      const query = `/deleted?since=${since}`;
      return zoteroVersionedRequest<Deleted>(key, `${prefix}${query}`, since, progress!);
    }
  }
}

export async function zoteroValidateApiKey(key: string) {
  try {
    await zoteroApi(key);
    return true;
  } catch(error) {
    if (!(error instanceof ZoteroObjectNotFoundError)) {
      console.error(error);
    }
    return false;
  }
}

const objectPrefix = (library: Library) => {
  return `/${library.type}s/${library.id}`;
};

const zoteroKeyedItems = async<T>(
  key: string, 
  library: Library, 
  keys: string[], 
  query: (pageKeys: string[]) => string,
  progress: SyncProgress ) => {
  const kPageSize = 50;
  let retreived = 0;
  const results: T[] = [];
  const prefix = objectPrefix(library);
  while (retreived < keys.length) {
    const pageKeys = keys.slice(retreived, retreived + kPageSize);
    progress.report(`Syncing items for library (${library.type}-${library.id})`);
    results.push(...(await zoteroRequest<T[]>(key, `${prefix}${query(pageKeys)}`, progress)));
    retreived += pageKeys.length;
  }
  return results;
};


interface ZoteroResponse<T> {
  status: number;
  statusText: string;
  headers: Headers | null;
  message: T | null;
}

// normal request handler
const zoteroRequest = async <T>(key: string, path: string, progress: SyncProgress) : Promise<T> => {
  const response = await zoteroFetch<T>(key, path, progress);
  if (response.status === 200 && response.message) {
    return response.message;
  } else {
    throw handleErrorResponse(response, path);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zoteroVersionedRequest = async <T>(key: string, path: string, since: number, progress: SyncProgress, extract?: (x: any) => T) : Promise<VersionedResponse<T>> => {
  const response = await zoteroFetch<T>(key, path, progress, { ["If-Modified-Since-Version"]: String(since) }, extract);
  if (response.status === 200 && response.message) {
    const version = Number(response.headers?.get("Last-Modified-Version"));
    return {
      data: response.message,
      version: version || null 
    }
  } else if (response.status === 304) {
    return null;
  } else {
    throw handleErrorResponse(response, path);
  }
}

const zoteroFetch = async <T>(
  key: string, 
  path: string,
  progress: SyncProgress, 
  headers?: Record<string,string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extract?: (x: any) => T
) : Promise<ZoteroResponse<T>> => {
  headers = headers || {};
  extract = extract || (x => x as T);
  try {
    const kMaxWait = 5 * 60;
    let totalWait = 0;
    let backoff = 0;
    let response: Response;
    do {
      // make request
      const url = `https://api.zotero.org${path}`;
      response = await fetch(url, {
        headers: {
          "Zotero-API-Version": "3",
          "Zotero-API-Key": key,
          ...headers
        }
      });
      progress.log(`${url} (${response.status})`);

      // handle backoff headers
      // https://www.zotero.org/support/dev/web_api/v3/basics#rate_limiting
      const retryAfter = response.status === 429 ? Number(response.headers.get("Retry-After") || 0) : 0;
      backoff = Number(response.headers.get("Backoff") || 0) || retryAfter;
      if (backoff) {
        await sleep(backoff * 1000);
        totalWait += backoff;
      }  
    } while(backoff && (totalWait <= kMaxWait));

    // timed out
    if (totalWait > kMaxWait) {
      return {
        status: 503,
        statusText: "Service backoff time exceeded maximum",
        headers: null,
        message: null
      }
    }

    // return response
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      message: response.ok ? extract(await response.json())  : null,
    }

  } catch(error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return {
      status: message.includes("ENOTFOUND") ? 503 : 500,
      statusText: `Error: ${message}`,
      headers: null,
      message: null,
    }
  }
}

function handleErrorResponse(response: ZoteroResponse<unknown>, path: string) {
  path = plainUrl(path);
  if (response.status === 403) {
    return new ZoteroAuthorizationError(path);
  } else if (response.status === 404) {
    return new ZoteroObjectNotFoundError(path);
  } else if (response.status === 503) {
    return new ZoteroServiceUnavailable(path);
  } else {
    return new Error(response.statusText || "Unknown error");
  }
}

function plainUrl(url: string) {
  return url.split('?')[0];
}
