/*
 * prefs.ts
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
import { defaultPrefs, Prefs, PrefsServer } from "editor-types";

import { EditorUIStore, rtkFakeBaseQuery, rtkHandleQuery } from "editor-ui";

const kPrefsTag = "Prefs";

// allow external initialization of the server endpoint
let prefsServer: PrefsServer;
export function initPrefsApi(server: PrefsServer) {
  prefsServer = server;
}

export async function updatePrefsApi(store: EditorUIStore, prefs: Prefs) {
  await store.dispatch(prefsApi.util.upsertQueryData("getPrefs", undefined, prefs))
}

export function readPrefsApi(store: EditorUIStore) {
  const result = prefsApi.endpoints.getPrefs.select()(store.getState());
  const { data: prefs = defaultPrefs() } = result;
  return prefs;
}


export const prefsApi = createApi({
  reducerPath: "prefs",
  baseQuery: rtkFakeBaseQuery<JsonRpcError>(),
  tagTypes: [kPrefsTag],

  endpoints(build) {
    return {
      getPrefs: build.query<Prefs,void>({
        queryFn: () => rtkHandleQuery(prefsServer.getPrefs()),
        providesTags: [kPrefsTag]
      }),
      setPrefs: build.mutation<void,Prefs>({
        queryFn: (prefs: Prefs) => rtkHandleQuery(prefsServer.setPrefs(prefs)),
        // optmistic update 
        async onQueryStarted(prefs, { dispatch, queryFulfilled }) {
          dispatch(
            prefsApi.util.updateQueryData("getPrefs", undefined, draft => {
              Object.assign(draft, prefs);
            })
          )
          try {
            await queryFulfilled
          } catch (error) {
            // refetch on failure
            dispatch(prefsApi.util.invalidateTags([kPrefsTag]));
          }
        }
      })
    };
  },
});

export const {
  useGetPrefsQuery,
  useSetPrefsMutation
} = prefsApi;