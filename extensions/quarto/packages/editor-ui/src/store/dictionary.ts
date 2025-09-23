/*
 * dictionary.ts
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
 */

import { createApi } from "@reduxjs/toolkit/query/react";
import { JsonRpcError } from "core";
import { Dictionary, DictionaryInfo, DictionaryServer, IgnoredWord } from "editor";

import { rtkFakeBaseQuery, rtkHandleQuery } from "./rtk";

const kUserDictionaryTag = "UserDictionary";
const kIgnoredWordsTag = "IgnoredWords";

// allow external initialization of the server endpoint
let dictionaryServer: DictionaryServer;
export function initDictionaryApi(server: DictionaryServer) {
  dictionaryServer = server;
}

// define api
export const dictionaryApi = createApi({
  reducerPath: "dictionary",
  baseQuery: rtkFakeBaseQuery<JsonRpcError>(),
  tagTypes: [kUserDictionaryTag, kIgnoredWordsTag],
  endpoints(build) {
    return {
      getAvailableDictionaries: build.query<DictionaryInfo[],void>({
        queryFn: () => rtkHandleQuery(dictionaryServer.availableDictionaries())
      }),
      getDictionary: build.query<Dictionary,string>({
        queryFn: (locale: string) => rtkHandleQuery(dictionaryServer.getDictionary(locale))
      }),
      getUserDictionary: build.query<string[],void>({
        queryFn: () => rtkHandleQuery(dictionaryServer.getUserDictionary()),
        providesTags: [kUserDictionaryTag]
      }),
      addToUserDictionary: build.mutation<string[],string>({
        queryFn: (word: string) => rtkHandleQuery(dictionaryServer.addToUserDictionary(word)),
        invalidatesTags: [kUserDictionaryTag]
      }),
      ignoredWords: build.query<string[],string>({
        queryFn: (context: string) => rtkHandleQuery(dictionaryServer.getIgnoredWords(context)),
        providesTags: (_result, _error, arg) => [{ type: kIgnoredWordsTag, id: arg }]
      }),
      ignoreWord: build.mutation<string[], IgnoredWord>({
        queryFn: (word: IgnoredWord) => rtkHandleQuery(dictionaryServer.ignoreWord(word)),
        invalidatesTags: (_result, _error, arg) =>  [{ type: kIgnoredWordsTag, id: arg.context }]
      }),
      unignoreWord: build.mutation<string[], IgnoredWord>({
        queryFn: (word: IgnoredWord) => rtkHandleQuery(dictionaryServer.unignoreWord(word)),
        invalidatesTags: (_result, _error, arg) =>  [{ type: kIgnoredWordsTag, id: arg.context }]
      }) 
    };
  },
});


// convenience methods
export const {
  useGetAvailableDictionariesQuery,
  useGetDictionaryQuery,
  useGetUserDictionaryQuery,
  useAddToUserDictionaryMutation,
  useIgnoredWordsQuery,
  useIgnoreWordMutation,
  useUnignoreWordMutation
} = dictionaryApi;
