/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { dirname } from '../../../base/common/path.js';
import { isWindows } from '../../../base/common/platform.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IArtifactIntegrationStorage } from '../common/artifactRuntime.js';

export class FileArtifactIntegrationStorage implements IArtifactIntegrationStorage {
	private value: string | undefined;

	constructor(private readonly resource: URI | undefined) {
		if (resource && resource.scheme !== Schemas.file) {
			throw new Error('Artifact file storage requires a local file URI');
		}
	}

	async read(): Promise<string | undefined> {
		if (!this.resource) {
			return this.value;
		}
		try {
			return await fs.readFile(this.resource.fsPath, 'utf8');
		} catch (error) {
			if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
				return undefined;
			}
			throw error;
		}
	}

	async write(value: string): Promise<void> {
		if (!this.resource) {
			this.value = value;
			return;
		}
		const path = this.resource.fsPath;
		await fs.mkdir(dirname(path), { recursive: true });
		const temporary = `${path}.${generateUuid()}.tmp`;
		let renamed = false;
		try {
			const handle = await fs.open(temporary, 'wx', 0o600);
			try {
				await handle.writeFile(value, 'utf8');
				await handle.sync();
			} finally {
				await handle.close();
			}
			await fs.rename(temporary, path);
			renamed = true;
			if (!isWindows) {
				const directory = await fs.open(dirname(path), 'r');
				try {
					await directory.sync();
				} finally {
					await directory.close();
				}
			}
		} catch (error) {
			if (!renamed) {
				try {
					await fs.unlink(temporary);
				} catch (cleanupError) {
					if (!cleanupError || typeof cleanupError !== 'object' || !('code' in cleanupError) || cleanupError.code !== 'ENOENT') {
						throw new AggregateError([error, cleanupError], 'Artifact ledger write and temporary-file cleanup failed');
					}
				}
			}
			throw error;
		}
	}
}
