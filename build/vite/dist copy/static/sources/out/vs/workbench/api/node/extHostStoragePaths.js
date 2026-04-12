/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { ExtensionStoragePaths as CommonExtensionStoragePaths } from '../common/extHostStoragePaths.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { IntervalTimer, timeout } from '../../../base/common/async.js';
import { Promises } from '../../../base/node/pfs.js';
export class ExtensionStoragePaths extends CommonExtensionStoragePaths {
    constructor() {
        super(...arguments);
        this._workspaceStorageLock = null;
    }
    async _getWorkspaceStorageURI(storageName) {
        const workspaceStorageURI = await super._getWorkspaceStorageURI(storageName);
        if (workspaceStorageURI.scheme !== Schemas.file) {
            return workspaceStorageURI;
        }
        if (this._environment.skipWorkspaceStorageLock) {
            this._logService.info(`Skipping acquiring lock for ${workspaceStorageURI.fsPath}.`);
            return workspaceStorageURI;
        }
        const workspaceStorageBase = workspaceStorageURI.fsPath;
        let attempt = 0;
        do {
            let workspaceStoragePath;
            if (attempt === 0) {
                workspaceStoragePath = workspaceStorageBase;
            }
            else {
                workspaceStoragePath = (/[/\\]$/.test(workspaceStorageBase)
                    ? `${workspaceStorageBase.substr(0, workspaceStorageBase.length - 1)}-${attempt}`
                    : `${workspaceStorageBase}-${attempt}`);
            }
            await mkdir(workspaceStoragePath);
            const lockfile = path.join(workspaceStoragePath, 'vscode.lock');
            const lock = await tryAcquireLock(this._logService, lockfile, false);
            if (lock) {
                this._workspaceStorageLock = lock;
                process.on('exit', () => {
                    lock.dispose();
                });
                return URI.file(workspaceStoragePath);
            }
            attempt++;
        } while (attempt < 10);
        // just give up
        return workspaceStorageURI;
    }
    onWillDeactivateAll() {
        // the lock will be released soon
        this._workspaceStorageLock?.setWillRelease(6000);
    }
}
async function mkdir(dir) {
    try {
        await fs.promises.stat(dir);
        return;
    }
    catch {
        // doesn't exist, that's OK
    }
    try {
        await fs.promises.mkdir(dir, { recursive: true });
    }
    catch {
    }
}
const MTIME_UPDATE_TIME = 1000; // 1s
const STALE_LOCK_TIME = 10 * 60 * 1000; // 10 minutes
class Lock extends Disposable {
    constructor(logService, filename) {
        super();
        this.logService = logService;
        this.filename = filename;
        this._timer = this._register(new IntervalTimer());
        this._timer.cancelAndSet(async () => {
            const contents = await readLockfileContents(logService, filename);
            if (!contents || contents.pid !== process.pid) {
                // we don't hold the lock anymore ...
                logService.info(`Lock '${filename}': The lock was lost unexpectedly.`);
                this._timer.cancel();
            }
            try {
                await fs.promises.utimes(filename, new Date(), new Date());
            }
            catch (err) {
                logService.error(err);
                logService.info(`Lock '${filename}': Could not update mtime.`);
            }
        }, MTIME_UPDATE_TIME);
    }
    dispose() {
        super.dispose();
        try {
            fs.unlinkSync(this.filename);
        }
        catch (err) { }
    }
    async setWillRelease(timeUntilReleaseMs) {
        this.logService.info(`Lock '${this.filename}': Marking the lockfile as scheduled to be released in ${timeUntilReleaseMs} ms.`);
        try {
            const contents = {
                pid: process.pid,
                willReleaseAt: Date.now() + timeUntilReleaseMs
            };
            await Promises.writeFile(this.filename, JSON.stringify(contents), { flag: 'w' });
        }
        catch (err) {
            this.logService.error(err);
        }
    }
}
/**
 * Attempt to acquire a lock on a directory.
 * This does not use the real `flock`, but uses a file.
 * @returns a disposable if the lock could be acquired or null if it could not.
 */
async function tryAcquireLock(logService, filename, isSecondAttempt) {
    try {
        const contents = {
            pid: process.pid,
            willReleaseAt: 0
        };
        await Promises.writeFile(filename, JSON.stringify(contents), { flag: 'wx' });
    }
    catch (err) {
        logService.error(err);
    }
    // let's see if we got the lock
    const contents = await readLockfileContents(logService, filename);
    if (!contents || contents.pid !== process.pid) {
        // we didn't get the lock
        if (isSecondAttempt) {
            logService.info(`Lock '${filename}': Could not acquire lock, giving up.`);
            return null;
        }
        logService.info(`Lock '${filename}': Could not acquire lock, checking if the file is stale.`);
        return checkStaleAndTryAcquireLock(logService, filename);
    }
    // we got the lock
    logService.info(`Lock '${filename}': Lock acquired.`);
    return new Lock(logService, filename);
}
/**
 * @returns 0 if the pid cannot be read
 */
async function readLockfileContents(logService, filename) {
    let contents;
    try {
        contents = await fs.promises.readFile(filename);
    }
    catch (err) {
        // cannot read the file
        logService.error(err);
        return null;
    }
    try {
        return JSON.parse(String(contents));
    }
    catch (err) {
        // cannot parse the file
        logService.error(err);
        return null;
    }
}
/**
 * @returns 0 if the mtime cannot be read
 */
async function readmtime(logService, filename) {
    let stats;
    try {
        stats = await fs.promises.stat(filename);
    }
    catch (err) {
        // cannot read the file stats to check if it is stale or not
        logService.error(err);
        return 0;
    }
    return stats.mtime.getTime();
}
function processExists(pid) {
    try {
        process.kill(pid, 0); // throws an exception if the process doesn't exist anymore.
        return true;
    }
    catch (e) {
        return false;
    }
}
async function checkStaleAndTryAcquireLock(logService, filename) {
    const contents = await readLockfileContents(logService, filename);
    if (!contents) {
        logService.info(`Lock '${filename}': Could not read pid of lock holder.`);
        return tryDeleteAndAcquireLock(logService, filename);
    }
    if (contents.willReleaseAt) {
        let timeUntilRelease = contents.willReleaseAt - Date.now();
        if (timeUntilRelease < 5000) {
            if (timeUntilRelease > 0) {
                logService.info(`Lock '${filename}': The lockfile is scheduled to be released in ${timeUntilRelease} ms.`);
            }
            else {
                logService.info(`Lock '${filename}': The lockfile is scheduled to have been released.`);
            }
            while (timeUntilRelease > 0) {
                await timeout(Math.min(100, timeUntilRelease));
                const mtime = await readmtime(logService, filename);
                if (mtime === 0) {
                    // looks like the lock was released
                    return tryDeleteAndAcquireLock(logService, filename);
                }
                timeUntilRelease = contents.willReleaseAt - Date.now();
            }
            return tryDeleteAndAcquireLock(logService, filename);
        }
    }
    if (!processExists(contents.pid)) {
        logService.info(`Lock '${filename}': The pid ${contents.pid} appears to be gone.`);
        return tryDeleteAndAcquireLock(logService, filename);
    }
    const mtime1 = await readmtime(logService, filename);
    const elapsed1 = Date.now() - mtime1;
    if (elapsed1 <= STALE_LOCK_TIME) {
        // the lock does not look stale
        logService.info(`Lock '${filename}': The lock does not look stale, elapsed: ${elapsed1} ms, giving up.`);
        return null;
    }
    // the lock holder updates the mtime every 1s.
    // let's give it a chance to update the mtime
    // in case of a wake from sleep or something similar
    logService.info(`Lock '${filename}': The lock looks stale, waiting for 2s.`);
    await timeout(2000);
    const mtime2 = await readmtime(logService, filename);
    const elapsed2 = Date.now() - mtime2;
    if (elapsed2 <= STALE_LOCK_TIME) {
        // the lock does not look stale
        logService.info(`Lock '${filename}': The lock does not look stale, elapsed: ${elapsed2} ms, giving up.`);
        return null;
    }
    // the lock looks stale
    logService.info(`Lock '${filename}': The lock looks stale even after waiting for 2s.`);
    return tryDeleteAndAcquireLock(logService, filename);
}
async function tryDeleteAndAcquireLock(logService, filename) {
    logService.info(`Lock '${filename}': Deleting a stale lock.`);
    try {
        await fs.promises.unlink(filename);
    }
    catch (err) {
        // cannot delete the file
        // maybe the file is already deleted
    }
    return tryAcquireLock(logService, filename, true);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFN0b3JhZ2VQYXRocy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRIb3N0U3RvcmFnZVBhdGhzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0sOEJBQThCLENBQUM7QUFDckQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxxQkFBcUIsSUFBSSwyQkFBMkIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFckQsTUFBTSxPQUFPLHFCQUFzQixTQUFRLDJCQUEyQjtJQUF0RTs7UUFFUywwQkFBcUIsR0FBZ0IsSUFBSSxDQUFDO0lBa0RuRCxDQUFDO0lBaERtQixLQUFLLENBQUMsdUJBQXVCLENBQUMsV0FBbUI7UUFDbkUsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3RSxJQUFJLG1CQUFtQixDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDakQsT0FBTyxtQkFBbUIsQ0FBQztRQUM1QixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLHdCQUF3QixFQUFFLENBQUM7WUFDaEQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsK0JBQStCLG1CQUFtQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7WUFDcEYsT0FBTyxtQkFBbUIsQ0FBQztRQUM1QixDQUFDO1FBRUQsTUFBTSxvQkFBb0IsR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUM7UUFDeEQsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLEdBQUcsQ0FBQztZQUNILElBQUksb0JBQTRCLENBQUM7WUFDakMsSUFBSSxPQUFPLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ25CLG9CQUFvQixHQUFHLG9CQUFvQixDQUFDO1lBQzdDLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxvQkFBb0IsR0FBRyxDQUN0QixRQUFRLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDO29CQUNsQyxDQUFDLENBQUMsR0FBRyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSSxPQUFPLEVBQUU7b0JBQ2pGLENBQUMsQ0FBQyxHQUFHLG9CQUFvQixJQUFJLE9BQU8sRUFBRSxDQUN2QyxDQUFDO1lBQ0gsQ0FBQztZQUVELE1BQU0sS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFFbEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNoRSxNQUFNLElBQUksR0FBRyxNQUFNLGNBQWMsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNyRSxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUNWLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLENBQUM7Z0JBQ2xDLE9BQU8sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRTtvQkFDdkIsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNoQixDQUFDLENBQUMsQ0FBQztnQkFDSCxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztZQUN2QyxDQUFDO1lBRUQsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDLFFBQVEsT0FBTyxHQUFHLEVBQUUsRUFBRTtRQUV2QixlQUFlO1FBQ2YsT0FBTyxtQkFBbUIsQ0FBQztJQUM1QixDQUFDO0lBRVEsbUJBQW1CO1FBQzNCLGlDQUFpQztRQUNqQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xELENBQUM7Q0FDRDtBQUVELEtBQUssVUFBVSxLQUFLLENBQUMsR0FBVztJQUMvQixJQUFJLENBQUM7UUFDSixNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVCLE9BQU87SUFDUixDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1IsMkJBQTJCO0lBQzVCLENBQUM7SUFFRCxJQUFJLENBQUM7UUFDSixNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFBQyxNQUFNLENBQUM7SUFDVCxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLENBQUMsS0FBSztBQUNyQyxNQUFNLGVBQWUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLGFBQWE7QUFFckQsTUFBTSxJQUFLLFNBQVEsVUFBVTtJQUk1QixZQUNrQixVQUF1QixFQUN2QixRQUFnQjtRQUVqQyxLQUFLLEVBQUUsQ0FBQztRQUhTLGVBQVUsR0FBVixVQUFVLENBQWE7UUFDdkIsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUlqQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ25DLE1BQU0sUUFBUSxHQUFHLE1BQU0sb0JBQW9CLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2xFLElBQUksQ0FBQyxRQUFRLElBQUksUUFBUSxDQUFDLEdBQUcsS0FBSyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7Z0JBQy9DLHFDQUFxQztnQkFDckMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLFFBQVEsb0NBQW9DLENBQUMsQ0FBQztnQkFDdkUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN0QixDQUFDO1lBQ0QsSUFBSSxDQUFDO2dCQUNKLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLElBQUksSUFBSSxFQUFFLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzVELENBQUM7WUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUNkLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3RCLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxRQUFRLDRCQUE0QixDQUFDLENBQUM7WUFDaEUsQ0FBQztRQUNGLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFFZSxPQUFPO1FBQ3RCLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNoQixJQUFJLENBQUM7WUFBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUFDLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRU0sS0FBSyxDQUFDLGNBQWMsQ0FBQyxrQkFBMEI7UUFDckQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsUUFBUSwwREFBMEQsa0JBQWtCLE1BQU0sQ0FBQyxDQUFDO1FBQy9ILElBQUksQ0FBQztZQUNKLE1BQU0sUUFBUSxHQUFzQjtnQkFDbkMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxHQUFHO2dCQUNoQixhQUFhLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLGtCQUFrQjthQUM5QyxDQUFDO1lBQ0YsTUFBTSxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ2xGLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUIsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVEOzs7O0dBSUc7QUFDSCxLQUFLLFVBQVUsY0FBYyxDQUFDLFVBQXVCLEVBQUUsUUFBZ0IsRUFBRSxlQUF3QjtJQUNoRyxJQUFJLENBQUM7UUFDSixNQUFNLFFBQVEsR0FBc0I7WUFDbkMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxHQUFHO1lBQ2hCLGFBQWEsRUFBRSxDQUFDO1NBQ2hCLENBQUM7UUFDRixNQUFNLFFBQVEsQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUM5RSxDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNkLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUVELCtCQUErQjtJQUMvQixNQUFNLFFBQVEsR0FBRyxNQUFNLG9CQUFvQixDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNsRSxJQUFJLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxHQUFHLEtBQUssT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQy9DLHlCQUF5QjtRQUN6QixJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQ3JCLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxRQUFRLHVDQUF1QyxDQUFDLENBQUM7WUFDMUUsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLFFBQVEsMkRBQTJELENBQUMsQ0FBQztRQUM5RixPQUFPLDJCQUEyQixDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRUQsa0JBQWtCO0lBQ2xCLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxRQUFRLG1CQUFtQixDQUFDLENBQUM7SUFDdEQsT0FBTyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDdkMsQ0FBQztBQU9EOztHQUVHO0FBQ0gsS0FBSyxVQUFVLG9CQUFvQixDQUFDLFVBQXVCLEVBQUUsUUFBZ0I7SUFDNUUsSUFBSSxRQUFnQixDQUFDO0lBQ3JCLElBQUksQ0FBQztRQUNKLFFBQVEsR0FBRyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2QsdUJBQXVCO1FBQ3ZCLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsSUFBSSxDQUFDO1FBQ0osT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2Qsd0JBQXdCO1FBQ3hCLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0FBQ0YsQ0FBQztBQUVEOztHQUVHO0FBQ0gsS0FBSyxVQUFVLFNBQVMsQ0FBQyxVQUF1QixFQUFFLFFBQWdCO0lBQ2pFLElBQUksS0FBZSxDQUFDO0lBQ3BCLElBQUksQ0FBQztRQUNKLEtBQUssR0FBRyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2QsNERBQTREO1FBQzVELFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEIsT0FBTyxDQUFDLENBQUM7SUFDVixDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQzlCLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxHQUFXO0lBQ2pDLElBQUksQ0FBQztRQUNKLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsNERBQTREO1FBQ2xGLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDWixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDRixDQUFDO0FBRUQsS0FBSyxVQUFVLDJCQUEyQixDQUFDLFVBQXVCLEVBQUUsUUFBZ0I7SUFDbkYsTUFBTSxRQUFRLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDbEUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2YsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLFFBQVEsdUNBQXVDLENBQUMsQ0FBQztRQUMxRSxPQUFPLHVCQUF1QixDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQsSUFBSSxRQUFRLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDNUIsSUFBSSxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMzRCxJQUFJLGdCQUFnQixHQUFHLElBQUksRUFBRSxDQUFDO1lBQzdCLElBQUksZ0JBQWdCLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzFCLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxRQUFRLGtEQUFrRCxnQkFBZ0IsTUFBTSxDQUFDLENBQUM7WUFDNUcsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxRQUFRLHFEQUFxRCxDQUFDLENBQUM7WUFDekYsQ0FBQztZQUVELE9BQU8sZ0JBQWdCLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzdCLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLGdCQUFnQixDQUFDLENBQUMsQ0FBQztnQkFDL0MsTUFBTSxLQUFLLEdBQUcsTUFBTSxTQUFTLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUNwRCxJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDakIsbUNBQW1DO29CQUNuQyxPQUFPLHVCQUF1QixDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDdEQsQ0FBQztnQkFDRCxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUN4RCxDQUFDO1lBRUQsT0FBTyx1QkFBdUIsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdEQsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxRQUFRLGNBQWMsUUFBUSxDQUFDLEdBQUcsc0JBQXNCLENBQUMsQ0FBQztRQUNuRixPQUFPLHVCQUF1QixDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ3JELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUM7SUFDckMsSUFBSSxRQUFRLElBQUksZUFBZSxFQUFFLENBQUM7UUFDakMsK0JBQStCO1FBQy9CLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxRQUFRLDZDQUE2QyxRQUFRLGlCQUFpQixDQUFDLENBQUM7UUFDekcsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsOENBQThDO0lBQzlDLDZDQUE2QztJQUM3QyxvREFBb0Q7SUFDcEQsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLFFBQVEsMENBQTBDLENBQUMsQ0FBQztJQUM3RSxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUVwQixNQUFNLE1BQU0sR0FBRyxNQUFNLFNBQVMsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDckQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLE1BQU0sQ0FBQztJQUNyQyxJQUFJLFFBQVEsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNqQywrQkFBK0I7UUFDL0IsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLFFBQVEsNkNBQTZDLFFBQVEsaUJBQWlCLENBQUMsQ0FBQztRQUN6RyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCx1QkFBdUI7SUFDdkIsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLFFBQVEsb0RBQW9ELENBQUMsQ0FBQztJQUN2RixPQUFPLHVCQUF1QixDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztBQUN0RCxDQUFDO0FBRUQsS0FBSyxVQUFVLHVCQUF1QixDQUFDLFVBQXVCLEVBQUUsUUFBZ0I7SUFDL0UsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLFFBQVEsMkJBQTJCLENBQUMsQ0FBQztJQUM5RCxJQUFJLENBQUM7UUFDSixNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2QseUJBQXlCO1FBQ3pCLG9DQUFvQztJQUNyQyxDQUFDO0lBQ0QsT0FBTyxjQUFjLENBQUMsVUFBVSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNuRCxDQUFDIn0=