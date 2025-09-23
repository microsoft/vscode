/*
 * groups.ts
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
import path from "node:path";
import { Group, User, ZoteroApi } from "./api";
import { libraryReadGroup, userWebLibrariesDir } from "./storage";
import { SyncActions, SyncProgress } from "./types";

export async function groupLocal(user: User, groupId: number) {
  return libraryReadGroup(user, { type: "group", id: groupId});
}

export async function groupsLocal(user: User) : Promise<Group[]> {
  const groups: Group[] = [];
  const dir = userWebLibrariesDir(user);
  for (const file of fs.readdirSync(dir)) {
    const match = file.match(/^group-(\d+)\.json$/);
    if (match) {
      const group = await libraryReadGroup(user, { type: "group", id: Number(match[1])});
      if (group) {
        groups.push(group);
      }
    }
  }
  return groups;
}

export function groupDelete(user: User, groupId: number) {
  const dir = userWebLibrariesDir(user);
  const groupDir = path.join(dir, `group-${groupId}`);
  if (fs.existsSync(groupDir)) {
    fs.rmSync(groupDir, { recursive: true, force: true });
  }
}


export async function groupsSyncActions(zotero: ZoteroApi, groups: Group[], progress: SyncProgress) {
  
  // sync actions
  const actions: SyncActions<Group> = { deleted: [], updated: [] };

  // get existing group metadata
  progress.report("Syncing groups")
   const serverGroupVersions = await zotero.groupVersions(zotero.user.userID);
  const serverGroupIds = Object.keys(serverGroupVersions).map(Number);

  // remove groups
  const removeGroups = groups.filter(group => !serverGroupIds.includes(group.id));
  for (const group of removeGroups) {
    actions.deleted.push(String(group.id));
  }
  
  // update/add groups
  for (const serverGroupId of serverGroupIds) {
    const localGroup = groups.find(group => group.id === serverGroupId);
    if (!localGroup || (localGroup.version !== serverGroupVersions[localGroup.id])) {
      const serverGroup = await zotero.group(serverGroupId, localGroup?.version || 0);
      if (serverGroup) { 
        if (localGroup) {
          if (serverGroup.version !== localGroup.version) {
            actions.updated.push(serverGroup.data);
          }
        } else {
          const newGroup = serverGroup.data;
          actions.updated.push(newGroup);
        }
      }
    }
  } 

  // return the sync actions
  return actions;
}

export function groupsSync(groups: Group[], actions: SyncActions<Group>) {
  let newGroups = [...groups];
  // apply deletes
  newGroups = newGroups.filter(group => !actions.deleted.includes(String(group.id)));

  // apply updates (remove any existing then add)
  const updatedIds = actions.updated.map((group: Group) => group.id);
  newGroups = newGroups.filter(group => !updatedIds.includes(group.id));
  newGroups.push(...actions.updated);

  // return new groups
  return newGroups;
}
