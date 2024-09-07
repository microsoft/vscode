/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { Memento } from 'vscode';

interface CacheEntry {
	etag: string;
	fileName: string;
	updateTime: number;
}

interface CacheInfo {
	[schemaUri: string]: CacheEntry;
}

const MEMENTO_KEY = 'json-schema-cache';

export class JSONSchemaCache {
	private cacheInfo: CacheInfo;

	constructor(private readonly schemaCacheLocation: string, private readonly globalState: Memento) {
		const infos = globalState.get<CacheInfo>(MEMENTO_KEY, {}) as CacheInfo;
		const validated: CacheInfo = {};
		for (const schemaUri in infos) {
			const { etag, fileName, updateTime } = infos[schemaUri];
			if (typeof etag === 'string' && typeof fileName === 'string' && typeof updateTime === 'number') {
				validated[schemaUri] = { etag, fileName, updateTime };
			}
		}
		this.cacheInfo = validated;
	}

	getETag(schemaUri: string): string | undefined {
		return this.cacheInfo[schemaUri]?.etag;
	}

	getLastUpdatedInHours(schemaUri: string): number | undefined {
		const updateTime = this.cacheInfo[schemaUri]?.updateTime;
		if (updateTime !== undefined) {
			return (new Date().getTime() - updateTime) / 1000 / 60 / 60;
		}
		return undefined;
	}

	async putSchema(schemaUri: string, etag: string, schemaContent: string): Promise<void> {
		try {
			const fileName = getCacheFileName(schemaUri);
			await fs.writeFile(path.join(this.schemaCacheLocation, fileName), schemaContent);
			const entry: CacheEntry = { etag, fileName, updateTime: new Date().getTime() };
			this.cacheInfo[schemaUri] = entry;
		} catch (e) {
			delete this.cacheInfo[schemaUri];
		} finally {
			await this.updateMemento();
		}
	}

	async getSchemaIfUpdatedSince(schemaUri: string, expirationDurationInHours: number): Promise<string | undefined> {
		const lastUpdatedInHours = this.getLastUpdatedInHours(schemaUri);
		if (lastUpdatedInHours !== undefined && (lastUpdatedInHours < expirationDurationInHours)) {
			return this.loadSchemaFile(schemaUri, this.cacheInfo[schemaUri], false);
		}
		return undefined;
	}

	async getSchema(schemaUri: string, etag: string, etagValid: boolean): Promise<string | undefined> {
		const cacheEntry = this.cacheInfo[schemaUri];
		if (cacheEntry) {
			if (cacheEntry.etag === etag) {
				return this.loadSchemaFile(schemaUri, cacheEntry, etagValid);
			} else {
				this.deleteSchemaFile(schemaUri, cacheEntry);
			}
		}
		return undefined;
	}

	private async loadSchemaFile(schemaUri: string, cacheEntry: CacheEntry, isUpdated: boolean): Promise<string | undefined> {
		const cacheLocation = path.join(this.schemaCacheLocation, cacheEntry.fileName);
		try {
			const content = (await fs.readFile(cacheLocation)).toString();
			if (isUpdated) {
				cacheEntry.updateTime = new Date().getTime();
			}
			return content;
		} catch (e) {
			delete this.cacheInfo[schemaUri];
			return undefined;
		} finally {
			await this.updateMemento();
		}
	}

	private async deleteSchemaFile(schemaUri: string, cacheEntry: CacheEntry): Promise<void> {
		const cacheLocation = path.join(this.schemaCacheLocation, cacheEntry.fileName);
		delete this.cacheInfo[schemaUri];
		await this.updateMemento();
		try {
			await fs.rm(cacheLocation);
		} catch (e) {
			// ignore
		}
	}


	// for debugging
	public getCacheInfo() {
		return this.cacheInfo;
	}

	private async updateMemento() {
		try {
			await this.globalState.update(MEMENTO_KEY, this.cacheInfo);
		} catch (e) {
			// ignore
		}
	}

	public async clearCache(): Promise<string[]> {
		const uris = Object.keys(this.cacheInfo);
		try {
			const files = await fs.readdir(this.schemaCacheLocation);
			for (const file of files) {
				try {
					await fs.unlink(path.join(this.schemaCacheLocation, file));
				} catch (_e) {
					// ignore
				}
			}
		} catch (e) {
			// ignore
		} finally {

			this.cacheInfo = {};
			await this.updateMemento();
		}
		return uris;
	}
}
function getCacheFileName(uri: string): string {
	return `${createHash('sha256').update(uri).digest('hex')}.schema.json`;
}
