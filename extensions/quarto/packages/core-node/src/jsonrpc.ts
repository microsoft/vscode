/*
 * jsonrpc.ts
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

import jayson, { JSONRPCCallbackTypePlain, RequestParamsLike } from 'jayson'

import { asJsonRpcError, JsonRpcServerMethod } from '../../core/src/jsonrpc.js';

export function jaysonServerMethods(methods: Record<string,JsonRpcServerMethod>) {
  const jaysonMethods: Record<string,jayson.Method> = {};
  Object.keys(methods).forEach(method => {
    jaysonMethods[method] = jsonRpcMethod(methods[method]);
  });
  return jaysonMethods;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function jsonRpcMethod(method: (params: any) => Promise<unknown>) : jayson.Method {
  return jayson.Method({
    handler: (args: RequestParamsLike, done: JSONRPCCallbackTypePlain) => {
      method(args)
        .then((result: unknown) => {
          done(null, result)
        })
        .catch(error => {
          done(asJsonRpcError(error));
        });
    }
  })
}

