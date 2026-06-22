/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../../base/common/actions.js';
import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { createModelConfigurationActions, ILanguageModelsService } from '../../../common/languageModels.js';
import { computeStoredConfiguration, extractSchemaDefaults, filterConfigurationToSchema, resolveModelConfiguration } from './chatModelConfigurationLogic.js';
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

		// Language model providers register asynchronously, so a model's schema
		// defaults and profile-global configuration may not be available the first
		// time `getModelConfiguration` is called (e.g. when the model picker or the
		// context-usage widget reads it during initial layout). The empty snapshot
		// resolved at that point would otherwise be memoized forever, pinning the
		// model to its schema default while the request path — resolved later —
		// uses the configured value. When the set of language models changes, drop
		// only those poisoned snapshots so the next read recomputes against the
		// now-available configuration, and notify consumers (picker, context-usage
		// widget) so the stale value refreshes.
		//
		// This event also fires for model-configuration changes (e.g. our own global
		// mirror in `setModelConfiguration`), so we must NOT clear stable snapshots:
		// an entry that resolved to a non-empty value, or that is backed by a scoped
		// bucket entry, is the editor's intended value and clearing it would discard
		// it and cause a duplicate refresh for a single user action. Only an entry
		// that resolved empty with no bucket entry can be a pre-config-load artifact.
		this._register(this.languageModelsService.onDidChangeLanguageModels(() => {
			if (this._overrides.size === 0) {
				return;
			}
			const bucket = this._readBucket();
			for (const [modelId, override] of [...this._overrides]) {
				if (Object.keys(override).length === 0 && bucket[modelId] === undefined) {
					this._overrides.delete(modelId);
					this._onDidChange.fire(modelId);
				}
			}
		}));
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
			const bucketEntry = this._readBucket()[modelId];
			const schemaDefaults = this._schemaDefaults(modelId);
			const globalConfig = this.languageModelsService.getModelConfiguration(modelId);
			override = resolveModelConfiguration(bucketEntry, schemaDefaults, globalConfig);
			this._overrides.set(modelId, override);
		}
		return Object.keys(override).length > 0 ? override : undefined;
	}

	async setModelConfiguration(modelId: string, values: IStringDictionary<unknown>): Promise<void> {
		const changed = this._applyLocalModelConfiguration(modelId, values);
		if (!changed) {
			// No-op (e.g. re-selecting the already-current value): skip the global
			// write to avoid a redundant profile-file write and the resulting
			// `onDidChangeLanguageModels` event. Any real change — including
			// selecting the schema default — still falls through and syncs the
			// global value.
			return;
		}

		// Mirror the change to the profile-global model configuration. The
		// per-editor bucket is the source of truth for this editor, but the
		// global value is what newly created stores read as their migration
		// fallback (see `getModelConfiguration`) and what other surfaces (e.g. the
		// Models management view) display. Without this, changing the dropdown
		// would only update the editor-scoped bucket and leave a stale global
		// value behind, so a previously chosen value (e.g. the full context
		// window) could get "stuck" and reappear as the apparent default whenever
		// the bucket is absent. This restores the pre-#320393 behaviour where the
		// picker wrote straight to the global. `setModelConfiguration` on the
		// service strips values equal to their schema default, so selecting the
		// default cleanly clears the global override.
		await this.languageModelsService.setModelConfiguration(modelId, values);
	}

	/**
	 * Applies the change to this editor's scoped state only (in-memory snapshot
	 * and persisted bucket). Returns `true` when something actually changed, so
	 * callers can skip propagating no-op updates to the profile-global value.
	 */
	private _applyLocalModelConfiguration(modelId: string, values: IStringDictionary<unknown>): boolean {
		const schemaDefaults = this._schemaDefaults(modelId);
		const stored = computeStoredConfiguration(this.getModelConfiguration(modelId) ?? {}, values, schemaDefaults);
		const nextOverride = { ...schemaDefaults, ...stored };

		// Skip redundant updates. `restoreModelConfiguration` can be invoked on
		// every input-state sync while a session stays selected, so avoid storming
		// storage writes and onDidChange listeners when nothing actually changes.
		const bucket = this._readBucket();
		if (equals(this._overrides.get(modelId), nextOverride) && equals(bucket[modelId], stored)) {
			return false;
		}

		// In-memory snapshot keeps the full effective config (defaults + overrides).
		this._overrides.set(modelId, nextOverride);

		// Persist as the scoped default for newly opened editors. The entry is
		// stored even when empty so that an explicit reset-to-default is
		// remembered and does not fall back to the profile-global value on the
		// next read. Already-open editors keep their own in-memory snapshot and
		// are unaffected because nothing listens to storage changes for this key.
		bucket[modelId] = stored;
		this._writeBucket(bucket);

		this._onDidChange.fire(modelId);
		return true;
	}

	getModelConfigurationActions(modelId: string): IAction[] {
		return createModelConfigurationActions(
			this.languageModelsService.lookupLanguageModel(modelId)?.configurationSchema,
			this.getModelConfiguration(modelId) ?? {},
			(key, value) => this.setModelConfiguration(modelId, { [key]: value }),
		);
	}

	/**
	 * Restores a previously captured configuration for a model (e.g. when
	 * reopening a chat session). Seeds this editor's in-memory snapshot and
	 * persists it as the scoped default so the restored value participates in
	 * the same resolution hierarchy as a user-made change — mirroring how the
	 * restored model selection is persisted to its scoped storage key.
	 *
	 * The captured values are first filtered against the model's *current*
	 * configuration schema so that a config saved against an older schema does
	 * not re-pin removed properties or invalid values: unknown keys and values
	 * that violate the schema's `enum` constraint are dropped and fall back to
	 * the live default.
	 */
	restoreModelConfiguration(modelId: string, values: IStringDictionary<unknown>): void {
		const filtered = filterConfigurationToSchema(values, this.languageModelsService.lookupLanguageModel(modelId)?.configurationSchema);
		// Restore only seeds this editor's scoped snapshot; unlike a user-made
		// change it must NOT write the profile-global value, since restoring a
		// session is not an intentional reconfiguration and runs on every
		// input-state sync.
		this._applyLocalModelConfiguration(modelId, filtered);
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
