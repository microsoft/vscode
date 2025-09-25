/*
 * browser.ts
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

import ClientBrowser from "jayson/lib/client/browser";

import { jsonRpcError, JsonRpcRequestTransport } from "../../../core/src/jsonrpc.js";

export function jsonRpcBrowserRequestTransport(url: string) : JsonRpcRequestTransport {

  const createClient = (method: string) => {
    return new ClientBrowser(
      (
        request: string,
        callback: (err?: Error | null, response?: string) => void
      ) => {
        const options = {
          method: "POST",
          body: request,
          headers: {
            "Content-Type": "application/json",
          },
        };
        fetch(`${url}/${method}`, options)
          .then(function (res) {
            if (res.ok) {
              return res.text();
            } else {
              return Promise.reject(new Error(res.status + " error"));
            }
          })
          .then(function (text) {
            callback(null, text);
          })
          .catch(function (err) {
            callback(err);
          });
      },
      {}
    )
  }


  return  (method: string, params: unknown[] | undefined) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise<any>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createClient(method).request(method, params, (err: any, result: any) => {
        if (err) {
          if (typeof(err) === "object" && err.message) {
            reject(jsonRpcError(err.message, err.data, err.code));
          } else {
            reject(jsonRpcError(String(err)));
          }
        } else if (result?.error) {
          reject(result?.error);
        } else if (result) { 
          resolve(result.result);
        } else {
          reject(jsonRpcError("Unknown error"));
        }
      });
    });
  };
}