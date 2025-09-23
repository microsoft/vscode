/*
 * server.ts
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

import { CrossrefServer } from "./crossref";
import { DataCiteServer } from "./datacite";
import { DOIServer } from "./doi";
import { EnvironmentServer } from "./environment";
import { PandocServer } from "./pandoc";
import { PubMedServer } from "./pubmed";
import { XRefServer } from "./xref";
import { ZoteroServer } from "./zotero";

export const kStatusOK = "ok";
export const kStatusNotFound = "notfound";
export const kStatusNoHost = "nohost";
export const kStatusError = "error";

export interface EditorServer {
  readonly pandoc: PandocServer;
  readonly doi: DOIServer;
  readonly crossref: CrossrefServer;
  readonly datacite: DataCiteServer;
  readonly pubmed: PubMedServer;
  readonly xref: XRefServer;
  readonly zotero?: ZoteroServer;
  readonly environment?: EnvironmentServer;
}
