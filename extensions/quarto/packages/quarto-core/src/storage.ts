/*
 * storage.ts
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


import * as path from "node:path";
import * as fs from "node:fs";

import * as uuid from "uuid";

import { quartoCacheDir } from './appdirs';

export function fileCrossrefIndexStorage(file: string) {
  return fileScratchStorage(file, "xref.json");
}

export function filePrefsStorage(file: string) {
  return fileScratchStorage(file, "prefs.json");
}


export function fileScratchStorage(file: string, scope: string, dir?: boolean) {
  // determine uuid for file scratch storage
  file = path.normalize(file);
  const index = readFileScratchStorageIndex();
  let fileStorage = index[file];
  if (!fileStorage) {
    fileStorage = uuid.v4();
    index[file] = fileStorage;
    writeFileScratchStorageIndex(index);
  }

  // ensure the dir exists
  const scratchStorageDir = fileScratchStoragePath(fileStorage);
  if (!fs.existsSync(scratchStorageDir)) {
    fs.mkdirSync(scratchStorageDir);
  }

  // return the path for the scope (creating dir as required)
  const scopedScratchStorage = path.join(scratchStorageDir, scope);
  if (dir) {
    if (!fs.existsSync(scopedScratchStorage)) {
      fs.mkdirSync(scopedScratchStorage);
    }
  }
  return scopedScratchStorage;
}

function readFileScratchStorageIndex(): Record<string, string> {
  const index = fileScratchStorageIndexPath();
  if (fs.existsSync(index)) {
    return JSON.parse(fs.readFileSync(index, { encoding: "utf-8" }));
  }
  return {};
}

function writeFileScratchStorageIndex(index: Record<string, string>) {
  fs.writeFileSync(
    fileScratchStorageIndexPath(),
    JSON.stringify(index, undefined, 2),
    { encoding: "utf-8" }
  );
}

const fileScratchStorageIndexPath = () => fileScratchStoragePath("INDEX");

function fileScratchStoragePath(file?: string) {
  const storagePath = path.join(quartoCacheDir(), "file-storage");
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath);
  }
  return file ? path.join(storagePath, file) : storagePath;
}
