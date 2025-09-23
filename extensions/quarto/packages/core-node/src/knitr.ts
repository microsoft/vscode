/*
 * knitr.ts
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

import fs from "node:fs"
import path from "node:path"


export function isKnitrSpinScript(file: string, contents?: string) {
  const ext = path.extname(file).toLowerCase();
  if (ext == ".r") {
    contents = contents || fs.readFileSync(file, { encoding: "utf-8" });
    // Consider a .R script that can be spinned if it contains a YAML header inside a special `#'` comment
    return /^\s*#'\s*---[\s\S]+?\s*#'\s*---/.test(contents);
  } else {
    return false;
  }  
}
