/*
 * source.ts
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

import path from "node:path";

import { JsonRpcServerMethod, lines } from "core";
import { kSourceGetSourcePosLocations, SourcePosLocation, SourcePosBlock, SourceServer } from "editor-types";

import { PandocServerOptions, runPandoc } from "../core/pandoc";


export function sourceServer(pandoc: PandocServerOptions) : SourceServer {
  return {
    async getSourcePosLocations(markdown: string) : Promise<SourcePosLocation[]> {
      const locations = await runPandoc(
        pandoc,
        ["--from", "commonmark_x+sourcepos",
         "--to", "plain",
         "--lua-filter", path.join(pandoc.resourcesDir, 'sourcepos.lua'),
        ],
        markdown
      );
      const locationLines = lines(locations).filter(lines => lines.length > 0);
      return locationLines.map(line => {
        const [block,pos] = line.split(":");
        return {
          block: block as SourcePosBlock,
          pos: parseInt(pos)
        }
      });
    }
  };
}

export function sourceServerMethods(pandoc: PandocServerOptions) : Record<string, JsonRpcServerMethod> {
  const server = sourceServer(pandoc);
  const methods: Record<string, JsonRpcServerMethod> = {
    [kSourceGetSourcePosLocations]: args => server.getSourcePosLocations(args[0]),
  }
  return methods;
}

