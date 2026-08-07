/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Memento, Uri } from 'vscode';
import { VSBuffer } from '../../../util/vs/base/common/buffer';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { fileSystemServiceReadAsJSON, IFileSystemService } from '../../filesystem/common/fileSystemService';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { IWorkbenchService } from '../../workbench/common/workbenchService';
import { Embedding, EmbeddingType, EmbeddingVector, getWellKnownEmbeddingTypeInfo, IEmbeddingsComputer, LEGACY_EMBEDDING_MODEL_ID, rankEmbeddings } from './embeddingsComputer';

interface EmbeddingsIndex<K, V> {
	hasItem(value: K): boolean;
	isIndexLoaded: boolean;
	nClosestValues(embedding: Embedding, n: number): V[];
}

type EmbeddingCacheEntries = { [key: string]: { embedding: EmbeddingVector } };
interface EmbeddingCacheEntriesWithExtensions {
	core: EmbeddingCacheEntries;
	extensions: { [key: string]: EmbeddingCacheEntries };
}

export enum RemoteCacheType {
	Settings = 'settings',
	Commands = 'commands',
	Api = 'api',
	Extensions = 'extensions',
	ProjectTemplates = 'project-templates',
	Tools = 'tools'
}

// These values are the blob storage container names where we publish computed embeddings
enum RemoteEmbeddingsContainer {
	TEXT3SMALL = 'text-3-small',
	METIS_1024_I16_BINARY = 'metis-1024-I16-Binary'
}

function embeddingsModelToRemoteContainer(embeddingType: EmbeddingType): RemoteEmbeddingsContainer {
	switch (getWellKnownEmbeddingTypeInfo(embeddingType)?.model) {
		case LEGACY_EMBEDDING_MODEL_ID.Metis_I16_Binary:
			return RemoteEmbeddingsContainer.METIS_1024_I16_BINARY;

		case LEGACY_EMBEDDING_MODEL_ID.TEXT3SMALL:
		default:
			return RemoteEmbeddingsContainer.TEXT3SMALL;
	}
}

export enum EmbeddingCacheType {
	GLOBAL = 1,
	WORKSPACE = 2,
}


class EmbeddingsCache {
	private readonly cacheVersionKey: string;

	constructor(
		private readonly cacheType: EmbeddingCacheType,
		private readonly cacheKey: string,
		protected readonly cacheVersion: string,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext
	) {
		this.cacheVersionKey = `${cacheKey}-version`;
	}

	public get cacheStorageUri(): Uri | undefined {
		return this.cacheType === EmbeddingCacheType.WORKSPACE
			? this.extensionContext.storageUri
			: this.extensionContext.globalStorageUri;
	}

	public get cacheVersionMementoStorage(): Memento {
		return this.cacheType === EmbeddingCacheType.WORKSPACE
			? this.extensionContext.workspaceState
			: this.extensionContext.globalState;
	}

	public async updateCache<T = EmbeddingCacheEntries>(value: T | undefined) {
		if (!this.cacheStorageUri || value === undefined) {
			return;
		}
		// Cannot write to readonly file system
		if (!this.fileSystemService.isWritableFileSystem(this.cacheStorageUri.scheme)) {
			return;
		}
		// Create directory at stoageUri if it doesn't exist
		try {
			await this.fileSystemService.stat(this.cacheStorageUri);
		} catch (e) {
			if (e.code === 'ENOENT') {
				// Directory doesn't exist we should create it
				await this.fileSystemService.createDirectory(this.cacheStorageUri);
			}
		}
		// Update cache version
		await this.cacheVersionMementoStorage.update(this.cacheVersionKey, this.cacheVersion);
		const cacheFile = URI.joinPath(this.cacheStorageUri, `${this.cacheKey}.json`);
		try {
			await this.fileSystemService.writeFile(cacheFile, VSBuffer.fromString(JSON.stringify(value)).buffer);
		} catch (e) {
			if (value !== undefined) {
				console.error(`Failed to write embeddings cache to ${cacheFile}`);
			}
		}
	}

	public async getCache<T = EmbeddingCacheEntries>(): Promise<T | undefined> {
		if (!this.cacheStorageUri) {
			return;
		}
		const cacheVersion = this.cacheVersionMementoStorage.get<string>(this.cacheVersionKey);

		if (cacheVersion !== this.cacheVersion) {
			return undefined;
		}
		try {
			const cacheEntries: any = await fileSystemServiceReadAsJSON.readJSON<T>(this.fileSystemService, URI.joinPath(this.cacheStorageUri, `${this.cacheKey}.json`));
			if (this.isEmbeddingCacheEntriesType(cacheEntries)) {
				// If the cache is of the type EmbeddingCacheEntriesWithExtensions (during tests), we need to flatten it
				return this.constructExposedCache(cacheEntries as EmbeddingCacheEntriesWithExtensions) as T;
			}

			return cacheEntries as T;

		} catch {
			return undefined;
		}
	}

	public async clearCache() {
		if (!this.cacheStorageUri) {
			return;
		}

		const hasOldCache = this.cacheVersionMementoStorage.get(this.cacheKey);
		if (hasOldCache) {
			await this.cacheVersionMementoStorage.update(this.cacheKey, undefined);
		}

		const cacheFile = URI.joinPath(this.cacheStorageUri, `${this.cacheKey}.json`);
		try {
			await this.fileSystemService.stat(this.cacheStorageUri);
			await this.fileSystemService.delete(cacheFile, { useTrash: false });
		} catch (e) {
			if (e.code === 'ENOENT') {
				throw new Error(`Cache file ${cacheFile} does not exist`);
			}
		}
	}

	private isEmbeddingCacheEntriesType(cache: EmbeddingCacheEntries | EmbeddingCacheEntriesWithExtensions) {
		return cache.core !== undefined && cache.extensions !== undefined;
	}

	private constructExposedCache(cache: EmbeddingCacheEntriesWithExtensions): EmbeddingCacheEntries | undefined {
		const flattenedCache: EmbeddingCacheEntries = { ...cache.core };
		for (const extensionId in cache.extensions) {
			const extensionCache = cache.extensions[extensionId];
			for (const key in extensionCache) {
				flattenedCache[key] = extensionCache[key];
			}
		}
		return flattenedCache;
	}

}

export interface IEmbeddingsCache {
	readonly embeddingType: EmbeddingType;

	getCache<T = EmbeddingCacheEntries>(): Promise<T | undefined>;
	clearCache(): Promise<void>;
}

/**
 * A local cache which caches information on disk.
 */
export class LocalEmbeddingsCache implements IEmbeddingsCache {

	private readonly _embeddingsCache: EmbeddingsCache;
	constructor(
		cacheType: EmbeddingCacheType,
		private readonly cacheKey: string,
		private readonly cacheVersion: string,
		public readonly embeddingType: EmbeddingType,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._embeddingsCache = instantiationService.createInstance(
			EmbeddingsCache,
			cacheType,
			cacheKey,
			cacheVersion
		);
	}

	public async getCache<T = EmbeddingCacheEntries>(): Promise<T | undefined> {
		const cacheEntries: any = await this._embeddingsCache.getCache();
		if (cacheEntries === undefined) {
			throw new Error(`Failed to get cache for ${this.cacheKey}, version ${this.cacheVersion}`);
		}
		return cacheEntries;
	}

	clearCache(): Promise<void> {
		return this._embeddingsCache.clearCache();
	}
}

/**
 * An embeddings cache which fetches embeddings from a remote CDN.
 * It is limited to one remote file
 */
export class RemoteEmbeddingsCache implements IEmbeddingsCache {
	private _remoteCacheEntries: EmbeddingCacheEntries | undefined;
	private readonly remoteCacheVersionKey: string;

	private _remoteCacheURL: string | undefined;
	private _remoteCacheLatestUpdateURL: string | undefined;
	protected embeddingsCache: EmbeddingsCache;

	constructor(
		cacheType: EmbeddingCacheType,
		cacheKey: string,
		protected readonly cacheVersion: string,
		public readonly embeddingType: EmbeddingType,
		protected readonly remoteCacheType: RemoteCacheType,
		@IFetcherService protected readonly fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.embeddingsCache = instantiationService.createInstance(
			EmbeddingsCache,
			cacheType,
			cacheKey,
			cacheVersion
		);
		this.remoteCacheVersionKey = `${cacheKey}-version-remote`;
	}

	async clearCache(): Promise<void> {
		await this.embeddingsCache.clearCache();
	}

	protected async getRemoteContainer(): Promise<RemoteEmbeddingsContainer> {
		return embeddingsModelToRemoteContainer(this.embeddingType);
	}

	private async getRemoteCacheURL(): Promise<string> {
		if (!this._remoteCacheURL) {
			const remoteCacheContainer = await this.getRemoteContainer();
			this._remoteCacheURL = RemoteEmbeddingsCache.calculateRemoteCDNURL(remoteCacheContainer, this.remoteCacheType, this.cacheVersion);
		}
		return this._remoteCacheURL!;
	}

	private async getRemoteCacheLatestUpdateURL(): Promise<string> {
		if (!this._remoteCacheLatestUpdateURL) {
			const remoteCacheContainer = await this.getRemoteContainer();
			this._remoteCacheLatestUpdateURL = RemoteEmbeddingsCache.calculateRemoteCDNLatestURL(remoteCacheContainer, this.remoteCacheType, this.cacheVersion);
		}
		return this._remoteCacheLatestUpdateURL!;
	}

	protected async fetchRemoteCache(): Promise<EmbeddingCacheEntries | undefined> {
		if (this._remoteCacheEntries) {
			return this._remoteCacheEntries;
		}
		const remoteCacheURL = await this.getRemoteCacheURL();
		try {
			const remoteCacheURL = await this.getRemoteCacheURL();
			const response = await this.fetcherService.fetch(remoteCacheURL, { method: 'GET', callSite: 'embeddings-remote-cache' });
			if (response.ok) {
				this._remoteCacheEntries = (await response.json()) as EmbeddingCacheEntries;
				return this._remoteCacheEntries;
			} else {
				console.error(`Failed to fetch remote embeddings cache from ${remoteCacheURL}`);
				console.error(`Response status: ${response.status}, status text: ${response.statusText}`);
				return;
			}
		} catch (err) {
			console.error(`Failed to fetch remote embeddings cache from ${remoteCacheURL}`);
			console.error(err);
			return;
		}
	}

	protected async fetchRemoteCacheLatest(): Promise<string | undefined> {
		const remoteCacheLatestUpdateURL = await this.getRemoteCacheLatestUpdateURL();
		try {
			const response = await this.fetcherService.fetch(remoteCacheLatestUpdateURL, { method: 'GET', callSite: 'embeddings-remote-cache-latest' });
			if (response.ok) {
				return response.text();
			} else {
				console.error(`Failed to fetch remote embeddings cache from ${remoteCacheLatestUpdateURL}`);
				console.error(`Response status: ${response.status}, status text: ${response.statusText}`);
				return;
			}
		} catch (err) {
			console.error(`Failed to fetch remote embeddings cache from ${remoteCacheLatestUpdateURL}`);
			console.error(err);
			return;
		}
	}

	public async getCache<T = EmbeddingCacheEntries>(): Promise<T | undefined> {
		const remoteCacheLatest = await this.fetchRemoteCacheLatest();
		const cache = await this.embeddingsCache.getCache();
		// If the cache exists and the remote cache version is a match,
		// it means it is the latest version and we can return it,
		// otherwise we will fetch again the remote cache
		if (cache && remoteCacheLatest === this.embeddingsCache.cacheVersionMementoStorage.get<string>(this.remoteCacheVersionKey)) {
			return cache as T;
		}
		const remoteCache = await this.fetchRemoteCache();
		if (remoteCache === undefined) {
			// fallback to previous local cache if remote cache is unavailable
			return cache as T;
		}

		await this.embeddingsCache.clearCache();
		await this.embeddingsCache.cacheVersionMementoStorage.update(this.remoteCacheVersionKey, remoteCacheLatest);
		await this.embeddingsCache.updateCache(remoteCache);
		return remoteCache as T;
	}

	static calculateRemoteCDNURL(cacheContainer: RemoteEmbeddingsContainer, embeddingsType: RemoteCacheType, cacheVersion: string): string {
		return `https://embeddings.vscode-cdn.net/${cacheContainer}/v${cacheVersion}/${embeddingsType}/core.json`;
	}

	static calculateRemoteCDNLatestURL(cacheContainer: RemoteEmbeddingsContainer, embeddingsType: RemoteCacheType, cacheVersion: string): string {
		return `https://embeddings.vscode-cdn.net/${cacheContainer}/v${cacheVersion}/${embeddingsType}/latest.txt`;
	}
}

/**
 * A remote cache which is also aware of installed extensions and updates properly when they are updated, installed, or uninstalled
 * Internally we use a nested structure which breaks down core, and each extension id for better perf.
 * Externally a flattened cache with all values on the same level is exposed for easier consumption and to conform to the other cache interfaces.
 * When updating the cache we use the internal structure rather than the flatten one because the flattened on is only for external consumption.
 */
export class RemoteEmbeddingsExtensionCache extends RemoteEmbeddingsCache {
	// This is a nested structure used to help us do just patching of updated extensions
	private _remoteExtensionCache: EmbeddingCacheEntriesWithExtensions | undefined;
	private _baseExtensionCDNURL: string | undefined;

	constructor(
		cacheType: EmbeddingCacheType,
		cacheKey: string,
		cacheVersion: string,
		embeddingType: EmbeddingType,
		remoteCacheType: RemoteCacheType,
		@IFetcherService fetcher: IFetcherService,
		@IWorkbenchService private readonly workbenchService: IWorkbenchService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(cacheType, cacheKey, cacheVersion, embeddingType, remoteCacheType, fetcher, instantiationService);
	}

	private async getBaseExtensionCDNURL(): Promise<string> {
		if (!this._baseExtensionCDNURL) {
			const remoteCacheContainer = await this.getRemoteContainer();
			this._baseExtensionCDNURL = RemoteEmbeddingsExtensionCache.calculateBaseRemoteExtensionCDNURL(remoteCacheContainer, this.remoteCacheType, this.cacheVersion);
		}
		return this._baseExtensionCDNURL!;
	}

	private constructExposedCache(): EmbeddingCacheEntries | undefined {
		if (!this._remoteExtensionCache) {
			return;
		}
		const flattenedCache: EmbeddingCacheEntries = { ...this._remoteExtensionCache.core };
		for (const extensionId in this._remoteExtensionCache.extensions) {
			const extensionCache = this._remoteExtensionCache.extensions[extensionId];
			for (const key in extensionCache) {
				flattenedCache[key] = extensionCache[key];
			}
		}
		return flattenedCache;
	}

	private async fetchRemoteExtensionCache(extensionId: string): Promise<EmbeddingCacheEntries | undefined> {
		const baseExtensionCDNURL = await this.getBaseExtensionCDNURL();
		const extensionUrl = `${baseExtensionCDNURL}/${extensionId}.json`;
		try {
			const response = await this.fetcherService.fetch(extensionUrl, { method: 'GET', callSite: 'embeddings-extension-cache' });
			if (response.ok) {
				return (await response.json()) as EmbeddingCacheEntries;
			} else {
				if (response.status === 404) {
					// The file doesn't exist on our CDN return an empty object so we don't try to fetch it again
					return {};
				}
				console.error(`Failed to fetch remote embeddings cache from ${extensionUrl}`);
				console.error(`Response status: ${response.status}, status text: ${response.statusText}`);
				return;
			}
		} catch (err) {
			console.error(`Failed to fetch remote embeddings cache from ${extensionUrl}`);
			console.error(err);
			return;
		}
	}

	public override async getCache<T = EmbeddingCacheEntries>(): Promise<T | undefined> {
		const coreOrLocalCache = await super.getCache<EmbeddingCacheEntries | EmbeddingCacheEntriesWithExtensions>();
		// The remote cache for core coming back unavaiable indicates request problems so we cannot continue with fetching extensions
		if (coreOrLocalCache === undefined) {
			return;
		}
		let currentCache: EmbeddingCacheEntriesWithExtensions = { core: {}, extensions: {} };
		// Check if the cache has a property 'core' as the RemoteCachewithExtensions has it
		if (
			coreOrLocalCache &&
			RemoteEmbeddingsExtensionCache.isEmbeddingsCacheEntriesWithExtensions(coreOrLocalCache)
		) {
			currentCache = coreOrLocalCache;
		} else {
			currentCache = { core: coreOrLocalCache, extensions: {} };
		}

		const activatedExtensionIds = RemoteEmbeddingsExtensionCache.getInstalledExtensionIds(this.workbenchService);
		let removedExtensions = false;
		// Remove any extensions from currentCache which aren't in activatedExtensionIds
		for (const extensionId in currentCache.extensions) {
			if (!activatedExtensionIds.includes(extensionId)) {
				delete currentCache.extensions[extensionId];
				removedExtensions = true;
			}
		}
		const extensionIdsToFetch = activatedExtensionIds.filter(
			id => !(id in currentCache.extensions) || currentCache.extensions[id] === undefined
		);

		for (const extensionId of extensionIdsToFetch) {
			const extensionCache = await this.fetchRemoteExtensionCache(extensionId);
			if (extensionCache) {
				currentCache.extensions[extensionId] = extensionCache;
			}
		}

		this._remoteExtensionCache = currentCache;
		if (extensionIdsToFetch.length > 0 || removedExtensions) {
			await this.embeddingsCache.clearCache();
			await this.embeddingsCache.updateCache(currentCache);
		}

		return this.constructExposedCache() as T;
	}

	static isEmbeddingsCacheEntriesWithExtensions(obj: any): obj is EmbeddingCacheEntriesWithExtensions {
		return 'core' in obj && 'extensions' in obj;
	}

	static getInstalledExtensionIds(workbenchService: IWorkbenchService): string[] {
		return workbenchService.getAllExtensions().filter(e => !e.id.startsWith('vscode')).map(e => e.id);
	}

	static calculateBaseRemoteExtensionCDNURL(cacheContainer: RemoteEmbeddingsContainer, embeddingsType: RemoteCacheType, cacheVersion: string): string {
		return `https://embeddings.vscode-cdn.net/${cacheContainer}/v${cacheVersion}/${embeddingsType}`;
	}
}

export abstract class BaseEmbeddingsIndex<V extends { key: string; embedding?: EmbeddingVector }>
	implements EmbeddingsIndex<string, V> {
	protected _items: Map<string, V>;
	private _isIndexLoaded = false;
	private _calculationPromise: Promise<void> | undefined;

	constructor(
		loggerContext: string,
		private readonly embeddingType: EmbeddingType,
		private readonly cacheKey: string,
		private readonly _embeddingsCache: IEmbeddingsCache,
		protected readonly embeddingsComputer: IEmbeddingsComputer,
		protected readonly logService: ILogService,
	) {
		this._items = new Map<string, V>();
	}

	public get isIndexLoaded(): boolean {
		return this._isIndexLoaded;
	}

	protected set isIndexLoaded(value: boolean) {
		this._isIndexLoaded = value;
	}

	public async rebuildCache() {
		await this._embeddingsCache.clearCache();
		this._items.clear();
		return this.calculateEmbeddings();
	}

	/**
	 * Finds the n closest values to a given embedding
	 * @param queryEmbedding The embedding to find the n closest values for
	 * @param n The number of closest values to return
	 * @returns The n closest values to the embedding, sorted by similarity. Could be less than n if there are less than n items indexed
	 */
	public nClosestValues(queryEmbedding: Embedding, n: number): V[] {
		return rankEmbeddings(queryEmbedding, Array.from(this._items.values()).filter(x => x.embedding).map(x => [x, { value: x.embedding!, type: this.embeddingType } satisfies Embedding] as const), n)
			.map(x => x.value);
	}

	public hasItem(key: string): boolean {
		return this._items.has(key);
	}

	public getItem(key: string): V | undefined {
		return this._items.get(key);
	}

	public async calculateEmbeddings(): Promise<void> {
		// This prevents being able to queue many calculations at once since it should always be referring to the same promise
		if (this._calculationPromise) {
			return this._calculationPromise;
		}
		this._calculationPromise = this._calculateEmbeddings();
		return this._calculationPromise.then(() => (this._calculationPromise = undefined));
	}

	private async _calculateEmbeddings(): Promise<void> {
		const startTime = Date.now();
		const allItems: V[] = await this.getLatestItems();
		const cachedEmbeddings = await this._embeddingsCache.getCache();
		// check that the cached embeddings is of flattened format, if not, we need to construct it
		const latestEmbeddingsIndex = new Map<string, V>();
		for (const item of allItems) {
			let newItem = item;
			const oldItem = this._items.get(item.key);
			const key = item.key;
			// We have it in our current index
			if (oldItem?.embedding) {
				newItem = oldItem;
			} else if (cachedEmbeddings && cachedEmbeddings[key]) {
				// We have it in our cache
				newItem = { ...item, ...cachedEmbeddings[key] };
			}

			latestEmbeddingsIndex.set(key, newItem);
		}

		this._items = latestEmbeddingsIndex;

		this.logService.debug(`Embeddings for ${this.cacheKey} calculated in ${Date.now() - startTime}ms`);
		this.isIndexLoaded = true;
	}

	/**
	 * Converts the value into the string that will be used to calculate the embedding
	 * @param value The value to convert to a natural language query
	 * @returns The natural language query
	 */
	protected abstract getEmbeddingQueryString(value: V): string;

	protected abstract getLatestItems(): Promise<V[]>;
}