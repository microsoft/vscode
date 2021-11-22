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
	accessTime: number;
}

interface CacheInfo {
	[schemaUri: string]: CacheEntry;
}

const MEMENTO_KEY = 'json-schema-cache';

export class JSONSchemaCache {
	private readonly cacheInfo: CacheInfo;

	constructor(private readonly schemaCacheLocation: string, private readonly globalState: Memento) {
		this.cacheInfo = globalState.get<CacheInfo>(MEMENTO_KEY, {});
	}

	getETag(schemaUri: string): string | undefined {
		return this.cacheInfo[schemaUri]?.etag;
	}

	async putSchema(schemaUri: string, etag: string, schemaContent: string): Promise<void> {
		try {
			const fileName = getCacheFileName(schemaUri);
			await fs.writeFile(path.join(this.schemaCacheLocation, fileName), schemaContent);
			const entry: CacheEntry = { etag, fileName, accessTime: new Date().getTime() };
			this.cacheInfo[schemaUri] = entry;
		} catch (e) {
			delete this.cacheInfo[schemaUri];
		} finally {
			await this.updateMemento();
		}
	}

	async getSchemaIfAccessedSince(schemaUri: string, expirationDuration: number): Promise<string | undefined> {
		const cacheEntry = this.cacheInfo[schemaUri];
		if (cacheEntry && cacheEntry.accessTime + expirationDuration >= new Date().getTime()) {
			return this.loadSchemaFile(schemaUri, cacheEntry);
		}
		return undefined;
	}

	async getSchema(schemaUri: string, etag: string): Promise<string | undefined> {
		const cacheEntry = this.cacheInfo[schemaUri];
		if (cacheEntry) {
			if (cacheEntry.etag === etag) {
				return this.loadSchemaFile(schemaUri, cacheEntry);
			} else {
				this.deleteSchemaFile(schemaUri, cacheEntry);
			}
		}
		return undefined;
	}

	private async loadSchemaFile(schemaUri: string, cacheEntry: CacheEntry): Promise<string | undefined> {
		const cacheLocation = path.join(this.schemaCacheLocation, cacheEntry.fileName);
		try {
			const content = (await fs.readFile(cacheLocation)).toString();
			cacheEntry.accessTime = new Date().getTime();
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
}
function getCacheFileName(uri: string): string {
	return `${createHash('MD5').update(uri).digest('hex')}.schema.json`;
}
