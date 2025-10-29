/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defaultGenerator } from '../../../../base/common/idGenerator.js';
import { IFileQuery } from '../../../services/search/common/search.js';
import { equals } from '../../../../base/common/objects.js';

enum LoadingPhase {
	Created = 1,
	Loading = 2,
	Loaded = 3,
	Errored = 4,
	Disposed = 5
}

export class FileQueryCacheState {

	private readonly _cacheKey;
	get cacheKey(): string {
		if (this.loadingPhase === LoadingPhase.Loaded || !this.previousCacheState) {
			return this._cacheKey;
		}

		return this.previousCacheState.cacheKey;
	}

	get isLoaded(): boolean {
		const isLoaded = this.loadingPhase === LoadingPhase.Loaded;

		return isLoaded || !this.previousCacheState ? isLoaded : this.previousCacheState.isLoaded;
	}

	get isUpdating(): boolean {
		const isUpdating = this.loadingPhase === LoadingPhase.Loading;

		return isUpdating || !this.previousCacheState ? isUpdating : this.previousCacheState.isUpdating;
	}

	private readonly query;

	private loadingPhase;
	private loadPromise: Promise<void> | undefined;

	constructor(
		private cacheQuery: (cacheKey: string) => IFileQuery,
		private loadFn: (query: IFileQuery) => Promise<any>,
		private disposeFn: (cacheKey: string) => Promise<void>,
		private previousCacheState: FileQueryCacheState | undefined
	) {
		this._cacheKey = defaultGenerator.nextId();
		this.query = this.cacheQuery(this._cacheKey);
		this.loadingPhase = LoadingPhase.Created;
		if (this.previousCacheState) {
			const current = Object.assign({}, this.query, { cacheKey: null });
			const previous = Object.assign({}, this.previousCacheState.query, { cacheKey: null });
			if (!equals(current, previous)) {
				this.previousCacheState.dispose();
				this.previousCacheState = undefined;
			}
		}
	}

	load(): FileQueryCacheState {
		if (this.isUpdating) {
			return this;
		}

		this.loadingPhase = LoadingPhase.Loading;

		this.loadPromise = (async () => {
			try {
				await this.loadFn(this.query);

				this.loadingPhase = LoadingPhase.Loaded;

				if (this.previousCacheState) {
					this.previousCacheState.dispose();
					this.previousCacheState = undefined;
				}
			} catch (error) {
				this.loadingPhase = LoadingPhase.Errored;

				throw error;
			}
		})();

		return this;
	}

	dispose(): void {
		if (this.loadPromise) {
			(async () => {
				try {
					await this.loadPromise;
				} catch (error) {
					// ignore
				}

				this.loadingPhase = LoadingPhase.Disposed;
				this.disposeFn(this._cacheKey);
			})();
		} else {
			this.loadingPhase = LoadingPhase.Disposed;
		}

		if (this.previousCacheState) {
			this.previousCacheState.dispose();
			this.previousCacheState = undefined;
		}
	}
}
