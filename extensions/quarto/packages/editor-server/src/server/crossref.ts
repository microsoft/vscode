/*
 * crossref.ts
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

import { JsonRpcServerMethod } from "core";
import { CrossrefMessage, CrossrefServer, CrossrefWork, kCrossrefWorks, kStatusOK } from "editor-types";

import { handleResponseWithStatus } from "./response";

const kCrossrefApiHost = "https://api.crossref.org";
const kCrossrefWorksApi = "works";

export interface CrossrefServerOptions {
  userAgent: string;
  email: string;
}

export function crossrefServer(options: CrossrefServerOptions) : CrossrefServer {
  return {
    async works(query: string) : Promise<CrossrefMessage<CrossrefWork>> {
      const userAgent = `${options.userAgent}; ${options.userAgent} Crossref Cite (mailto: ${options.email})`;
      const url = `${kCrossrefApiHost}/${kCrossrefWorksApi}?` + new URLSearchParams({ query });
      const worksQuery = () => fetch(url, {
        headers: {
          "User-Agent": userAgent
        }
      });
      const result = await handleResponseWithStatus<CrossrefApiResponse>(worksQuery);
      if (result.status === kStatusOK) { 
        if (result.message?.status === "ok") {
          return result.message.message!;
        // non-OK status
        } else {
          throw new Error(`Error status from Crossref API: ${result.message?.status}`);
        }
       // non-OK status
      } else {
        throw new Error(`Crossref API Error: ${result.error}`);
      }
    }
  };
}

export function crossrefServerMethods(options: CrossrefServerOptions) : Record<string, JsonRpcServerMethod> {
  const server = crossrefServer(options);
  const methods: Record<string, JsonRpcServerMethod> = {
    [kCrossrefWorks]: args => server.works(args[0])
  };
  return methods;
}

interface CrossrefApiResponse {
  status: string;
  message?: CrossrefMessage<CrossrefWork>;
}
