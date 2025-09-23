/*
 * preview-errors.ts
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

import * as path from "path";
import * as fs from "fs";

import { normalizeNewlines } from "core";

export type ErrorLocation = {
  lineBegin: number;
  lineEnd: number;
  file: string;
};

export function luaErrorLocation(
  output: string,
  previewTarget: string,
  _previewDir: string
) {
  const luaPattern = /Error running filter ([^:]+):\r?\n[^:]+:(\d+):/;
  const luaMatch = output.match(luaPattern);
  if (luaMatch) {
    console.log(luaMatch);
    // if the path is relative then resolve it visa vi the previewTarget
    const file = path.isAbsolute(luaMatch[1])
      ? luaMatch[1]
      : path.normalize(path.join(path.dirname(previewTarget), luaMatch[1]));
    return {
      lineBegin: parseInt(luaMatch[2]),
      lineEnd: parseInt(luaMatch[2]),
      file,
    };
  }

  return null;
}

export function knitrErrorLocation(
  output: string,
  previewTarget: string,
  _previewDir: string
): ErrorLocation | null {
  const knitrPattern = /Quitting from lines (\d+)-(\d+) \(([^)]+)\)/;
  const knitrMatch = output.match(knitrPattern);
  if (knitrMatch) {
    return {
      lineBegin: parseInt(knitrMatch[1]),
      lineEnd: parseInt(knitrMatch[2]),
      file: path.join(path.dirname(previewTarget), knitrMatch[3]),
    };
  }
  return null;
}

export function jupyterErrorLocation(
  output: string,
  previewTarget: string,
  _previewDir: string
): ErrorLocation | null {
  const jupyterPattern =
    /An error occurred while executing the following cell:\s+(-{3,})\s+([\S\s]+?)\r?\n(\1)[\S\s]+line (\d+)\)/;
  const jupyterMatch = output.match(jupyterPattern);
  if (jupyterMatch) {
    // read target file and searh for the match (normalized)
    if (fs.statSync(previewTarget).isFile()) {
      const cellSrc = jupyterMatch[2];
      const previewSrc = normalizeNewlines(
        fs.readFileSync(previewTarget, {
          encoding: "utf-8",
        })
      );
      const cellLoc = previewSrc.indexOf(cellSrc);
      if (cellLoc !== -1) {
        const lineBegin =
          previewSrc.slice(0, cellLoc).split("\n").length +
          parseInt(jupyterMatch[4]) -
          1;
        return {
          lineBegin,
          lineEnd: lineBegin,
          file: previewTarget,
        };
      }
    }
  }
  return null;
}

export function yamlErrorLocation(
  output: string,
  _previewTarget: string,
  previewDir: string
): ErrorLocation | null {
  const yamlPattern =
    /\(ERROR\) Validation of YAML.*\n\(ERROR\) In file (.*?)\n\(line (\d+)/;
  const yamlMatch = output.match(yamlPattern);
  if (yamlMatch) {
    const lineBegin = parseInt(yamlMatch[2]);
    return {
      lineBegin,
      lineEnd: lineBegin,
      file: path.join(previewDir, yamlMatch[1]),
    };
  }
  return null;
}
