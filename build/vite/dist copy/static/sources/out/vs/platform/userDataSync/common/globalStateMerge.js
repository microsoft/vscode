/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as objects from '../../../base/common/objects.js';
import { SYNC_SERVICE_URL_TYPE } from './userDataSync.js';
export function merge(localStorage, remoteStorage, baseStorage, storageKeys, logService) {
    if (!remoteStorage) {
        return { remote: { added: Object.keys(localStorage), removed: [], updated: [], all: Object.keys(localStorage).length > 0 ? localStorage : null }, local: { added: {}, removed: [], updated: {} } };
    }
    const localToRemote = compare(localStorage, remoteStorage);
    if (localToRemote.added.size === 0 && localToRemote.removed.size === 0 && localToRemote.updated.size === 0) {
        // No changes found between local and remote.
        return { remote: { added: [], removed: [], updated: [], all: null }, local: { added: {}, removed: [], updated: {} } };
    }
    const baseToRemote = baseStorage ? compare(baseStorage, remoteStorage) : { added: Object.keys(remoteStorage).reduce((r, k) => { r.add(k); return r; }, new Set()), removed: new Set(), updated: new Set() };
    const baseToLocal = baseStorage ? compare(baseStorage, localStorage) : { added: Object.keys(localStorage).reduce((r, k) => { r.add(k); return r; }, new Set()), removed: new Set(), updated: new Set() };
    const local = { added: {}, removed: [], updated: {} };
    const remote = objects.deepClone(remoteStorage);
    const isFirstTimeSync = !baseStorage;
    // Added in local
    for (const key of baseToLocal.added.values()) {
        // If syncing for first time remote value gets precedence always,
        // except for sync service type key - local value takes precedence for this key
        if (key !== SYNC_SERVICE_URL_TYPE && isFirstTimeSync && baseToRemote.added.has(key)) {
            continue;
        }
        remote[key] = localStorage[key];
    }
    // Updated in local
    for (const key of baseToLocal.updated.values()) {
        remote[key] = localStorage[key];
    }
    // Removed in local
    for (const key of baseToLocal.removed.values()) {
        // Do not remove from remote if key is not registered.
        if (storageKeys.unregistered.includes(key)) {
            continue;
        }
        delete remote[key];
    }
    // Added in remote
    for (const key of baseToRemote.added.values()) {
        const remoteValue = remoteStorage[key];
        if (storageKeys.machine.includes(key)) {
            logService.info(`GlobalState: Skipped adding ${key} in local storage because it is declared as machine scoped.`);
            continue;
        }
        // Skip if the value is also added in local from the time it is last synced
        if (baseStorage && baseToLocal.added.has(key)) {
            continue;
        }
        const localValue = localStorage[key];
        if (localValue && localValue.value === remoteValue.value) {
            continue;
        }
        // Local sync service type value takes precedence if syncing for first time
        if (key === SYNC_SERVICE_URL_TYPE && isFirstTimeSync && baseToLocal.added.has(key)) {
            continue;
        }
        if (localValue) {
            local.updated[key] = remoteValue;
        }
        else {
            local.added[key] = remoteValue;
        }
    }
    // Updated in Remote
    for (const key of baseToRemote.updated.values()) {
        const remoteValue = remoteStorage[key];
        if (storageKeys.machine.includes(key)) {
            logService.info(`GlobalState: Skipped updating ${key} in local storage because it is declared as machine scoped.`);
            continue;
        }
        // Skip if the value is also updated or removed in local
        if (baseToLocal.updated.has(key) || baseToLocal.removed.has(key)) {
            continue;
        }
        const localValue = localStorage[key];
        if (localValue && localValue.value === remoteValue.value) {
            continue;
        }
        local.updated[key] = remoteValue;
    }
    // Removed in remote
    for (const key of baseToRemote.removed.values()) {
        if (storageKeys.machine.includes(key)) {
            logService.trace(`GlobalState: Skipped removing ${key} in local storage because it is declared as machine scoped.`);
            continue;
        }
        // Skip if the value is also updated or removed in local
        if (baseToLocal.updated.has(key) || baseToLocal.removed.has(key)) {
            continue;
        }
        local.removed.push(key);
    }
    const result = compare(remoteStorage, remote);
    return { local, remote: { added: [...result.added], updated: [...result.updated], removed: [...result.removed], all: result.added.size === 0 && result.removed.size === 0 && result.updated.size === 0 ? null : remote } };
}
function compare(from, to) {
    const fromKeys = Object.keys(from);
    const toKeys = Object.keys(to);
    const added = toKeys.filter(key => !fromKeys.includes(key)).reduce((r, key) => { r.add(key); return r; }, new Set());
    const removed = fromKeys.filter(key => !toKeys.includes(key)).reduce((r, key) => { r.add(key); return r; }, new Set());
    const updated = new Set();
    for (const key of fromKeys) {
        if (removed.has(key)) {
            continue;
        }
        const value1 = from[key];
        const value2 = to[key];
        if (!objects.equals(value1, value2)) {
            updated.add(key);
        }
    }
    return { added, removed, updated };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2xvYmFsU3RhdGVNZXJnZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vZ2xvYmFsU3RhdGVNZXJnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEtBQUssT0FBTyxNQUFNLGlDQUFpQyxDQUFDO0FBRTNELE9BQU8sRUFBaUIscUJBQXFCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQU96RSxNQUFNLFVBQVUsS0FBSyxDQUFDLFlBQThDLEVBQUUsYUFBc0QsRUFBRSxXQUFvRCxFQUFFLFdBQW9GLEVBQUUsVUFBdUI7SUFDaFMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3BCLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFDcE0sQ0FBQztJQUVELE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDM0QsSUFBSSxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzVHLDZDQUE2QztRQUM3QyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUN2SCxDQUFDO0lBRUQsTUFBTSxZQUFZLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEdBQUcsRUFBVSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksR0FBRyxFQUFVLEVBQUUsT0FBTyxFQUFFLElBQUksR0FBRyxFQUFVLEVBQUUsQ0FBQztJQUNwTyxNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksR0FBRyxFQUFVLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxHQUFHLEVBQVUsRUFBRSxPQUFPLEVBQUUsSUFBSSxHQUFHLEVBQVUs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QzlDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsR0FBRyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7QUFDNU4sQ0FBQztBQUVELFNBQVMsT0FBTyxDQUFDLElBQTRCLEVBQUUsRUFBMEI7SUFDeEUsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQy9CLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxHQUFHLEVBQVUsQ0FBQyxDQUFDO0lBQzdILE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxHQUFHLEVBQVUsQ0FBQyxDQUFDO0lBQy9ILE1BQU0sT0FBTyxHQUFnQixJQUFJLEdBQUcsRUFBVSxDQUFDO0lBRS9DLEtBQUssTUFBTSxHQUFHLElBQUksUUFBUSxFQUFFLENBQUM7UUFDNUIsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdEIsU0FBUztRQUNWLENBQUM7UUFDRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDekIsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ3JDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQztBQUNwQyxDQUFDIn0=