/*
 * datadir.ts
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

import { isMac, isWindows } from "../../../../../core-node/src/platform.js";
import { lines } from "../../../../../core/src/index.js";


export function zoteroDataDir(dataDirConfig?: string) {

  // attempt to use configured dir
  dataDirConfig = dataDirConfig?.replace("~/", userHomeDir());
  if (dataDirConfig) {
    if (fs.existsSync(dataDirConfig)) {
      return dataDirConfig;
    } else {
      console.log(`WARNING: Configured Zotero data directory '${dataDirConfig} not found.`);
    }
  }

  // otherwise detect
  return detectDataDir();
}



function userHomeDir() {
  if (isWindows()) {
    return process.env.USERPROFILE!;
  } else {
    return process.env.HOME!;
  }
}

// https://www.zotero.org/support/kb/profile_directory
function zoteroProfilesDir() {
  const homeDir = userHomeDir();
  let profilesDir: string | undefined;
  if (isWindows()) {
    profilesDir = "AppData\\Roaming\\Zotero\\Zotero\\Profiles";
  } else if (isMac()) {
    profilesDir = "Library/Application Support/Zotero/Profiles";
  } else {
    profilesDir = ".zotero/zotero";
  }
  return path.join(homeDir, profilesDir);
}

// https://www.zotero.org/support/zotero_data
function zoteroDefaultDataDir() {
  const homeDir = userHomeDir();
  return path.join(homeDir, "Zotero");
}

function platformProfileDir(profilePath: string) {
  if (isWindows() || isMac()) {
    return path.dirname(profilePath);
  } else {
    return profilePath;
  }
}

function defaultProfileDir(): string | undefined {
  const profilesDir = zoteroProfilesDir();
  const profileIni = path.join(platformProfileDir(profilesDir), "profiles.ini");
  if (fs.existsSync(profileIni)) {
    const kRegex = /^\[.*?\]$/;
    const kValueRegex = /^(.*)=(.*)$/;
    const profileLines = lines(fs.readFileSync(profileIni, { encoding: "utf8" }));
    
    let sectionPath = "";
    let sectionPathIsRelative = false;
    let sectionIsDefault = false;
    for (const line of profileLines) {
      const match = line.match(kRegex);
      const valueMatch = line.match(kValueRegex);
      if (match) {
        sectionPath = "";
        sectionPathIsRelative = false;
        sectionIsDefault = false;
      } else if (valueMatch) {
        const key = valueMatch[1].trim().toLowerCase();
        const value = valueMatch[2].trim();
        if (key === "path") {
          sectionPath = value;
        } else if (key === "isrelative") {
          sectionPathIsRelative = value === "1";
        } else if (key === "default") {
          sectionIsDefault = value === "1";
        }
      }

      if (sectionIsDefault && sectionPath.length > 0) {
        if (sectionPathIsRelative) {
          return path.join(platformProfileDir(profilesDir), sectionPath);
        } else {
          return sectionPath;
        }
      }
    }
  }
  return undefined;
}

function detectDataDir() {

  // we'll fall back to the default if we can't find another dir in the profile
  const dataDirRegex = new RegExp("user_pref\\(\"extensions.zotero.dataDir\",\\s*\"([^\"]+)\"\\);");
  let dataDir = zoteroDefaultDataDir();

  // find the prefs for the default profile
  const profileDir = defaultProfileDir();
  if (profileDir) {
    const prefsFile = path.join(profileDir, "prefs.js");
    if (fs.existsSync(prefsFile)) {
      // read the prefs file
      const prefs = fs.readFileSync(prefsFile, { encoding: "utf-8" });
      // look for the zotero.dataDir pref
      const matchPref = prefs.match(dataDirRegex);
      if (matchPref) {
        dataDir = matchPref[1].replace(/\\/g, "/");
      }
    }
  }

  // only return the dataDir if it exists
  return fs.existsSync(dataDir) ? dataDir : undefined;
}