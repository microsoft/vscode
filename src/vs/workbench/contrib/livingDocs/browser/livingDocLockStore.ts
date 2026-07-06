/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { basename, dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { emptyLock, ILivingDocLock, LOCK_VERSION } from '../common/livingDocsModel.js';

// The read/write seam for a document's lock file. The spike persists it as a sibling
// `<doc>.lock.json`; production will platform-store it. Keeping this behind a small interface makes
// that swap trivial - nothing else in the service knows where the lock lives.
export interface ILockStore {
	read(doc: URI): Promise<ILivingDocLock | undefined>;
	write(doc: URI, lock: ILivingDocLock): Promise<void>;
}

/** The bind/influence graph as written to a sibling `<doc>.lock.json` for a `<doc>.md`. */
export function lockUriFor(doc: URI): URI {
	const stem = basename(doc).replace(/\.md$/, '');
	return joinPath(dirname(doc), `${stem}.lock.json`);
}

// Normalize a parsed JSON object into a complete lock, tolerating older/partial files.
function coerceLock(raw: Partial<ILivingDocLock> | undefined): ILivingDocLock {
	const lock = emptyLock();
	if (!raw) { return lock; }
	if (typeof raw.version === 'number') { lock.version = raw.version; }
	if (raw.bindings) { lock.bindings = raw.bindings; }
	if (raw.context) { lock.context = raw.context; }
	if (raw.claims) { lock.claims = raw.claims; }
	if (Array.isArray(raw.pins)) { lock.pins = raw.pins; }
	if (Array.isArray(raw.audit)) { lock.audit = raw.audit; }
	if (Array.isArray(raw.contextItems)) { lock.contextItems = raw.contextItems; }
	if (Array.isArray(raw.snapshots)) { lock.snapshots = raw.snapshots; }
	return lock;
}

export class SidecarLockStore implements ILockStore {
	constructor(private readonly _files: IFileService) { }

	async read(doc: URI): Promise<ILivingDocLock | undefined> {
		try {
			const text = (await this._files.readFile(lockUriFor(doc))).value.toString();
			return coerceLock(JSON.parse(text) as Partial<ILivingDocLock>);
		} catch {
			// No lock yet (or unreadable/corrupt): the caller rebuilds it from the sources.
			return undefined;
		}
	}

	async write(doc: URI, lock: ILivingDocLock): Promise<void> {
		lock.version = LOCK_VERSION;
		await this._files.writeFile(lockUriFor(doc), VSBuffer.fromString(JSON.stringify(lock, null, 2) + '\n'));
	}
}
