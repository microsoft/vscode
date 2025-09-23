/*
 * exec.ts
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

import * as child_process from "node:child_process";

const DEFAULT_MAX_BUFFER = 1000 * 1000 * 100

// helper to run a program and capture its output
export function execProgram(
  program: string,
  args: string[],
  options?: child_process.ExecFileSyncOptions
) {
  return (
    child_process.execFileSync(program, args, {
      encoding: "utf-8",
      maxBuffer: DEFAULT_MAX_BUFFER,
      ...options,
    }) as unknown as string
  ).trim();
}
