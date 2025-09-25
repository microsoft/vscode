/*
 * doi.ts
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
import { DOIResult, DOIServer, kDoiFetchCsl } from "../../../editor-types/src/index.js"

import { handleResponseWithStatus } from "./response.js";


const kDOIHost = "https://doi.org";
const kCSLJsonFormat = "application/vnd.citationstyles.csl+json";

export function doiServer() : DOIServer {
  return {
    async fetchCSL(doi: string) : Promise<DOIResult> {
      const url = `${kDOIHost}/${doi}`;
      return handleResponseWithStatus(
        () => fetch(url, { headers: { Accept: kCSLJsonFormat } })
      );
    }
  }
}

export function doiServerMethods() : Record<string, JsonRpcServerMethod> {
  const server = doiServer();
  const methods: Record<string, JsonRpcServerMethod> = {
    [kDoiFetchCsl]: args => server.fetchCSL(args[0])
  };
  return methods;
}


