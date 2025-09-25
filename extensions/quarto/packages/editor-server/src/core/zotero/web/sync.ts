/*
 * sync.ts
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


import { Group, Library, ZoteroApi, ZoteroObjectNotFoundError } from "./api.js";
import { groupDelete, groupLocal, groupsLocal, groupsSync, groupsSyncActions } from "./groups.js";
import { hasLibrarySyncActions, libraryList, librarySync, librarySyncActions, LibrarySyncActions } from "./libraries.js";
import { libraryWrite, userWebLibrariesDir } from "./storage.js";
import { zoteroTraceProgress } from "./trace.js";

import { SyncProgress } from "./types";

export type { SyncProgress } from "./types";

export async function zoteroSyncWebLibrary(
  zotero: ZoteroApi, 
  type: "user" | "group", 
  id: number,
  progress?: SyncProgress
) {

  // default progress
  progress = progress || zoteroTraceProgress();

  // alias user
  const user = zotero.user;

  // status
  progress.report(`Syncing library (${type}-${id})`, 10);

  // see if we need to update group info
  const library: Library = { type, id };
  let groupSync: Group | null = null;
  if (type === "group") {

    // fill in local group data
    library.group = await groupLocal(user, id) || undefined;

    // get latest version of group from server 
    try {
     
      const serverGroup = await zotero.group(id, library.group?.version || 0);
      
      // update if we got back a server group that is differnent from the local group
      if (serverGroup && serverGroup.version !== library.group?.version) {
        groupSync = serverGroup.data;
      }
    } catch(error) {
      // if it no longer exists then remove it
      if (error instanceof ZoteroObjectNotFoundError) {
        progress.report(`Removing library (${type}-${id})`);
        groupDelete(user, id);
        return;
      }
    }
  }

  // check for library sync actions
  const syncActions = await librarySyncActions(zotero, library, groupSync, progress);
  if (hasLibrarySyncActions(syncActions)) {
    const objects = await librarySync(user, library, syncActions);
    await libraryWrite(userWebLibrariesDir(user), library, objects);
  } 

  progress.report("Sync complete");
}


export async function zoteroSyncWebLibraries(zotero: ZoteroApi, progress?: SyncProgress) {

  // default progress
  progress = progress || zoteroTraceProgress();

  // start
  
  progress.report("Beginning sync", 10);

  // alias user then sync
  const user = zotero.user;
  progress.report(`Syncing user ${user.username} (id: ${user.userID})`);

  // read current groups and deduce group actions
  const groups = await groupsLocal(user);
  const groupsActions = await groupsSyncActions(zotero, groups, progress);

  // remove deleted groups
  for (const groupId of groupsActions.deleted) {
    progress.report(`Removing group ${groupId}`);
    groupDelete(user, Number(groupId));
  }

  // determine updated groups
  const updatedGroups = groupsSync(groups, groupsActions);

  // compute libraries and sync actions for libraries
  const libraries = libraryList(user, updatedGroups);
  const librariesSync: Array<{ library: Library, actions: LibrarySyncActions }> = [];
  for (const library of libraries) {
    progress.report(`Syncing library (${library.type}-${library.id})`);
    const groupSync = groupsActions.updated.find((group: Group) => group.id === library.id) || null;
    librariesSync.push({ 
      library, 
      actions: (await librarySyncActions(zotero, library, groupSync, progress))
    });
  }

  // write synced libraries
  const dir = userWebLibrariesDir(user);
  for (const sync of librariesSync) {
    if (hasLibrarySyncActions(sync.actions)) {
      const objects = await librarySync(user, sync.library, sync.actions);
      await libraryWrite(dir, sync.library, objects);
    } 
  }

  // end
  progress.report("Sync complete");
}
