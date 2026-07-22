/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, isLanguageModelVendorAbsenceConclusive } from './languageModels.js';
import { isAgentHostTarget } from './chatSessionsService.js';

export type ModelIdentifierResolution =
	| { readonly kind: 'notRequested' }
	| { readonly kind: 'pending'; readonly identifier: string }
	| { readonly kind: 'available'; readonly model: ILanguageModelChatMetadataAndIdentifier }
	| { readonly kind: 'unavailable'; readonly identifier: string };

export interface IModelVendorResolution {
	hasLiveModels(vendor: string): boolean;
	hasResolved(vendor: string): boolean;
}

/** Resolves a requested model identifier against the current model catalog. */
export function resolveModelIdentifier(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	identifier: string | undefined,
	isAbsenceConclusive: boolean,
): ModelIdentifierResolution {
	if (!identifier) {
		return { kind: 'notRequested' };
	}

	const model = models.find(model => model.identifier === identifier);
	if (model) {
		return { kind: 'available', model };
	}

	return isAbsenceConclusive
		? { kind: 'unavailable', identifier }
		: { kind: 'pending', identifier };
}

/** Resolves a model identifier using vendor-level catalog readiness. */
export function resolveModelIdentifierFromCatalog(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	identifier: string | undefined,
	vendorResolution: IModelVendorResolution,
): ModelIdentifierResolution {
	if (!identifier) {
		return { kind: 'notRequested' };
	}

	const separator = identifier.search(/[/:]/);
	const vendor = separator === -1 ? undefined : identifier.substring(0, separator);
	const hasLive = vendor ? vendorResolution.hasLiveModels(vendor) : false;
	// Agent-host vendors publish their models asynchronously after the agent host connects, so an
	// empty (not-yet-populated) list is transient: keep the remembered/restored model `pending`
	// (wait) rather than `unavailable` (give up). Once the vendor HAS live models, an absent model
	// is genuinely gone, so stay conclusive. This grace is scoped to restore *resolution* only —
	// cache-retention (`mergeModelsWithCache`) and send-availability keep treating a resolved-empty
	// list as authoritative. The vendor id equals the session type for agent-host models, so
	// `isAgentHostTarget` classifies it directly.
	const isAbsenceConclusive = !vendor || (isLanguageModelVendorAbsenceConclusive(
		vendor,
		hasLive,
		vendorResolution.hasResolved(vendor),
	) && (hasLive || !isAgentHostTarget(vendor)));
	return resolveModelIdentifier(models, identifier, isAbsenceConclusive);
}

export function getRegisteredLanguageModels(languageModelsService: Pick<ILanguageModelsService, 'getLanguageModelIds' | 'lookupLanguageModel'>): ILanguageModelChatMetadataAndIdentifier[] {
	return languageModelsService.getLanguageModelIds()
		.map(identifier => {
			const metadata = languageModelsService.lookupLanguageModel(identifier);
			return metadata ? { identifier, metadata } : undefined;
		})
		.filter(model => model !== undefined);
}

export function resolveModelIdentifierFromLanguageModels(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	identifier: string | undefined,
	languageModelsService: Pick<ILanguageModelsService, 'hasResolvedVendor'>,
	allModels: readonly ILanguageModelChatMetadataAndIdentifier[],
): ModelIdentifierResolution {
	const liveVendors = new Set(allModels.map(model => model.metadata.vendor));
	return resolveModelIdentifierFromCatalog(models, identifier, {
		hasLiveModels: vendor => liveVendors.has(vendor),
		hasResolved: vendor => languageModelsService.hasResolvedVendor(vendor),
	});
}

const AUTO_MODEL_ID = 'auto';

function compareModelVersions(a: string | undefined, b: string | undefined): number {
	const rawA = a ?? '';
	const rawB = b ?? '';
	const segmentsA = rawA.match(/\d+/g)?.map(Number) ?? [];
	const segmentsB = rawB.match(/\d+/g)?.map(Number) ?? [];
	const length = Math.max(segmentsA.length, segmentsB.length);
	for (let index = 0; index < length; index++) {
		const numberA = segmentsA[index] ?? 0;
		const numberB = segmentsB[index] ?? 0;
		if (numberA !== numberB) {
			return numberA - numberB;
		}
	}
	return rawA.localeCompare(rawB);
}

/** Resolves a configured model id, family, or `auto` value against a model pool. */
export function resolveConfiguredModel(
	configuredValue: string | undefined,
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
): ILanguageModelChatMetadataAndIdentifier | undefined {
	const value = configuredValue?.trim().toLowerCase();
	if (!value) {
		return undefined;
	}

	if (value === AUTO_MODEL_ID) {
		return models.find(model => model.metadata.id?.trim().toLowerCase() === AUTO_MODEL_ID);
	}

	const byId = models.find(model => model.metadata.id?.trim().toLowerCase() === value);
	if (byId) {
		return byId;
	}

	const family = models.filter(model => model.metadata.family?.trim().toLowerCase() === value);
	return family.length > 0
		? family.reduce((latest, candidate) => compareModelVersions(candidate.metadata.version, latest.metadata.version) > 0 ? candidate : latest)
		: undefined;
}

export const enum ModelSelectionReason {
	ConfiguredDefault = 'configuredDefault',
	FirstAvailable = 'firstAvailable',
	NoModels = 'noModels',
	Remembered = 'remembered',
	RemovedModelFallback = 'removedModelFallback',
	SessionRestore = 'sessionRestore',
	NewChatRepush = 'newChatRepush',
	UserSelection = 'userSelection',
}

export type ModelSelectionApplyReason = Exclude<ModelSelectionReason, ModelSelectionReason.NoModels>;

export interface IPendingModelSelection {
	readonly source: 'configured' | 'desired';
	readonly reference: string;
}

export type InitialModelSelectionResult =
	| { readonly kind: 'none' }
	| { readonly kind: 'pending'; readonly selection: IPendingModelSelection }
	| { readonly kind: 'apply'; readonly model: ILanguageModelChatMetadataAndIdentifier; readonly reason: ModelSelectionApplyReason };

export interface IInitialModelSelectionInput {
	readonly configuredModelValue: string | undefined;
	readonly configuredModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly waitForConfiguredModel: boolean;
	readonly desiredModelResolution: ModelIdentifierResolution;
	readonly desiredReason: ModelSelectionReason.SessionRestore | ModelSelectionReason.Remembered;
	readonly fallbackModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly fallbackReason: ModelSelectionReason.FirstAvailable | ModelSelectionReason.RemovedModelFallback;
}

/** Applies the shared configured, desired, pending, then fallback precedence. */
export function resolveInitialModelSelection(input: IInitialModelSelectionInput): InitialModelSelectionResult {
	if (input.configuredModel) {
		return { kind: 'apply', model: input.configuredModel, reason: ModelSelectionReason.ConfiguredDefault };
	}
	if (input.configuredModelValue && input.waitForConfiguredModel) {
		return { kind: 'pending', selection: { source: 'configured', reference: input.configuredModelValue } };
	}
	if (input.desiredModelResolution.kind === 'available') {
		return { kind: 'apply', model: input.desiredModelResolution.model, reason: input.desiredReason };
	}
	if (input.desiredModelResolution.kind === 'pending') {
		return { kind: 'pending', selection: { source: 'desired', reference: input.desiredModelResolution.identifier } };
	}
	return input.fallbackModel
		? { kind: 'apply', model: input.fallbackModel, reason: input.fallbackReason }
		: { kind: 'none' };
}

export type ModelSelectionEffect =
	| { readonly kind: 'none' }
	| { readonly kind: 'clear'; readonly reason: ModelSelectionReason.NoModels | ModelSelectionReason.SessionRestore }
	| { readonly kind: 'apply'; readonly model: ILanguageModelChatMetadataAndIdentifier; readonly reason: ModelSelectionApplyReason };

export type IModelSelectionSessionContext =
	| { readonly kind: 'none' }
	| {
		readonly kind: 'untitled' | 'existing';
		readonly key: string;
		readonly chatKey: string | undefined;
		readonly modelId: string | undefined;
	};

export interface IModelSelectionModelsContext {
	readonly available: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly configuredModel: string | undefined;
	readonly waitForConfiguredModel: boolean;
	readonly rememberedModelId: string | undefined;
	readonly desiredModelResolution: ModelIdentifierResolution;
	readonly fallbackModel: ILanguageModelChatMetadataAndIdentifier | undefined;
}

export interface IModelSelectionMemory {
	readonly sessionKey: string | undefined;
	readonly lastPushedChatKey: string | undefined;
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly currentReason: ModelSelectionApplyReason | undefined;
}

export interface IModelSelectionTransitionInput {
	readonly session: IModelSelectionSessionContext;
	readonly models: IModelSelectionModelsContext;
	readonly previous: IModelSelectionMemory;
}

export interface IModelSelectionTransitionResult {
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly currentReason: ModelSelectionApplyReason | undefined;
	readonly pendingSelection: IPendingModelSelection | undefined;
	readonly effect: ModelSelectionEffect;
	readonly sessionKey: string | undefined;
	readonly lastPushedChatKey: string | undefined;
}

export function transitionModelSelection(input: IModelSelectionTransitionInput): IModelSelectionTransitionResult {
	const { session, models, previous } = input;
	const sessionKey = session.kind === 'none' ? undefined : session.key;
	const chatKey = session.kind === 'none' ? undefined : session.chatKey;
	const sessionModelId = session.kind === 'none' ? undefined : session.modelId;
	const sessionChanged = sessionKey !== previous.sessionKey;
	const currentModel = sessionChanged ? undefined : previous.currentModel;
	const currentReason = sessionChanged ? undefined : previous.currentReason;
	const sessionModel = sessionModelId ? models.available.find(model => model.identifier === sessionModelId) : undefined;
	const fallbackModel = models.available.find(model => model.identifier === models.rememberedModelId) ?? models.fallbackModel;
	const newConversation = session.kind === 'untitled' && !sessionChanged && chatKey !== previous.lastPushedChatKey;
	const automaticSelection = currentReason === ModelSelectionReason.ConfiguredDefault
		|| currentReason === ModelSelectionReason.FirstAvailable
		|| currentReason === ModelSelectionReason.Remembered
		|| currentReason === ModelSelectionReason.NewChatRepush;
	const configuredModelValue = session.kind === 'untitled'
		&& (newConversation
			|| (!newConversation && (!sessionModelId || automaticSelection) && currentReason !== ModelSelectionReason.UserSelection && currentReason !== ModelSelectionReason.SessionRestore))
		? models.configuredModel
		: undefined;
	const configuredModel = configuredModelValue
		? resolveConfiguredModel(models.configuredModel, models.available)
		: undefined;
	if (configuredModel) {
		if (chatKey === previous.lastPushedChatKey && currentReason === ModelSelectionReason.ConfiguredDefault && currentModel?.identifier === configuredModel.identifier) {
			return { currentModel, currentReason, pendingSelection: undefined, effect: { kind: 'none' }, sessionKey, lastPushedChatKey: previous.lastPushedChatKey };
		}
		return applyResult(sessionKey, chatKey, configuredModel, ModelSelectionReason.ConfiguredDefault);
	}
	if (configuredModelValue && models.waitForConfiguredModel) {
		return {
			currentModel: undefined,
			currentReason: undefined,
			pendingSelection: { source: 'configured', reference: configuredModelValue },
			effect: { kind: 'none' },
			sessionKey,
			lastPushedChatKey: previous.lastPushedChatKey,
		};
	}
	if (session.kind === 'existing' && models.desiredModelResolution.kind === 'pending') {
		return {
			currentModel: undefined,
			currentReason: undefined,
			pendingSelection: { source: 'desired', reference: models.desiredModelResolution.identifier },
			effect: currentModel ? { kind: 'clear', reason: ModelSelectionReason.SessionRestore } : { kind: 'none' },
			sessionKey,
			lastPushedChatKey: chatKey,
		};
	}
	if (!currentModel && session.kind === 'untitled' && sessionModel) {
		return {
			currentModel: sessionModel,
			currentReason: ModelSelectionReason.SessionRestore,
			pendingSelection: undefined,
			effect: { kind: 'none' },
			sessionKey,
			lastPushedChatKey: chatKey,
		};
	}

	if (!currentModel && session.kind === 'untitled') {
		const initial = resolveInitialModelSelection({
			configuredModelValue,
			configuredModel,
			waitForConfiguredModel: models.waitForConfiguredModel,
			desiredModelResolution: models.desiredModelResolution,
			desiredReason: sessionModelId ? ModelSelectionReason.SessionRestore : ModelSelectionReason.Remembered,
			fallbackModel,
			fallbackReason: ModelSelectionReason.FirstAvailable,
		});
		if (initial.kind === 'pending') {
			return { currentModel: undefined, currentReason: undefined, pendingSelection: initial.selection, effect: { kind: 'none' }, sessionKey, lastPushedChatKey: previous.lastPushedChatKey };
		}
		if (initial.kind === 'apply') {
			return applyResult(sessionKey, chatKey, initial.model, initial.reason);
		}
	}

	if (models.available.length === 0) {
		return {
			currentModel: undefined,
			currentReason: undefined,
			pendingSelection: undefined,
			effect: currentModel ? { kind: 'clear', reason: ModelSelectionReason.NoModels } : { kind: 'none' },
			sessionKey,
			lastPushedChatKey: previous.lastPushedChatKey,
		};
	}

	if (session.kind === 'existing') {
		if (sessionModel) {
			return {
				currentModel: sessionModel,
				currentReason: ModelSelectionReason.SessionRestore,
				pendingSelection: undefined,
				effect: { kind: 'none' },
				sessionKey,
				lastPushedChatKey: chatKey,
			};
		}
		if (fallbackModel) {
			return applyResult(sessionKey, chatKey, fallbackModel, sessionModelId ? ModelSelectionReason.RemovedModelFallback : ModelSelectionReason.FirstAvailable);
		}
	}

	const currentModelAvailable = !!currentModel && models.available.some(model => model.identifier === currentModel.identifier);
	if (currentModel && !currentModelAvailable) {
		if (models.desiredModelResolution.kind === 'pending') {
			return {
				currentModel: undefined,
				currentReason: undefined,
				pendingSelection: { source: 'desired', reference: models.desiredModelResolution.identifier },
				effect: { kind: 'clear', reason: ModelSelectionReason.SessionRestore },
				sessionKey,
				lastPushedChatKey: previous.lastPushedChatKey,
			};
		}
		if (fallbackModel) {
			return applyResult(sessionKey, chatKey, fallbackModel, ModelSelectionReason.RemovedModelFallback);
		}
		return {
			currentModel: undefined,
			currentReason: undefined,
			pendingSelection: undefined,
			effect: { kind: 'clear', reason: ModelSelectionReason.NoModels },
			sessionKey,
			lastPushedChatKey: previous.lastPushedChatKey,
		};
	}

	if (session.kind === 'untitled' && currentModel && currentReason === ModelSelectionReason.FirstAvailable) {
		const initial = resolveInitialModelSelection({
			configuredModelValue,
			configuredModel,
			waitForConfiguredModel: models.waitForConfiguredModel,
			desiredModelResolution: models.desiredModelResolution,
			desiredReason: ModelSelectionReason.Remembered,
			fallbackModel,
			fallbackReason: ModelSelectionReason.FirstAvailable,
		});
		if (initial.kind === 'pending') {
			return { currentModel: undefined, currentReason: undefined, pendingSelection: initial.selection, effect: { kind: 'clear', reason: ModelSelectionReason.SessionRestore }, sessionKey, lastPushedChatKey: previous.lastPushedChatKey };
		}
		if (initial.kind === 'apply' && initial.model.identifier !== currentModel.identifier) {
			return applyResult(sessionKey, chatKey, initial.model, initial.reason);
		}
	}

	if (sessionModel && currentModel && sessionModel.identifier !== currentModel.identifier) {
		return { currentModel: sessionModel, currentReason: ModelSelectionReason.SessionRestore, pendingSelection: undefined, effect: { kind: 'none' }, sessionKey, lastPushedChatKey: chatKey };
	}

	if (session.kind === 'untitled' && chatKey !== previous.lastPushedChatKey && currentModel && models.available.some(model => model.identifier === currentModel.identifier)) {
		return applyResult(sessionKey, chatKey, currentModel, ModelSelectionReason.NewChatRepush);
	}

	return { currentModel, currentReason, pendingSelection: undefined, effect: { kind: 'none' }, sessionKey, lastPushedChatKey: previous.lastPushedChatKey };
}

function applyResult(
	sessionKey: string | undefined,
	chatKey: string | undefined,
	model: ILanguageModelChatMetadataAndIdentifier,
	reason: ModelSelectionApplyReason,
): IModelSelectionTransitionResult {
	return { currentModel: model, currentReason: reason, pendingSelection: undefined, effect: { kind: 'apply', model, reason }, sessionKey, lastPushedChatKey: chatKey };
}
