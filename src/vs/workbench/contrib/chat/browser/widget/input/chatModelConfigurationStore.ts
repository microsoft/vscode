/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../../base/common/actions.js';
import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { createModelConfigurationActions, ILanguageModelsService } from '../../../common/languageModels.js';
import { computeStoredConfiguration, extractSchemaDefaults, resolveModelConfiguration } from './chatModelConfigurationLogic.js';
import { IModelConfigurationAccess } from './modelPickerActionItem.js';

/**
 * Per-editor store for model configuration (e.g. context size, thinking effort).
 *
 * It keeps an in-memory snapshot per model so an editor's value stays stable
 * even when another editor writes to the same persisted bucket, and persists
 * changes to a `(location, sessionType)`-scoped storage bucket — the key is
 * supplied by the owner via `getStorageKey` — so newly opened editors in the
 * same scope inherit the latest value.
 *
 * Implements {@link IModelConfigurationAccess} so the model picker can route
 * reads/writes through this editor-scoped layer instead of the global
 * {@link ILanguageModelsService}. See issue #320393.
 */
export class ChatModelConfigurationStore extends Disposable implements IModelConfigurationAccess {

	private readonly _overrides = new Map<string, IStringDictionary<unknown>>();

	private readonly _onDidChange = this._register(new Emitter<string>());
	readonly onDidChange: Event<string> = this._onDidChange.event;

	constructor(
		private readonly getStorageKey: () => string,
		private readonly languageModelsService: ILanguageModelsService,
		private readonly storageService: IStorageService,
	) {
		super();
	}

	/**
	 * Returns this editor's snapshot of the given model's configuration. The
	 * resolution order is:
	 *   1. In-memory snapshot (this editor's live value).
	 *   2. Scoped storage bucket. A present entry wins even when empty, since an
	 *      empty entry records an explicit reset-to-default.
	 *   3. The profile-global value (migration fallback, only when no scoped
	 *      entry exists).
	 * The merged result is cached so subsequent reads are O(1).
	 */
	getModelConfiguration(modelId: string): IStringDictionary<unknown> | undefined {
		let override = this._overrides.get(modelId);
		if (!override) {
			override = resolveModelConfiguration(
				this._readBucket()[modelId],
				this._schemaDefaults(modelId),
				this.languageModelsService.getModelConfiguration(modelId),
			);
			this._overrides.set(modelId, override);
		}
		return Object.keys(override).length > 0 ? override : undefined;
	}

	async setModelConfiguration(modelId: string, values: IStringDictionary<unknown>): Promise<void> {
		const schemaDefaults = this._schemaDefaults(modelId);
		const stored = computeStoredConfiguration(this.getModelConfiguration(modelId) ?? {}, values, schemaDefaults);

		// In-memory snapshot keeps the full effective config (defaults + overrides).
		this._overrides.set(modelId, { ...schemaDefaults, ...stored });

		// Persist as the scoped default for newly opened editors. The entry is
		// stored even when empty so that an explicit reset-to-default is
		// remembered and does not fall back to the profile-global value on the
		// next read. Already-open editors keep their own in-memory snapshot and
		// are unaffected because nothing listens to storage changes for this key.
		const bucket = this._readBucket();
		bucket[modelId] = stored;
		this._writeBucket(bucket);

		this._onDidChange.fire(modelId);
	}

	getModelConfigurationActions(modelId: string): IAction[] {
		return createModelConfigurationActions(
			this.languageModelsService.lookupLanguageModel(modelId)?.configurationSchema,
			this.getModelConfiguration(modelId) ?? {},
			(key, value) => this.setModelConfiguration(modelId, { [key]: value }),
		);
	}

	/**
	 * Drops all in-memory snapshots so the next read re-seeds from the (now
	 * different) scoped storage bucket. Call when the owning editor's scope
	 * (e.g. session type) changes.
	 */
	clear(): void {
		this._overrides.clear();
	}

	private _schemaDefaults(modelId: string): IStringDictionary<unknown> {
		return extractSchemaDefaults(this.languageModelsService.lookupLanguageModel(modelId)?.configurationSchema);
	}

	private _readBucket(): { [modelId: string]: IStringDictionary<unknown> } {
		// Null-prototype dictionary: model identifiers originate from
		// (extension-contributed) providers, so a key like `__proto__` or
		// `constructor` must not be read as an inherited member or mutate the
		// bucket's prototype on write.
		const result: { [modelId: string]: IStringDictionary<unknown> } = Object.create(null);
		const raw = this.storageService.get(this.getStorageKey(), StorageScope.APPLICATION);
		if (!raw) {
			return result;
		}
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') {
				for (const [modelId, entry] of Object.entries(parsed)) {
					// Only accept plain-object per-model entries.
					if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
						result[modelId] = entry as IStringDictionary<unknown>;
					}
				}
			}
		} catch {
			// Ignore malformed JSON and fall back to an empty bucket.
		}
		return result;
	}

	private _writeBucket(bucket: { [modelId: string]: IStringDictionary<unknown> }): void {
		const key = this.getStorageKey();
		if (Object.keys(bucket).length === 0) {
			this.storageService.remove(key, StorageScope.APPLICATION);
		} else {
			this.storageService.store(key, JSON.stringify(bucket), StorageScope.APPLICATION, StorageTarget.USER);
		}
	}
}
