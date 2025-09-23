/*
 * db.ts
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

import { Database } from "node-sqlite3-wasm";

import { quartoCacheDir } from "quarto-core";
import { md5Hash } from "core-node";
import { zoteroTrace } from "../trace";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function withZoteroDb<T>(dataDir: string, f: (db: Database) => Promise<T>) {

  // get path to actual sqlite db
  const dbFile = path.join(dataDir, "zotero.sqlite");

  // get path to copy of file we will use for queries
  const dbCopyFile = zoteroSqliteCopyPath(dataDir);

  // do the copy if we need to
  const dbFileStat = fs.statSync(dbFile);
  const dbCopyFileMtime = fs.existsSync(dbCopyFile) ? fs.statSync(dbCopyFile).mtime : 0;
  const databaseIsStale = dbCopyFileMtime < dbFileStat.mtime;
  if (databaseIsStale) {
    zoteroTrace(`Copying ${dbFile}`);
    fs.copyFileSync(dbFile, dbCopyFile);
    fs.utimesSync(dbCopyFile, dbFileStat.atime, dbFileStat.mtime);
  }

   // create connection
   let db : Database | undefined;
   try {
     // attempt open
     db = new Database(dbCopyFile, { fileMustExist: true });
    // try a simple query to validate the connection
     try {
      db.exec("SELECT * FROM libraries");
    } catch(error) {
      const closeDb = db;
      db = undefined;
      closeDb.close();
      console.error(error);
      throw error;
    }
    
    // execute the function
    return f(db);

  } finally {
    // if we have a db then close it
    if (db) {
      try {
        db.close();
      } catch (error) {
        console.log(error);
      }
    } else {
      // no db means we couldn't open it, remove it
      try {
        fs.rmSync(dbCopyFile);
      } catch(error) {
        console.error(error);
      }
    }
  }

}

function zoteroSqliteDir() {
  const sqliteDir = path.join(quartoCacheDir("zotero"), "sqlite");
  if (!fs.existsSync(sqliteDir)) {
    fs.mkdirSync(sqliteDir, { recursive: true });
  }
  return sqliteDir;
}

function zoteroSqliteCopyPath(dataDir: string) {
  const sqliteFile = `${md5Hash(dataDir)}.sqlite`;
  return path.join(zoteroSqliteDir(), sqliteFile);
  
}



