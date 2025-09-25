/*
 * environment.ts
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

import { JsonRpcServerMethod } from "../../../core/src/jsonrpc.js";
import { EnvironmentServer, kEnvironmentGetRPackageCitations, kEnvironmentGetRPackageState, RPackageCitation, RPackageState } from "../../../editor-types/src/index.js";

export function environmentServer() : EnvironmentServer {
  return {
    getRPackageState() : Promise<RPackageState> {
      throw new Error("not implemented");
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getRPackageCitations(_pkgName: string) : Promise<RPackageCitation[]> {
      throw new Error("not implemented");
    }
  };
}

export function environmentServerMethods() : Record<string, JsonRpcServerMethod> {
  const server = environmentServer();
  const methods: Record<string, JsonRpcServerMethod> = {
    [kEnvironmentGetRPackageState]: () => server.getRPackageState(),
    [kEnvironmentGetRPackageCitations]: args => server.getRPackageCitations(args[0])
  }
  return methods;
}

