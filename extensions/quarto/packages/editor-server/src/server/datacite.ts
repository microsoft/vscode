/*
 * datacite.ts
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

import fetch from "cross-fetch";

import { JsonRpcServerMethod } from "../../../core/src/jsonrpc.js";

import { DataCiteRecord, DataCiteResult, DataCiteServer, kDataCiteSearch, kStatusError, kStatusOK } from "../../../editor-types/src/index.js";

import { handleResponseWithStatus } from "./response.js";

const kDataCiteApiHost = "https://api.datacite.org";

export function dataCiteServer() : DataCiteServer {
  return {
    async search(query: string) : Promise<DataCiteResult> {
      const url = `${kDataCiteApiHost}/dois?` + new URLSearchParams({ query });
      const result = await handleResponseWithStatus(() => fetch(url))
      if (result.status === kStatusOK) {
        if (typeof(result.message) === "object") {
          const message = result.message as Record<string,unknown>;
          // successful query
          if (message.data) {
            if (Array.isArray(message.data)) {
              return {
                status: kStatusOK,
                message: dataCiteRecords(message.data),
                error: ""
              }
            } else {
              return unexpectedDataFormat(message);
            }
          // explicit error(s)
          } else if (message.errors) {
            const errors = message.errors as Array<{ code: string, title: string }>;
            const error = errors[0] || { code: "-1", title: "(Unknown Error)"};
            return {
              status: kStatusError,
              message: null,
              error: `DataCite API Error: ${error.code} - ${error.title}`
            }
          // response without 'data' or 'errors'
          } else {
            return unexpectedDataFormat(message);
          }
        // non-object response
        } else {
          return unexpectedDataFormat(result.message);
        }
      // non-OK status
      } else {
        return { ...result, message: null };
      }
    }
  }
}

export function dataCiteServerMethods() : Record<string, JsonRpcServerMethod> {
  const server = dataCiteServer();
  const methods: Record<string, JsonRpcServerMethod> = {
    [kDataCiteSearch]: args => server.search(args[0])
  }
  return methods;
}


// see https://support.datacite.org/docs/api-queries
interface DataCiteApiRecord {
  id: string;
  attributes?: {
    doi?: string;
    titles?: Array<{ title: string }>;
    publisher?: string;
    publicationYear?: number;
    creators?: Array<{ name?: string, givenName?: string, familyName?: string }>;
    types?: {
      citeproc?: string;
    }
  }
}

function dataCiteRecords(data: Array<DataCiteApiRecord>) : DataCiteRecord[] {

  const asDataCiteRecord = (x: DataCiteApiRecord) : DataCiteRecord | null => {
    const attributes = x.attributes;
    if (!attributes?.doi) {
      return null;
    }
    const record: DataCiteRecord = { 
      doi: attributes.doi,
      title: attributes.titles?.[0]?.title,
      publisher: attributes.publisher,
      publicationYear: attributes.publicationYear,
      creators: attributes.creators?.map(creator => {
        return {
          fullName: creator.name || "",
          givenName: creator.givenName,
          familyName: creator.familyName
        }
      }).filter(creator => !!creator.fullName),
      type: attributes.types?.citeproc
    };
    return record;
  }
  return data.map(asDataCiteRecord)
    .filter(record => record !== null) as DataCiteRecord[];
}

function unexpectedDataFormat(response: unknown) {
  return {
    status: kStatusError,
    message: null,
    error: "Unexpected data format returned by DataCite API: " 
           + JSON.stringify(response)
  } as DataCiteResult
}

