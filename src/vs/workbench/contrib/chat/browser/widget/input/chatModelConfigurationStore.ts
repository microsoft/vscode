/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../../base/common/actions.js';
import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { AutoTierSourceConfigKey, isAutoModeRoutingTier, isInheritedAutoTier, parseManagedAutoTierDefault, type AutoModeTier } from '../../../../../../platform/agentHost/common/autoModeTiers.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { COPILOT_AUTO_TIER_KEY, IManagedSettingsService } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { COPILOT_VENDOR_ID, createModelConfigurationActions, ILanguageModelConfigurationSchema, ILanguageModelsService } from '../../../common/languageModels.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { computeStoredConfiguration, extractSchemaDefaults, filterConfigurationToSchema, resolveModelConfiguration } from './chatModelConfigurationLogic.js';
import { IModelConfigurationAccess } from './modelPicker/modelPickerModelConfig.js';

/**
 * Per-editor store for model configuration (e.g. context size, thinking effort).
 *
 * It keeps an in-memory snapshot per model so an editor's value stays stable
 * even when another editor writes to the same persisted bucket, and persists
 * changes to a `(location, sessionType)`-scoped storage bucket — the key is
 * supplied by the owner via `getStorageKey` — so newly opened editors in the
 * same scope inherit the latest value. Untouched defaults follow schema updates
 * only while the conversation is empty; selected and restored values stay pinned.
 *
 * Implements {@link IModelConfigurationAccess} so the model picker can route
 * reads/writes through this editor-scoped layer instead of the global
 * {@link ILanguageModelsService}. See issue #320393.
 */
export class ChatModelConfigurationStore extends Disposable implements IModelConfigurationAccess {

	private readonly _overrides = new Map<string, IStringDictionary<unknown>>();
	private readonly _preferences = new Map<string, IStringDictionary<unknown>>();
	private readonly _explicitAutoTiers = new Set<string>();
	private readonly _sessionAutoTiers = new Set<string>();
	private _managedAutoTier: AutoModeTier | undefined;
	private _autoTierSchema: { original: ILanguageModelConfigurationSchema; tier: string; effective: ILanguageModelConfigurationSchema } | undefined;

	private readonly _onDidChange = this._register(new Emitter<string>());
	readonly onDidChange: Event<string> = this._onDidChange.event;

	private readonly _onDidSelectConfiguration = this._register(new Emitter<string>());
	/** Explicit selections, including reselecting a value; restores and schema updates do not fire. */
	readonly onDidSelectConfiguration: Event<string> = this._onDidSelectConfiguration.event;

	constructor(
		private readonly getStorageKey: () => string,
		private readonly isEmpty: () => boolean,
		private readonly agentHostManagedDefaultScope: IObservable<boolean>,
		private readonly languageModelsService: ILanguageModelsService,
		private readonly storageService: IStorageService,
		managedSettingsService: IManagedSettingsService,
		logService: ILogService,
	) {
		super();

		const readManagedTier = () => {
			try {
				this._managedAutoTier = parseManagedAutoTierDefault(managedSettingsService.getManagedSettingValue(COPILOT_AUTO_TIER_KEY));
			} catch (error) {
				this._managedAutoTier = undefined;
				logService.error('[Chat] Invalid managed Auto startup default', error);
			}
		};
		readManagedTier();
		this._register(managedSettingsService.onDidChangeManagedSettings(readManagedTier));
		// Only untouched draft defaults follow schema updates; selections and started conversations stay pinned.
		// Model-change events also report other editors' writes, which must not replace this editor's preferences.
		this._register(Event.any(this.languageModelsService.onDidChangeLanguageModels, Event.map(Event.any(
			managedSettingsService.onDidChangeManagedSettings, Event.fromObservableLight(agentHostManagedDefaultScope),
		), () => undefined))(vendor => {
			if (this._overrides.size === 0) {
				return;
			}
			const bucket = this._readBucket();
			for (const [modelId, override] of [...this._overrides]) {
				const schemaDefaults = this._schemaDefaults(modelId);
				const uninitialized = Object.keys(override).length === 0;
				const preferences = uninitialized
					? resolveModelConfiguration(bucket[modelId], {}, this.languageModelsService.getModelConfiguration(modelId, false))
					: this._preferences.get(modelId);
				this._preferences.set(modelId, { ...preferences });
				const nextOverride = this.isEmpty()
					? this._resolveConfiguration(modelId, schemaDefaults, preferences)
					: { ...schemaDefaults, ...(uninitialized ? preferences : override) };
				if (!equals(override, nextOverride) || vendor === undefined) {
					this._overrides.set(modelId, nextOverride);
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
			const globalConfig = this.languageModelsService.getModelConfiguration(modelId, false);
			this._preferences.set(modelId, { ...(bucketEntry ?? globalConfig) });
			override = this._resolveConfiguration(modelId, schemaDefaults, bucketEntry ?? globalConfig);
			this._overrides.set(modelId, override);
		}
		return Object.keys(override).length > 0 ? override : undefined;
	}

	async setModelConfiguration(modelId: string, values: IStringDictionary<unknown>): Promise<void> {
		if (Object.hasOwn(values, 'tier')) {
			this._explicitAutoTiers.add(modelId);
			this._sessionAutoTiers.delete(modelId);
		}
		const changed = this._applyLocalModelConfiguration(modelId, values);
		this._onDidSelectConfiguration.fire(modelId);
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
	 * and optionally persisted bucket). Returns `true` when something actually changed, so
	 * callers can skip propagating no-op updates to the profile-global value.
	 */
	private _applyLocalModelConfiguration(modelId: string, values: IStringDictionary<unknown>, persist = true): boolean {
		const schemaDefaults = this._schemaDefaults(modelId);
		this.getModelConfiguration(modelId);
		const stored = computeStoredConfiguration({ ...schemaDefaults, ...this._preferences.get(modelId) }, values, schemaDefaults);
		delete stored[AutoTierSourceConfigKey];
		this._preferences.set(modelId, { ...this._preferences.get(modelId), ...values });
		const nextOverride = this._resolveConfiguration(modelId, schemaDefaults, this._preferences.get(modelId));
		if (!this.isEmpty() && this._overrides.has(modelId)) {
			Object.assign(nextOverride, this._overrides.get(modelId), values);
			if (Object.hasOwn(values, 'tier') && this._explicitAutoTiers.has(modelId)) {
				nextOverride[AutoTierSourceConfigKey] = 'explicit';
			}
		}

		// Skip redundant updates. `restoreModelConfiguration` can be invoked on
		// every input-state sync while a session stays selected, so avoid storming
		// storage writes and onDidChange listeners when nothing actually changes.
		const bucket = persist ? this._readBucket() : undefined;
		if (equals(this._overrides.get(modelId), nextOverride) && (!bucket || equals(bucket[modelId], stored))) {
			return false;
		}

		// In-memory snapshot keeps the full effective config (defaults + overrides).
		this._overrides.set(modelId, nextOverride);

		// Persist as the scoped default for newly opened editors. The entry is
		// stored even when empty so that an explicit reset-to-default is
		// remembered and does not fall back to the profile-global value on the
		// next read. Already-open editors keep their own in-memory snapshot and
		// are unaffected because nothing listens to storage changes for this key.
		if (bucket) {
			bucket[modelId] = stored;
			this._writeBucket(bucket);
		}

		this._onDidChange.fire(modelId);
		return true;
	}

	getModelConfigurationActions(modelId: string): IAction[] {
		return createModelConfigurationActions(
			this.getModelConfigurationSchema(modelId),
			this.getModelConfiguration(modelId) ?? {},
			(key, value) => this.setModelConfiguration(modelId, { [key]: value }),
		);
	}

	getModelConfigurationSchema(modelId: string): ILanguageModelConfigurationSchema | undefined {
		const metadata = this.languageModelsService.lookupLanguageModel(modelId);
		const schema = metadata?.configurationSchema;
		const tierSchema = schema?.properties?.tier;
		const managed = this._managedAutoTier;
		if (!schema || !tierSchema || !managed || metadata?.id !== 'auto' || !this._usesManagedDefault(metadata.vendor)) {
			return schema;
		}
		if (this._autoTierSchema?.original !== schema || this._autoTierSchema.tier !== managed) {
			this._autoTierSchema = {
				original: schema, tier: managed,
				effective: { ...schema, properties: { ...schema.properties, tier: { ...tierSchema, default: managed } } },
			};
		}
		return this._autoTierSchema.effective;
	}

	/** Rebinds picker observers after the owner has restored the incoming conversation's configuration. */
	notifyConversationChanged(): void {
		for (const modelId of [...this._overrides.keys()]) {
			this._onDidChange.fire(modelId);
		}
	}

	/**
	 * Restores a previously captured configuration for a model (e.g. when
	 * reopening a chat session). Seeds this editor's in-memory snapshot and
	 * optionally persists it as the scoped default so the restored value participates in
	 * the same resolution hierarchy as a user-made change — mirroring how the
	 * restored model selection is persisted to its scoped storage key.
	 *
	 * When the model is registered, the captured values are filtered against its
	 * *current* configuration schema so that a config saved against an older
	 * schema does not re-pin removed properties or invalid values: unknown keys
	 * and values that violate the schema's `enum` constraint are dropped and fall
	 * back to the live default.
	 *
	 * When the model is NOT yet registered (asynchronous provider registration),
	 * its schema is unavailable. Filtering would then discard the *entire*
	 * captured config, causing the restore to merge an empty value over whatever
	 * the shared per-scope snapshot currently holds — re-pinning another
	 * conversation's value (e.g. its context size). To preserve the reopened
	 * session's own configuration in that race, the captured values are restored
	 * as-is; a later sync re-validates them once the schema loads. See #320393.
	 */
	restoreModelConfiguration(modelId: string, values: IStringDictionary<unknown>, persist = true): void {
		const metadata = this.languageModelsService.lookupLanguageModel(modelId);
		const filtered = metadata
			? filterConfigurationToSchema(values, metadata.configurationSchema)
			: { ...values };
		const source = values[AutoTierSourceConfigKey];
		const inherited = isInheritedAutoTier(values);
		if (isAutoModeRoutingTier(filtered.tier)) {
			if (source === 'session' || (!this.isEmpty() && inherited)) {
				this._sessionAutoTiers.add(modelId);
				this._explicitAutoTiers.delete(modelId);
				persist = false;
			} else if (this.isEmpty() && inherited) {
				this._explicitAutoTiers.delete(modelId);
				this._sessionAutoTiers.delete(modelId);
				persist = false;
			} else {
				this._explicitAutoTiers.add(modelId);
				this._sessionAutoTiers.delete(modelId);
			}
		} else if (metadata?.id === 'auto' || inherited || source === 'explicit' || source === 'session') {
			delete filtered.tier;
			delete filtered[AutoTierSourceConfigKey];
		}
		if (this._sessionAutoTiers.has(modelId) && isAutoModeRoutingTier(filtered.tier)) {
			filtered[AutoTierSourceConfigKey] = 'session';
		}
		if (this.isEmpty() && inherited) {
			persist = false;
			if (source !== 'preference') {
				delete filtered.tier;
				delete filtered[AutoTierSourceConfigKey];
			}
		}
		// Restore only seeds this editor's scoped snapshot; unlike a user-made
		// change it must NOT write the profile-global value, since restoring a
		// session is not an intentional reconfiguration and runs on every
		// input-state sync.
		this._applyLocalModelConfiguration(modelId, filtered, persist);
	}

	/**
	 * Drops all in-memory snapshots so the next read re-seeds from the (now
	 * different) scoped storage bucket. Call when the owning editor's scope
	 * (e.g. session type) changes.
	 */
	clear(): void {
		this._overrides.clear();
		this._preferences.clear();
		this._explicitAutoTiers.clear();
		this._sessionAutoTiers.clear();
		this._autoTierSchema = undefined;
	}

	private _resolveConfiguration(modelId: string, defaults: IStringDictionary<unknown>, preferences: IStringDictionary<unknown> | undefined): IStringDictionary<unknown> {
		const configuration = { ...defaults, ...preferences };
		const metadata = this.languageModelsService.lookupLanguageModel(modelId);
		if (metadata?.id !== 'auto' || !metadata.configurationSchema?.properties?.tier) {
			return configuration;
		}
		const explicit = this._explicitAutoTiers.has(modelId);
		const session = this._sessionAutoTiers.has(modelId);
		const hasPreference = preferences?.tier !== undefined;
		const managed = this._usesManagedDefault(metadata.vendor) ? this._managedAutoTier : undefined;
		if (this.isEmpty() && !explicit && !session && managed) {
			configuration.tier = managed;
			configuration[AutoTierSourceConfigKey] = 'managed';
		} else {
			configuration[AutoTierSourceConfigKey] = explicit ? 'explicit' : session ? 'session' : hasPreference ? 'preference' : 'default';
		}
		return configuration;
	}

	private _usesManagedDefault(vendor: string): boolean {
		return vendor === COPILOT_VENDOR_ID
			|| (this.agentHostManagedDefaultScope.get() && vendor === SessionType.AgentHostCopilot);
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
