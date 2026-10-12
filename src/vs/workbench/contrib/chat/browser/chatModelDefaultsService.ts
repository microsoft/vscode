/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../base/common/async.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { deepClone, equals } from '../../../../base/common/objects.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ChatModelConfigurationPersistence } from '../common/chatModelConfigurationPersistence.js';
import { IChatModelDefaultsPatch, IChatModelDefaultsService, IChatModelDefaultsSnapshot, IChatModelDefaultsTarget, IChatModelDefaultsUpdateResult } from '../common/chatModelDefaults.js';
import { SessionType } from '../common/chatSessionsService.js';
import { ChatAgentLocation } from '../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelsService } from '../common/languageModels.js';
import { isValidModelConfigurationNumber, supportsCustomModelConfiguration } from '../common/modelConfigurationChoices.js';
import { computeStoredConfiguration, extractSchemaDefaults, filterConfigurationToSchema, resolveModelConfiguration } from './widget/input/chatModelConfigurationLogic.js';

type ModelDefaultsHost = Pick<ILanguageModelsService, '_serviceBrand' | 'lookupLanguageModel' | 'getLanguageModelIds' | 'getModelConfiguration' | 'setModelConfiguration' | 'onDidChangeLanguageModels'>;

/** Edits the same native default bucket as the picker, never a conversation snapshot. */
export class ChatModelDefaultsService extends Disposable implements IChatModelDefaultsService {
	declare readonly _serviceBrand: undefined;
	readonly capabilities = { version: 1, scopeAwareDefaults: true, numericSuggestions: true, customNumericValues: true, requestConfigurationFidelity: 'unverified' } as const;
	private readonly target: IChatModelDefaultsTarget = { id: generateUuid(), label: localize('chat.defaults.local', "New Local Chats (Panel and Editor)") };
	private readonly key = ChatModelConfigurationPersistence.storageKey(ChatAgentLocation.Chat);
	private readonly persistence: ChatModelConfigurationPersistence;
	private readonly snapshots = new Map<string, IChatModelDefaultsSnapshot>();
	private readonly updates = new SequencerByKey<string>();
	private readonly _onDidChange = this._register(new Emitter<{ modelId: string; targetId: string }>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@ILanguageModelsService private readonly models: ModelDefaultsHost,
		@IStorageService storage: IStorageService,
	) {
		super();
		this.persistence = new ChatModelConfigurationPersistence(storage, models);
		const changed = () => {
			for (const [modelId, previous] of this.snapshots) {
				if (this.inspect(modelId, this.target.id).revision !== previous.revision) {
					this._onDidChange.fire({ modelId, targetId: this.target.id });
				}
			}
		};
		this._register(models.onDidChangeLanguageModels(changed));
		this._register(storage.onDidChangeValue(StorageScope.APPLICATION, this.key, this._store)(changed));
	}

	getTargets(modelId: string): readonly IChatModelDefaultsTarget[] {
		const snapshot = this.inspect(modelId, this.target.id);
		return snapshot.status === 'available' ? [{ ...this.target }] : [];
	}

	inspect(modelId: string, targetId: string): IChatModelDefaultsSnapshot {
		if (targetId !== this.target.id) {
			throw new Error('Unsupported new-chat target');
		}
		const metadata = this.models.lookupLanguageModel(modelId);
		// Local is not a contributed session type. A targeted model pool would change its
		// bucket semantics; don't advertise this target in that case. Managed Auto is not
		// a provider-owned default and is deliberately outside this first proposal.
		const supported = metadata && !metadata.targetChatSessionType
			&& !(metadata.vendor === COPILOT_VENDOR_ID && metadata.id === 'auto')
			&& !this.models.getLanguageModelIds().some(id => this.models.lookupLanguageModel(id)?.targetChatSessionType === SessionType.Local);
		const schema = metadata?.configurationSchema;
		const scoped = this.persistence.readBucket(this.key)[modelId];
		const profile = this.models.getModelConfiguration(modelId, false);
		const effective = resolveModelConfiguration(scoped, extractSchemaDefaults(schema), profile);
		const sources: IChatModelDefaultsSnapshot['sources'] = {};
		for (const key of Object.keys(effective)) {
			sources[key] = Object.hasOwn(scoped ?? profile ?? {}, key) ? scoped ? 'scoped' : 'profile' : 'default';
		}
		const state = {
			targetId,
			status: !metadata || !schema ? 'unavailable' : supported ? 'available' : 'unsupported',
			schema, preferences: { scoped, profile }, effective, sources,
		} as const;
		const previous = this.snapshots.get(modelId);
		const revision = previous && equals({ ...previous, revision: undefined }, { ...state, revision: undefined }) ? previous.revision : generateUuid();
		const snapshot = deepClone({ ...state, revision });
		this.snapshots.set(modelId, snapshot);
		return deepClone(snapshot);
	}

	update(modelId: string, targetId: string, patch: IChatModelDefaultsPatch, expectedRevision: string, validateAccess: () => void): Promise<IChatModelDefaultsUpdateResult> {
		const capturedPatch = deepClone(patch);
		return this.updates.queue(modelId, async () => {
			validateAccess();
			const before = this.inspect(modelId, targetId);
			if (before.revision !== expectedRevision || before.status !== 'available') {
				return { outcome: 'conflict', snapshot: before };
			}
			const values = this.validatePatch(before, capturedPatch);
			const stored = computeStoredConfiguration(before.effective, values, extractSchemaDefaults(before.schema));
			try {
				// There is intentionally no await between revision validation and the bucket write.
				this.persistence.writeEntry(this.key, modelId, stored);
				await this.persistence.mirror(modelId, values);
				const snapshot = this.inspect(modelId, targetId);
				const applied = snapshot.status === 'available' && Object.entries(values).every(([key, value]) => equals(snapshot.effective[key], value));
				return { outcome: applied ? 'applied' : 'conflict', snapshot };
			} catch {
				// The two native stores aren't a transaction. Report what can now be observed,
				// never roll back or replay a patch that could overwrite a newer native edit.
				return { outcome: 'failed', snapshot: this.inspect(modelId, targetId) };
			}
		});
	}

	private validatePatch(snapshot: IChatModelDefaultsSnapshot, patch: IChatModelDefaultsPatch): IStringDictionary<unknown> {
		if (!patch || typeof patch !== 'object' || Array.isArray(patch)
			|| Object.keys(patch).some(key => key !== 'set' && key !== 'reset')
			|| (patch.set !== undefined && (!patch.set || typeof patch.set !== 'object' || Array.isArray(patch.set)))
			|| (patch.reset !== undefined && (!Array.isArray(patch.reset) || patch.reset.some(key => typeof key !== 'string')))) {
			throw new Error('Invalid model defaults patch');
		}
		const schema = snapshot.schema!;
		if (schema.$ref || schema.anyOf || schema.oneOf || schema.allOf || schema.not || schema.dependencies || schema.patternProperties) {
			throw new Error('Unsupported model configuration schema');
		}
		const values: IStringDictionary<unknown> = { ...patch.set };
		for (const key of patch.reset ?? []) {
			if (Object.hasOwn(values, key)) {
				throw new Error('Duplicate model defaults property');
			}
			Object.defineProperty(values, key, { value: schema.properties?.[key]?.default, enumerable: true, configurable: true, writable: true });
		}
		for (const [key, value] of Object.entries(values)) {
			const property = Object.hasOwn(schema.properties ?? {}, key) ? schema.properties![key] : undefined;
			// The proposal only edits scalar controls whose constraints the host validates.
			// Unknown/composite values are not passed through to generic model settings.
			if (!property || property.readOnly || value === undefined || (typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number')
				|| !Object.hasOwn(filterConfigurationToSchema({ [key]: value }, schema), key)
				|| (typeof value === 'number' && (!Number.isSafeInteger(value)
					|| (property.enum === undefined && (!supportsCustomModelConfiguration(property) || !isValidModelConfigurationNumber(value, property)))))
				|| (typeof value !== 'number' && !property.enum)) {
				throw new Error('Invalid or unsupported model defaults property');
			}
		}
		return values;
	}
}

registerSingleton(IChatModelDefaultsService, ChatModelDefaultsService, InstantiationType.Delayed);
