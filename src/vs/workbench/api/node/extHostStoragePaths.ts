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
import { ILogService } from '../../../platform/log/common/log.js';
import { Promises } from '../../../base/node/pfs.js';

export class ExtensionStoragePaths extends CommonExtensionStoragePaths {

	private _workspaceStorageLock: Lock | null = null;

	protected override async _getWorkspaceStorageURI(storageName: string): Promise<URI> {
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
			let workspaceStoragePath: string;
			if (attempt === 0) {
				workspaceStoragePath = workspaceStorageBase;
			} else {
				workspaceStoragePath = (
					/[/\\]$/.test(workspaceStorageBase)
						? `${workspaceStorageBase.substr(0, workspaceStorageBase.length - 1)}-${attempt}`
						: `${workspaceStorageBase}-${attempt}`
				);
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

	override onWillDeactivateAll(): void {
		// the lock will be released soon
		this._workspaceStorageLock?.setWillRelease(6000);
	}
}

async function mkdir(dir: string): Promise<void> {
	try {
		await fs.promises.stat(dir);
		return;
	} catch {
		// doesn't exist, that's OK
	}

	try {
		await fs.promises.mkdir(dir, { recursive: true });
	} catch {
	}
}

const MTIME_UPDATE_TIME = 1000; // 1s
const STALE_LOCK_TIME = 10 * 60 * 1000; // 10 minutes

class Lock extends Disposable {

	private readonly _timer: IntervalTimer;

	constructor(
		private readonly logService: ILogService,
		private readonly filename: string
	) {
		super();

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
			} catch (err) {
				logService.error(err);
				logService.info(`Lock '${filename}': Could not update mtime.`);
			}
		}, MTIME_UPDATE_TIME);
	}

	public override dispose(): void {
		super.dispose();
		try { fs.unlinkSync(this.filename); } catch (err) { }
	}

	public async setWillRelease(timeUntilReleaseMs: number): Promise<void> {
		this.logService.info(`Lock '${this.filename}': Marking the lockfile as scheduled to be released in ${timeUntilReleaseMs} ms.`);
		try {
			const contents: ILockfileContents = {
				pid: process.pid,
				willReleaseAt: Date.now() + timeUntilReleaseMs
			};
			await Promises.writeFile(this.filename, JSON.stringify(contents), { flag: 'w' });
		} catch (err) {
			this.logService.error(err);
		}
	}
}

/**
 * Attempt to acquire a lock on a directory.
 * This does not use the real `flock`, but uses a file.
 * @returns a disposable if the lock could be acquired or null if it could not.
 */
async function tryAcquireLock(logService: ILogService, filename: string, isSecondAttempt: boolean): Promise<Lock | null> {
	try {
		const contents: ILockfileContents = {
			pid: process.pid,
			willReleaseAt: 0
		};
		await Promises.writeFile(filename, JSON.stringify(contents), { flag: 'wx' });
	} catch (err) {
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

interface ILockfileContents {
	pid: number;
	willReleaseAt: number | undefined;
}

/**
 * @returns 0 if the pid cannot be read
 */
async function readLockfileContents(logService: ILogService, filename: string): Promise<ILockfileContents | null> {
	let contents: Buffer;
	try {
		contents = await fs.promises.readFile(filename);
	} catch (err) {
		// cannot read the file
		logService.error(err);
		return null;
	}

	try {
		return JSON.parse(String(contents));
	} catch (err) {
		// cannot parse the file
		logService.error(err);
		return null;
	}
}

/**
 * @returns 0 if the mtime cannot be read
 */
async function readmtime(logService: ILogService, filename: string): Promise<number> {
	let stats: fs.Stats;
	try {
		stats = await fs.promises.stat(filename);
	} catch (err) {
		// cannot read the file stats to check if it is stale or not
		logService.error(err);
		return 0;
	}
	return stats.mtime.getTime();
}

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0); // throws an exception if the process doesn't exist anymore.
		return true;
	} catch (e) {
		return false;
	}
}

async function checkStaleAndTryAcquireLock(logService: ILogService, filename: string): Promise<Lock | null> {
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
			} else {
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

async function tryDeleteAndAcquireLock(logService: ILogService, filename: string): Promise<Lock | null> {
	logService.info(`Lock '${filename}': Deleting a stale lock.`);
	try {
		await fs.promises.unlink(filename);
	} catch (err) {
		// cannot delete the file
		// maybe the file is already deleted
	}
	return tryAcquireLock(logService, filename, true);
}
