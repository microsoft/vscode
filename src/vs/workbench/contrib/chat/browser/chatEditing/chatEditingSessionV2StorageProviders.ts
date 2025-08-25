/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import {
	IStorageProvider,
	IStorageProviderStats
} from './chatEditingSessionV2.js';

// ============================================================================
// STORAGE PROVIDERS
// ============================================================================

/**
 * File-based storage provider for chat editing sessions.
 */
export class FileStorageProvider implements IStorageProvider {
	private readonly _disposables = new DisposableStore();
	private _initialized = false;
	private readonly _baseUri: URI;

	constructor(
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		baseUri: URI
	) {
		this._baseUri = baseUri;
	}

	async initialize(): Promise<void> {
		if (this._initialized) {
			return;
		}

		try {
			// Ensure base directory exists
			await this._fileService.createFolder(this._baseUri);
			this._initialized = true;
			this._logService.debug('FileStorageProvider initialized', this._baseUri.toString());
		} catch (error) {
			this._logService.error('Failed to initialize FileStorageProvider', error);
			throw error;
		}
	}

	async store(key: string, data: any): Promise<void> {
		await this._ensureInitialized();

		try {
			const uri = this._getKeyUri(key);
			const content = JSON.stringify(data, null, 2);
			const buffer = VSBuffer.fromString(content);

			await this._fileService.writeFile(uri, buffer);
			this._logService.trace('Stored data for key', key);
		} catch (error) {
			this._logService.error('Failed to store data', key, error);
			throw error;
		}
	}

	async retrieve(key: string): Promise<any | null> {
		await this._ensureInitialized();

		try {
			const uri = this._getKeyUri(key);
			const exists = await this._fileService.exists(uri);

			if (!exists) {
				return null;
			}

			const content = await this._fileService.readFile(uri);
			const data = JSON.parse(content.value.toString());
			this._logService.trace('Retrieved data for key', key);
			return data;
		} catch (error) {
			this._logService.error('Failed to retrieve data', key, error);
			return null;
		}
	}

	async delete(key: string): Promise<void> {
		await this._ensureInitialized();

		try {
			const uri = this._getKeyUri(key);
			const exists = await this._fileService.exists(uri);

			if (exists) {
				await this._fileService.del(uri);
				this._logService.trace('Deleted data for key', key);
			}
		} catch (error) {
			this._logService.error('Failed to delete data', key, error);
			throw error;
		}
	}

	async list(pattern?: string): Promise<string[]> {
		await this._ensureInitialized();

		try {
			const stat = await this._fileService.resolve(this._baseUri);
			const keys: string[] = [];

			if (stat.children) {
				for (const child of stat.children) {
					if (child.isFile && child.name.endsWith('.json')) {
						const key = child.name.slice(0, -5); // Remove .json extension
						if (!pattern || key.includes(pattern)) {
							keys.push(key);
						}
					}
				}
			}

			this._logService.trace('Listed keys', keys.length, pattern);
			return keys;
		} catch (error) {
			this._logService.error('Failed to list keys', error);
			return [];
		}
	}

	async getStats(): Promise<IStorageProviderStats> {
		await this._ensureInitialized();

		try {
			const keys = await this.list();
			let totalSize = 0;

			for (const key of keys) {
				const uri = this._getKeyUri(key);
				const stat = await this._fileService.resolve(uri);
				totalSize += stat.size || 0;
			}

			return {
				totalKeys: keys.length,
				totalSize,
				providerType: 'file'
			};
		} catch (error) {
			this._logService.error('Failed to get storage stats', error);
			return {
				totalKeys: 0,
				totalSize: 0,
				providerType: 'file'
			};
		}
	}

	async cleanup(): Promise<void> {
		// File cleanup would be handled by a separate maintenance task
		this._logService.debug('FileStorageProvider cleanup called');
	}

	supportsCompression(): boolean {
		return true;
	}

	async dispose(): Promise<void> {
		this._disposables.dispose();
		this._logService.debug('FileStorageProvider disposed');
	}

	private async _ensureInitialized(): Promise<void> {
		if (!this._initialized) {
			await this.initialize();
		}
	}

	private _getKeyUri(key: string): URI {
		return URI.joinPath(this._baseUri, `${key}.json`);
	}
}

/**
 * In-memory storage provider for testing and temporary storage.
 */
export class MemoryStorageProvider implements IStorageProvider {
	private readonly _storage = new Map<string, any>();

	async initialize(): Promise<void> {
		// Memory storage doesn't need initialization
	}

	async store(key: string, data: any): Promise<void> {
		this._storage.set(key, JSON.parse(JSON.stringify(data))); // Deep clone
	}

	async retrieve(key: string): Promise<any | null> {
		const data = this._storage.get(key);
		return data ? JSON.parse(JSON.stringify(data)) : null; // Deep clone
	}

	async delete(key: string): Promise<void> {
		this._storage.delete(key);
	}

	async list(pattern?: string): Promise<string[]> {
		const keys = Array.from(this._storage.keys());
		return pattern ? keys.filter(key => key.includes(pattern)) : keys;
	}

	async getStats(): Promise<IStorageProviderStats> {
		const totalKeys = this._storage.size;
		let totalSize = 0;

		for (const value of this._storage.values()) {
			totalSize += JSON.stringify(value).length;
		}

		return {
			totalKeys,
			totalSize,
			providerType: 'memory'
		};
	}

	async cleanup(): Promise<void> {
		// No cleanup needed for memory storage
	}

	supportsCompression(): boolean {
		return false;
	}

	async dispose(): Promise<void> {
		this._storage.clear();
	}
}

/**
 * VSCode storage service-based provider for lightweight data.
 */
export class VSCodeStorageProvider implements IStorageProvider {
	private readonly _keyPrefix = 'chatEditingV2';

	constructor(
		private readonly _storageService: IStorageService,
		private readonly _logService: ILogService
	) { }

	async initialize(): Promise<void> {
		this._logService.debug('VSCodeStorageProvider initialized');
	}

	async store(key: string, data: any): Promise<void> {
		try {
			const storageKey = this._getStorageKey(key);
			const content = JSON.stringify(data);
			this._storageService.store(storageKey, content, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			this._logService.trace('Stored data in VSCode storage', key);
		} catch (error) {
			this._logService.error('Failed to store data in VSCode storage', key, error);
			throw error;
		}
	}

	async retrieve(key: string): Promise<any | null> {
		try {
			const storageKey = this._getStorageKey(key);
			const content = this._storageService.get(storageKey, StorageScope.WORKSPACE);

			if (!content) {
				return null;
			}

			const data = JSON.parse(content);
			this._logService.trace('Retrieved data from VSCode storage', key);
			return data;
		} catch (error) {
			this._logService.error('Failed to retrieve data from VSCode storage', key, error);
			return null;
		}
	}

	async delete(key: string): Promise<void> {
		try {
			const storageKey = this._getStorageKey(key);
			this._storageService.remove(storageKey, StorageScope.WORKSPACE);
			this._logService.trace('Deleted data from VSCode storage', key);
		} catch (error) {
			this._logService.error('Failed to delete data from VSCode storage', key, error);
			throw error;
		}
	}

	async list(pattern?: string): Promise<string[]> {
		// VSCode storage doesn't have a native list operation
		// This would require maintaining an index
		this._logService.warn('List operation not efficiently supported by VSCodeStorageProvider');
		return [];
	}

	async getStats(): Promise<IStorageProviderStats> {
		return {
			totalKeys: 0, // Can't efficiently determine this
			totalSize: 0, // Can't efficiently determine this
			providerType: 'vscode-storage'
		};
	}

	async cleanup(): Promise<void> {
		// Cleanup would require listing all keys, which is not efficient
		this._logService.debug('VSCodeStorageProvider cleanup called');
	}

	supportsCompression(): boolean {
		return false;
	}

	async dispose(): Promise<void> {
		this._logService.debug('VSCodeStorageProvider disposed');
	}

	private _getStorageKey(key: string): string {
		return `${this._keyPrefix}.${key}`;
	}
}
