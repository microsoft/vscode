/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { equals } from '../../../base/common/objects.js';
export function merge(local, remote, lastSync, ignored) {
    const localResult = { added: [], removed: [], updated: [] };
    let remoteResult = { added: [], removed: [], updated: [] };
    if (!remote) {
        const added = local.filter(({ id }) => !ignored.includes(id));
        if (added.length) {
            remoteResult.added = added;
        }
        else {
            remoteResult = null;
        }
        return {
            local: localResult,
            remote: remoteResult
        };
    }
    const localToRemote = compare(local, remote, ignored);
    if (localToRemote.added.length > 0 || localToRemote.removed.length > 0 || localToRemote.updated.length > 0) {
        const baseToLocal = compare(lastSync, local, ignored);
        const baseToRemote = compare(lastSync, remote, ignored);
        // Remotely removed profiles
        for (const id of baseToRemote.removed) {
            const e = local.find(profile => profile.id === id);
            if (e) {
                localResult.removed.push(e);
            }
        }
        // Remotely added profiles
        for (const id of baseToRemote.added) {
            const remoteProfile = remote.find(profile => profile.id === id);
            // Got added in local
            if (baseToLocal.added.includes(id)) {
                // Is different from local to remote
                if (localToRemote.updated.includes(id)) {
                    // Remote wins always
                    localResult.updated.push(remoteProfile);
                }
            }
            else {
                localResult.added.push(remoteProfile);
            }
        }
        // Remotely updated profiles
        for (const id of baseToRemote.updated) {
            // Remote wins always
            localResult.updated.push(remote.find(profile => profile.id === id));
        }
        // Locally added profiles
        for (const id of baseToLocal.added) {
            // Not there in remote
            if (!baseToRemote.added.includes(id)) {
                remoteResult.added.push(local.find(profile => profile.id === id));
            }
        }
        // Locally updated profiles
        for (const id of baseToLocal.updated) {
            // If removed in remote
            if (baseToRemote.removed.includes(id)) {
                continue;
            }
            // If not updated in remote
            if (!baseToRemote.updated.includes(id)) {
                remoteResult.updated.push(local.find(profile => profile.id === id));
            }
        }
        // Locally removed profiles
        for (const id of baseToLocal.removed) {
            const removedProfile = remote.find(profile => profile.id === id);
            if (removedProfile) {
                remoteResult.removed.push(removedProfile);
            }
        }
    }
    if (remoteResult.added.length === 0 && remoteResult.removed.length === 0 && remoteResult.updated.length === 0) {
        remoteResult = null;
    }
    return { local: localResult, remote: remoteResult };
}
function compare(from, to, ignoredProfiles) {
    from = from ? from.filter(({ id }) => !ignoredProfiles.includes(id)) : [];
    to = to.filter(({ id }) => !ignoredProfiles.includes(id));
    const fromKeys = from.map(({ id }) => id);
    const toKeys = to.map(({ id }) => id);
    const added = toKeys.filter(key => !fromKeys.includes(key));
    const removed = fromKeys.filter(key => !toKeys.includes(key));
    const updated = [];
    for (const { id, name, icon, useDefaultFlags } of from) {
        if (removed.includes(id)) {
            continue;
        }
        const toProfile = to.find(p => p.id === id);
        if (!toProfile
            || toProfile.name !== name
            || toProfile.icon !== icon
            || !equals(toProfile.useDefaultFlags, useDefaultFlags)) {
            updated.push(id);
        }
    }
    return { added, removed, updated };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlc01hbmlmZXN0TWVyZ2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdE1lcmdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQWtCekQsTUFBTSxVQUFVLEtBQUssQ0FBQyxLQUF5QixFQUFFLE1BQXFDLEVBQUUsUUFBdUMsRUFBRSxPQUFpQjtJQUNqSixNQUFNLFdBQVcsR0FBb0csRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQzdKLElBQUksWUFBWSxHQUF1RyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFFL0osSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2IsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlELElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2xCLFlBQVksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQzVCLENBQUM7YUFBTSxDQUFDO1lBQ1AsWUFBWSxHQUFHLElBQUksQ0FBQztRQUNyQixDQUFDO1FBQ0QsT0FBTztZQUNOLEtBQUssRUFBRSxXQUFXO1lBQ2xCLE1BQU0sRUFBRSxZQUFZO1NBQ3BCLENBQUM7SUFDSCxDQUFDO0lBRUQsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFD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