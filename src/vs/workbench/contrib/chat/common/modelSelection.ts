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
	// (wait) rather than `unavailable` (give up). The same holds while the host has only mirrored
	// the workbench's BYOK models into its pool and its own catalog is still in flight, which is
	// why `hasLiveModels` reports whether the vendor published models of its OWN (see
	// `hasOwnLiveModels`). Once it has, an absent model is genuinely gone, so stay conclusive.
	// This grace is scoped to restore *resolution* only — cache-retention (`mergeModelsWithCache`)
	// and send-availability keep treating a resolved-empty list as authoritative. The vendor id
	// equals the session type for agent-host models, so `isAgentHostTarget` classifies it directly.
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

/**
 * Whether a vendor has published models of its own, ignoring copies bridged in from another
 * provider. An agent host mirrors the workbench's BYOK models into its pool as soon as the bridge
 * is up, but its own catalog only arrives once the host has connected and authenticated — so a pool
 * that is nothing but bridged copies is a half-published catalog. Counting it as live makes a
 * restored session's model look permanently gone and swaps it for an arbitrary bridged model.
 */
function hasOwnLiveModels(models: readonly ILanguageModelChatMetadataAndIdentifier[], vendor: string): boolean {
	return models.some(model => model.metadata.vendor === vendor && model.metadata.byokModelIdentifier === undefined);
}

export function resolveModelIdentifierFromLanguageModels(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	identifier: string | undefined,
	languageModelsService: Pick<ILanguageModelsService, 'hasResolvedVendor'>,
	allModels: readonly ILanguageModelChatMetadataAndIdentifier[],
): ModelIdentifierResolution {
	return resolveModelIdentifierFromCatalog(models, identifier, {
		hasLiveModels: vendor => hasOwnLiveModels(allModels, vendor),
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
	ProgrammaticSelection = 'programmaticSelection',
	Remembered = 'remembered',
	RemovedModelFallback = 'removedModelFallback',
	SessionRestore = 'sessionRestore',
	NewChatRepush = 'newChatRepush',
	UserSelection = 'userSelection',
}

export type ModelSelectionApplyReason = Exclude<ModelSelectionReason, ModelSelectionReason.NoModels>;

/**
 * The model a conversation is meant to run on, and the authority that put it there — regardless of
 * what the catalog can offer right now. Owned by the conversation rather than by any input widget,
 * so a choice made in one chat can never be applied to another.
 *
 * Deliberately local: it is never serialized and never crosses the agent-host wire, unlike the
 * selected model in the conversation's draft state.
 */
export interface IIntendedModelSelection {
	readonly modelId: string;
	/** Present when the model itself was seen; absent when only an id was restored from storage. */
	readonly model?: ILanguageModelChatMetadataAndIdentifier;
	readonly reason: ModelSelectionApplyReason;
	readonly configuration?: Record<string, unknown>;
}

/**
 * Whether a reason represents a choice made inside the current conversation. `chat.defaultModel`
 * seeds every new conversation but must never override one of these. `SessionRestore` is excluded
 * deliberately: on an empty session it is spillover from the previous one, not a choice.
 */
export function isInConversationModelChoice(reason: ModelSelectionApplyReason | undefined): boolean {
	return reason === ModelSelectionReason.UserSelection
		|| reason === ModelSelectionReason.ProgrammaticSelection;
}

export interface IPendingModelSelection {
	readonly reference: string;
}

export type InitialModelSelectionResult =
	| { readonly kind: 'none' }
	| { readonly kind: 'pending'; readonly selection: IPendingModelSelection }
	| { readonly kind: 'apply'; readonly model: ILanguageModelChatMetadataAndIdentifier; readonly reason: ModelSelectionApplyReason };

export interface IInitialModelSelectionInput {
	readonly configuredModel: ILanguageModelChatMetadataAndIdentifier | undefined;
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
	if (input.desiredModelResolution.kind === 'available') {
		return { kind: 'apply', model: input.desiredModelResolution.model, reason: input.desiredReason };
	}
	if (input.desiredModelResolution.kind === 'pending') {
		return { kind: 'pending', selection: { reference: input.desiredModelResolution.identifier } };
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
		&& !isInConversationModelChoice(currentReason)
		&& (newConversation || (!newConversation && (!sessionModelId || automaticSelection)))
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
	if (session.kind === 'existing' && models.desiredModelResolution.kind === 'pending') {
		return {
			currentModel: undefined,
			currentReason: undefined,
			pendingSelection: { reference: models.desiredModelResolution.identifier },
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
			configuredModel,
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
				pendingSelection: { reference: models.desiredModelResolution.identifier },
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
			configuredModel,
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
