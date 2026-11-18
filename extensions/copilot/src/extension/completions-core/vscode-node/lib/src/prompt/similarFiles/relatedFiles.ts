/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIgnoreService } from '../../../../../../../platform/ignore/common/ignoreService';
import { createServiceIdentifier } from '../../../../../../../util/common/services';
import { URI } from '../../../../../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CancellationToken as ICancellationToken } from '../../../../types/src';
import { ICompletionsFileSystemService } from '../../fileSystem';
import { LRUCacheMap } from '../../helpers/cache';
import { ICompletionsLogTargetService, Logger } from '../../logger';
import { telemetry, TelemetryWithExp } from '../../telemetry';
import { shortCircuit } from '../../util/shortCircuit';
import { NeighboringFileType } from './neighborFiles';

export interface RelatedFilesDocumentInfo {
	readonly uri: string;
	readonly clientLanguageId: string;
	data?: unknown;
}

interface RelatedFilesTextDocument {
	readonly uri: string;
	readonly clientLanguageId: string;
	readonly detectedLanguageId: string;
}

export type RelatedFilesResponseEntry = {
	type: NeighboringFileType;
	uris: string[];
};

export type RelatedFileTrait = {
	name: string;
	value: string;
	includeInPrompt?: boolean;
	promptTextOverride?: string;
};

export type RelatedFilesResponse = {
	entries: RelatedFilesResponseEntry[];
	traits?: RelatedFileTrait[];
};

type RelatedFiles = {
	entries: RelatedFilesType;
	traits: RelatedFileTrait[];
};

export type RelatedFilesType = Map<NeighboringFileType, Map<string, string>>;

export const EmptyRelatedFilesResponse: RelatedFilesResponse = { entries: [], traits: [] };

const EmptyRelatedFiles: RelatedFiles = {
	entries: new Map<NeighboringFileType, Map<string, string>>(),
	traits: [],
};

type TimestampEntry = { timestamp: number; retryCount: number };
// A map with an expiration time for each key. Keys are removed upon get() time.
// Note: the size() function is not being used, but if it does, be aware that it is
// counting expired keys. This ensures a constant time execution time.
export class PromiseExpirationCacheMap<T> extends LRUCacheMap<string, Promise<T>> {
	// Hold the time an entry is cached the first time. The entries in this map are only removed
	// upon a get() call when the eviction time elapsed.
	_cacheTimestamps: Map<string, TimestampEntry> = new Map();

	constructor(
		size: number,
		private readonly defaultEvictionTimeMs: number = 2 * 60 * 1000 // 2 minutes
	) {
		super(size);
	}

	bumpRetryCount(key: string): number {
		const ts = this._cacheTimestamps.get(key);
		if (ts) {
			return ++ts.retryCount;
		} else {
			this._cacheTimestamps.set(key, { timestamp: Date.now(), retryCount: 0 });
			return 0;
		}
	}

	override has(key: string): boolean {
		if (this.isValid(key)) {
			return super.has(key);
		} else {
			this.deleteExpiredEntry(key);
			return false;
		}
	}

	override get(key: string): Promise<T> | undefined {
		const entry = super.get(key);
		if (this.isValid(key)) {
			return entry;
		} else {
			this.deleteExpiredEntry(key);
			return undefined;
		}
	}

	override set(key: string, value: Promise<T>): this {
		const ret = super.set(key, value);
		if (!this.isValid(key)) {
			this._cacheTimestamps.set(key, { timestamp: Date.now(), retryCount: 0 });
		}
		return ret;
	}

	override clear() {
		super.clear();
		this._cacheTimestamps.clear();
	}

	// A cache entry is considered valid if its lifetime is less than the default cache eviction time.
	private isValid(key: string): boolean {
		const ts = this._cacheTimestamps.get(key);
		return ts !== undefined && Date.now() - ts.timestamp < this.defaultEvictionTimeMs;
	}

	private deleteExpiredEntry(key: string): void {
		if (this._cacheTimestamps.has(key)) {
			this._cacheTimestamps.delete(key);
		}
		super.delete(key);
	}
}

export const relatedFilesLogger = new Logger('relatedFiles');
const lruCacheSize = 1000;

class RelatedFilesProviderFailure extends Error {
	constructor() {
		super('The provider failed providing the list of relatedFiles');
	}
}

export const ICompletionsRelatedFilesProviderService = createServiceIdentifier<ICompletionsRelatedFilesProviderService>('ICompletionsRelatedFilesProviderService');
export interface ICompletionsRelatedFilesProviderService {
	readonly _serviceBrand: undefined;
	getRelatedFilesResponse(
		docInfo: RelatedFilesDocumentInfo,
		telemetryData: TelemetryWithExp,
		cancellationToken: ICancellationToken | undefined
	): Promise<RelatedFilesResponse | undefined>;
	getRelatedFiles(
		docInfo: RelatedFilesDocumentInfo,
		telemetryData: TelemetryWithExp,
		cancellationToken: ICancellationToken | undefined
	): Promise<RelatedFiles | undefined>;
}

/**
 * Class for getting the related files to the current active file (implemented in the extension or the agent).
 */
export abstract class RelatedFilesProvider implements ICompletionsRelatedFilesProviderService {
	declare _serviceBrand: undefined;
	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IIgnoreService protected readonly ignoreService: IIgnoreService,
		@ICompletionsLogTargetService protected readonly logTarget: ICompletionsLogTargetService,
		@ICompletionsFileSystemService protected readonly fileSystemService: ICompletionsFileSystemService,
	) { }

	// Returns the related files for the given document.
	// An exception or `undefined` may be returned if a return value cannot be provided for some reason (e.g. failures).
	abstract getRelatedFilesResponse(
		docInfo: RelatedFilesDocumentInfo,
		telemetryData: TelemetryWithExp,
		cancellationToken: ICancellationToken | undefined
	): Promise<RelatedFilesResponse | undefined>;

	async getRelatedFiles(
		docInfo: RelatedFilesDocumentInfo,
		telemetryData: TelemetryWithExp,
		cancellationToken: ICancellationToken | undefined
	): Promise<RelatedFiles | undefined> {
		// Try/catch-ing around getRelatedFilesResponse is not useful: it is up to the
		// concrete implementation of getRelatedFilesResponse to handle exceptions. If
		// they are thrown at this point, let them pass through up to the memoize() to
		// handle cache eviction.
		const response = await this.getRelatedFilesResponse(docInfo, telemetryData, cancellationToken);
		if (response === undefined) { return undefined; }

		const result: RelatedFiles = {
			entries: new Map<NeighboringFileType, Map<string, string>>(),
			traits: response.traits ?? [],
		};

		for (const entry of response.entries) {
			let uriToContentMap = result.entries.get(entry.type);
			if (!uriToContentMap) {
				uriToContentMap = new Map<string, string>();
				result.entries.set(entry.type, uriToContentMap);
			}
			for (const uri of entry.uris) {
				try {
					relatedFilesLogger.debug(this.logTarget, `Processing ${uri}`);

					let content = await this.getFileContent(uri);
					if (!content || content.length === 0) {
						relatedFilesLogger.debug(this.logTarget, `Skip ${uri} due to empty content or loading issue.`);
						continue;
					}

					if (await this.isContentExcluded(uri, content)) {
						relatedFilesLogger.debug(this.logTarget, `Skip ${uri} due content exclusion.`);
						continue;
					}

					content = RelatedFilesProvider.dropBOM(content);
					uriToContentMap.set(uri, content);
				} catch (e) {
					relatedFilesLogger.warn(this.logTarget, e);
				}
			}
		}

		return result;
	}

	protected async getFileContent(uri: string): Promise<string | undefined> {
		try {
			return this.fileSystemService.readFileString(uri);
		} catch (e) {
			relatedFilesLogger.debug(this.logTarget, e);
		}

		return undefined;
	}

	private async isContentExcluded(uri: string, content: string): Promise<boolean> {
		try {
			return this.ignoreService.isCopilotIgnored(URI.parse(uri));
		} catch (e) {
			this.instantiationService.invokeFunction(acc => relatedFilesLogger.exception(acc, e, 'isContentExcluded'));
		}

		// Default to being excluded if encountered error
		return true;
	}

	private static dropBOM(content: string): string {
		// Note: charCodeAt() converts the UTF8 BOM to UTF16 BOM (`0xefbbbf` to `0xfeff`),
		// so only the latter must be checked.
		if (content.charCodeAt(0) === 0xfeff) {
			return content.slice(1);
		}

		return content;
	}
}

const defaultMaxRetryCount: number = 3; // times the cache may be evicted and refreshed (e.g. a retry)
const lruCache: PromiseExpirationCacheMap<RelatedFiles> = new PromiseExpirationCacheMap(lruCacheSize);

/**
 * Given a document, gets a list of related files which are cached (memoized).
 * If the result is not already cached, then the lookup is made based purely upon docInfo and then cached.
 * */
async function getRelatedFiles(
	accessor: ServicesAccessor,
	docInfo: RelatedFilesDocumentInfo,
	telemetryData: TelemetryWithExp,
	cancellationToken: ICancellationToken | undefined,
	relatedFilesProvider: ICompletionsRelatedFilesProviderService
): Promise<RelatedFiles> {
	const instantiationService = accessor.get(IInstantiationService);
	const logTarget = accessor.get(ICompletionsLogTargetService);
	const startTime = performance.now();
	let result: RelatedFiles | undefined;
	try {
		result = await relatedFilesProvider.getRelatedFiles(docInfo, telemetryData, cancellationToken);
	} catch (error) {
		instantiationService.invokeFunction(acc => relatedFilesLogger.exception(acc, error, '.getRelatedFiles'));
		result = undefined;
	}

	if (result === undefined) {
		const retryCount = lruCache.bumpRetryCount(docInfo.uri);
		if (retryCount >= defaultMaxRetryCount) {
			// Retry limit reached, cache and return an empty list.
			result = EmptyRelatedFiles;
		} else {
			result = undefined;
		}
	}

	const elapsedTime = performance.now() - startTime;
	relatedFilesLogger.debug(logTarget,
		result !== undefined
			? `Fetched ${[...result.entries.values()]
				.map(value => value.size)
				.reduce((total, current) => total + current, 0)} related files for '${docInfo.uri
			}' in ${elapsedTime}ms.`
			: `Failing fetching files for '${docInfo.uri}' in ${elapsedTime}ms.`
	);

	// If the provider failed, throwing will let memoize() evict the key from the cache, and will be tried again.
	if (result === undefined) {
		throw new RelatedFilesProviderFailure();
	}
	return result;
}

let getRelatedFilesWithCacheAndTimeout = function (
	accessor: ServicesAccessor,
	docInfo: RelatedFilesDocumentInfo,
	telemetryData: TelemetryWithExp,
	cancellationToken: ICancellationToken | undefined,
	relatedFilesProvider: ICompletionsRelatedFilesProviderService
): Promise<RelatedFiles> {
	const id = `${docInfo.uri}`;
	if (lruCache.has(id)) {
		return lruCache.get(id)!;
	}
	let result = getRelatedFiles(accessor, docInfo, telemetryData, cancellationToken, relatedFilesProvider);
	if (result instanceof Promise) {
		result = result.catch(error => {
			lruCache.delete(id);
			throw error;
		});
	}
	lruCache.set(id, result);
	return result;
};

getRelatedFilesWithCacheAndTimeout = shortCircuit(
	getRelatedFilesWithCacheAndTimeout,
	200, // max milliseconds
	EmptyRelatedFiles
);

/**
 * For a given document, it provides a list of related files and traits
 * @param ctx The context.
 * @param doc The document information.
 * @param telemetryData Object used to send telemetry and check experimentation options.
 * @param cancellationToken The cancellation token.
 * @param data Additional arbitrary data to be passed to the provider.
 * @param forceComputation Set true to force computation by skipping cache and timeout.
 * @returns Related files and traits.
 */
export async function getRelatedFilesAndTraits(
	accessor: ServicesAccessor,
	doc: RelatedFilesTextDocument,
	telemetryData: TelemetryWithExp,
	cancellationToken?: ICancellationToken,
	data?: unknown,
	forceComputation: boolean = false
): Promise<RelatedFiles> {
	const instantiationService = accessor.get(IInstantiationService);
	const logTarget = accessor.get(ICompletionsLogTargetService);
	const relatedFilesProvider = accessor.get(ICompletionsRelatedFilesProviderService);

	let relatedFiles = EmptyRelatedFiles;
	try {
		const docInfo: RelatedFilesDocumentInfo = {
			uri: doc.uri,
			clientLanguageId: doc.clientLanguageId,
			data: data,
		};
		relatedFiles = forceComputation
			? await instantiationService.invokeFunction(getRelatedFiles, docInfo, telemetryData, cancellationToken, relatedFilesProvider)
			: await instantiationService.invokeFunction(getRelatedFilesWithCacheAndTimeout,
				docInfo,
				telemetryData,
				cancellationToken,
				relatedFilesProvider
			);
	} catch (error) {
		relatedFiles = EmptyRelatedFiles;
		if (error instanceof RelatedFilesProviderFailure) {
			instantiationService.invokeFunction(telemetry, 'getRelatedFilesList', telemetryData);
		}
	}

	relatedFilesLogger.debug(logTarget,
		relatedFiles !== null && relatedFiles !== undefined
			? `Fetched following traits ${relatedFiles.traits
				.map(trait => `{${trait.name} : ${trait.value}}`)
				.join('')} for '${doc.uri}'`
			: `Failing fecthing traits for '${doc.uri}'.`
	);

	return relatedFiles;
}
