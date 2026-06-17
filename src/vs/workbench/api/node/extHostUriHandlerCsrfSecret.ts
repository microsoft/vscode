/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostUriHandlerCsrfSecret } from '../common/extHostUriHandlerCsrfSecret.js';

const SECRET_BYTES = 32;

/**
 * Node CSRF secret store: a persistent, owner-only file of high-entropy random bytes, created on
 * first use (by VS Code or a cooperating same-user tool) and never rotated.
 */
export class NodeExtHostUriHandlerCsrfSecret implements IExtHostUriHandlerCsrfSecret {
	declare readonly _serviceBrand: undefined;

	constructor(@ILogService private readonly logService: ILogService) { }

	async getSecret(secretFile: URI, create: boolean = true): Promise<Uint8Array | undefined> {
		const path = secretFile.fsPath;

		if (create) {
			try {
				await this.ensureCreated(path);
			} catch (err) {
				this.logService.error(`[uri-csrf] failed to create secret file at ${path}`, err);
				return undefined;
			}
		}

		try {
			// Reject a group/other-writable secret (POSIX) — another user could replace it and forge.
			// Read access is allowed; no local file is web-readable regardless.
			const stat = await fs.stat(path);
			if (process.platform !== 'win32' && (stat.mode & 0o022) !== 0) {
				this.logService.warn(`[uri-csrf] secret file ${path} is group/other-writable (mode ${(stat.mode & 0o777).toString(8)}); refusing to trust it`);
				return undefined;
			}
			const data = await fs.readFile(path);
			if (data.length < SECRET_BYTES) {
				this.logService.warn(`[uri-csrf] secret file ${path} is too short; refusing to trust it`);
				return undefined;
			}
			return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
		} catch (err) {
			// An absent file in read-only mode is the normal "not this host" case — don't log it.
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
				this.logService.error(`[uri-csrf] failed to read secret file at ${path}`, err);
			}
			return undefined;
		}
	}

	private async ensureCreated(path: string): Promise<void> {
		try {
			await this.writeAtomically(path);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
				await this.writeAtomically(path);
				return;
			}
			throw err;
		}
	}

	// Write to a temp file in the same dir, then atomically link it into place so `path` never appears
	// partially written. `link` fails with EEXIST if the secret exists, preserving first-writer-wins.
	private async writeAtomically(path: string): Promise<void> {
		const tmp = join(dirname(path), `.uri-csrf.${randomBytes(8).toString('hex')}.tmp`);
		await fs.writeFile(tmp, randomBytes(SECRET_BYTES), { mode: 0o600, flag: 'wx' });
		try {
			await fs.link(tmp, path);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw err;
			}
		} finally {
			await fs.unlink(tmp).catch(() => undefined);
		}
	}
}
