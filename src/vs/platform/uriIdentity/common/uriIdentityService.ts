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
	private readonly _canonicalUris: SkipList<URI, Entry>;
	private readonly _limit = 2 ** 16;

	constructor(@IFileService private readonly _fileService: IFileService) {
		super();

		this._pathCasingCache = this._register(new PathCasingCache(this._fileService));

		this.extUri = new ExtUri(uri => this._pathCasingCache.shouldIgnorePathCasing(uri));
		this._canonicalUris = new SkipList((a, b) => this.extUri.compare(a, b, true), this._limit);
		this._register(toDisposable(() => this._canonicalUris.clear()));
	}

	asCanonicalUri(uri: URI): URI {

		// (1) normalize URI
		if (this._fileService.hasProvider(uri)) {
			uri = normalizePath(uri);
		}

		// (2) find the uri in its canonical form or use this uri to define it
		const item = this._canonicalUris.get(uri);
		if (item) {
			return item.touch().uri.with({ fragment: uri.fragment });
		}

		// this uri is first and defines the canonical form
		this._canonicalUris.set(uri, new Entry(uri));
		this._checkTrim();

		return uri;
	}

	private _checkTrim(): void {
		if (this._canonicalUris.size < this._limit) {
			return;
		}

		// get all entries, sort by time (MRU) and re-initalize
		// the uri cache and the entry clock. this is an expensive
		// operation and should happen rarely
		const entries = [...this._canonicalUris.entries()].sort((a, b) => {
			if (a[1].time < b[1].time) {
				return 1;
			} else if (a[1].time > b[1].time) {
				return -1;
			} else {
				return 0;
			}
		});

		Entry._clock = 0;
		this._canonicalUris.clear();
		const newSize = this._limit * 0.5;
		for (let i = 0; i < newSize; i++) {
			this._canonicalUris.set(entries[i][0], entries[i][1].touch());
		}
	}
}

registerSingleton(IUriIdentityService, UriIdentityService, InstantiationType.Delayed);
