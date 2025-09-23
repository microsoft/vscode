/*
 * util.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 *
 *
 */

import { QueryReturnValue } from "@reduxjs/toolkit/dist/query/baseQueryTypes";
import { BaseQueryFn } from "@reduxjs/toolkit/dist/query/react";
import { JsonRpcError } from "core";

// workaround for type errors when using built-in fakeBaseQuery:
// https://github.com/reduxjs/redux-toolkit/issues/2314
export function rtkFakeBaseQuery<ErrorType>(): BaseQueryFn<
  void,
  never,
  ErrorType,
  unknown
> {
  return function () {
    throw new Error(
      "When using `fakeBaseQuery`, all queries & mutations must use the `queryFn` definition syntax."
    );
  };
}

export async function rtkHandleQuery<T>(promise: Promise<T>) : Promise<QueryReturnValue<T,JsonRpcError>> {
  return promise
    .then((value: T) => {
      return { data: value };
    })
    .catch((error: JsonRpcError) => {
      return { error };
    })
}
