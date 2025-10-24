/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUriIdentityService } from './uriIdentity.js';
import { URI } from '../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IFileService, FileSystemProviderCapabilities, IFileSystemProviderCapabilitiesChangeEvent, IFileSystemProviderRegistrationEvent } from '../../files/common/files.js';
import { ExtUri, IExtUri, normalizePath } from '../../../base/common/resources.js';
import { SkipList } from '../../../base/common/skipList.js';
import { Event, Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { quickSelect } from '../../../base/common/arrays.js';
import { compare as strCompare } from '../../../base/common/strings.js';

class Entry {
	static _clock = 0;
	time: number = Entry._clock++;
	constructor(readonly uri: URI) { }
	touch() {
		this.time = Entry._clock++;
		return this;
	}
}

interface IFileSystemCasingChangedEvent {
	scheme: string;
}

class PathCasingCache extends Disposable {
	private readonly _cache = new Map<string, boolean>();

	private _onFileSystemCasingChanged: Emitter<IFileSystemCasingChangedEvent>;
	readonly onFileSystemCasingChanged: Event<IFileSystemCasingChangedEvent>;

	constructor(private readonly _fileService: IFileService) {
		super();

		this._onFileSystemCasingChanged = this._register(new Emitter<IFileSystemCasingChangedEvent>());
		this.onFileSystemCasingChanged = this._onFileSystemCasingChanged.event;

		this._register(Event.any<
			| IFileSystemProviderCapabilitiesChangeEvent
			| IFileSystemProviderRegistrationEvent
		>(
			_fileService.onDidChangeFileSystemProviderRegistrations,
			_fileService.onDidChangeFileSystemProviderCapabilities
		)(e => this._handleFileSystemProviderChangeEvent(e)));
	}

	private _calculateIgnorePathCasing(scheme: string): boolean {
		const uri = URI.from({ scheme });
		return this._fileService.hasProvider(uri) &&
			!this._fileService.hasCapability(uri, FileSystemProviderCapabilities.PathCaseSensitive);
	}

	private _handleFileSystemProviderChangeEvent(
		event:
			| IFileSystemProviderRegistrationEvent
			| IFileSystemProviderCapabilitiesChangeEvent) {
		const currentCasing = this._cache.get(event.scheme);
		if (currentCasing === undefined) {
			return;
		}
		const newCasing = this._calculateIgnorePathCasing(event.scheme);
		if (currentCasing === newCasing) {
			return;
		}
		this._cache.set(event.scheme, newCasing);
		this._onFileSystemCasingChanged.fire({ scheme: event.scheme });
	}

	public shouldIgnorePathCasing(uri: URI): boolean {
		const cachedValue = this._cache.get(uri.scheme);
		if (cachedValue !== undefined) {
			return cachedValue;
		}

		const ignorePathCasing = this._calculateIgnorePathCasing(uri.scheme);
		this._cache.set(uri.scheme, ignorePathCasing);
		return ignorePathCasing;
	}
}

export class UriIdentityService extends Disposable implements IUriIdentityService {

	declare readonly _serviceBrand: undefined;

	readonly extUri: IExtUri;

	private readonly _pathCasingCache: PathCasingCache;
	private readonly _canonicalUris: SkipList<string, Entry>;
	private readonly _limit = 2 ** 16;

	constructor(@IFileService private readonly _fileService: IFileService) {
		super();

		this._pathCasingCache = this._register(new PathCasingCache(this._fileService));

		this._register(this._pathCasingCache.onFileSystemCasingChanged(
			e => this._handleFileSystemCasingChanged(e)));

		this.extUri = new ExtUri(uri => this._pathCasingCache.shouldIgnorePathCasing(uri));
		this._canonicalUris = new SkipList(strCompare, this._limit);
		this._register(toDisposable(() => this._canonicalUris.clear()));
	}

	private _handleFileSystemCasingChanged(e: IFileSystemCasingChangedEvent): void {
		for (const [key, entry] of this._canonicalUris.entries()) {
			if (entry.uri.scheme !== e.scheme) {
				continue;
			}
			this._canonicalUris.delete(key);
		}
	}

	asCanonicalUri(uri: URI): URI {

		// (1) normalize URI
		if (this._fileService.hasProvider(uri)) {
			uri = normalizePath(uri);
		}

		// (2) find the uri in its canonical form or use this uri to define it
		const uriKey = this.extUri.getComparisonKey(uri, true);
		const item = this._canonicalUris.get(uriKey);
		if (item) {
			return item.touch().uri.with({ fragment: uri.fragment });
		}

		// this uri is first and defines the canonical form
		this._canonicalUris.set(uriKey, new Entry(uri));
		this._checkTrim();

		return uri;
	}

	private _checkTrim(): void {
		if (this._canonicalUris.size < this._limit) {
			return;
		}

		Entry._clock = 0;
		const times = [...this._canonicalUris.values()].map(e => e.time);
		const median = quickSelect(
			Math.floor(times.length / 2),
			times,
			(a, b) => a - b);
		for (const [key, entry] of this._canonicalUris.entries()) {
			// Its important to remove the median value here (<= not <).
			// If we have not touched any items since the last trim, the
			// median will be 0 and no items will be removed otherwise.
			if (entry.time <= median) {
				this._canonicalUris.delete(key);
			} else {
				entry.time = 0;
			}
		}
	}
}

registerSingleton(IUriIdentityService, UriIdentityService, InstantiationType.Delayed);
