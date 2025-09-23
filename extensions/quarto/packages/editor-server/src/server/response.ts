/*
 * response.ts
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

import { kStatusError, kStatusNoHost, kStatusNotFound, kStatusOK } from "editor-types";

// datacite, doi, and pubmed all share a common response type pattern that includes
// status and optional message and error payloads -- this function provides a common
// implementation for handling these requests

export interface ResponseWithStatus<T> {
  status: typeof kStatusOK | typeof kStatusNotFound | typeof kStatusNoHost | typeof kStatusError;
  message: T | null;
  error: string;
}

export async function handleResponseWithStatus<T>(request: () => Promise<Response>) : Promise<ResponseWithStatus<T>> {
  try {
    const response = await request();
    if (response.ok) {
      return {
        status: kStatusOK,
        message: await response.json() as T,
        error: ''
      }
    } else if (response.status === 404) {
      return {
        status: kStatusNotFound,
        message: null,
        error: ''
      }
    } else {
      return {
        status: kStatusError,
        message: null,
        error: `${response.status} Error: ${response.statusText}`
      }
    }
  } catch(error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return {
      status: message.includes("ENOTFOUND") ? kStatusNoHost : kStatusError,
      message: null,
      error: message
    }
  }
}


