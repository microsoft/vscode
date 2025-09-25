/*
 * git.ts
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

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { lines } from "../../core/src/index.js";
import { execProgram } from "./exec.js";

export function ensureGitignore(
  dir: string,
  entries: string[]
): boolean {
  // if .gitignore exists, then ensure it has the requisite entries
  const gitignorePath = path.join(dir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignore = lines(
      fs.readFileSync(gitignorePath, {
        encoding: "utf-8",
      })
    ).map((line) => line.trim());
    const requiredEntries: string[] = [];
    for (const requiredEntry of entries) {
      if (!gitignore.includes(requiredEntry)) {
        requiredEntries.push(requiredEntry);
      }
    }
    if (requiredEntries.length > 0) {
      writeGitignore(dir, gitignore.concat(requiredEntries));
      return true;
    } else {
      return false;
    }
  } else {
    // if it doesn't exist then auto-create if we are in a git project or we had the force flag
    try {
      const result = execProgram("git", ["rev-parse"], {
        cwd: dir,
      });
      if (result !== undefined) {
        createGitignore(dir, entries);
        return true;
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }
}

export function createGitignore(dir: string, entries: string[]) {
  writeGitignore(dir, entries);
}

function writeGitignore(dir: string, lines: string[]) {
  const lineEnding = os.platform() === "win32" ? "\r\n" : "\n";
  fs.writeFileSync(
    path.join(dir, ".gitignore"),
    lines.join(lineEnding) + lineEnding,
    { encoding: "utf-8" }
  );
}
