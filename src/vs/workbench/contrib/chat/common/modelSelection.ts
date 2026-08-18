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
	ProgrammaticSelection = 'programmaticSelection',
	Remembered = 'remembered',
	/** A model carried onto the conversation rather than chosen inside it. */
	SessionRestore = 'sessionRestore',
	/** A model the conversation chose, restored onto it. Outranks `chat.defaultModel`. */
	RestoredChoice = 'restoredChoice',
	UserSelection = 'userSelection',
}

/**
 * How a model already on a conversation is recorded: as the conversation's own, or as one carried
 * onto it.
 *
 * The distinction decides whether `chat.defaultModel` may still seed the conversation, and it
 * cannot be read off the model identifier: the same model can arrive because the user picked it,
 * because it was inherited from the chat this one branched off, or because an input picked it in
 * the absence of anything better. Each surface knows which of those happened and says so.
 */
export type RestoredModelReason = ModelSelectionReason.RestoredChoice | ModelSelectionReason.SessionRestore;

/** Whether a reason describes a model restored onto a conversation, whoever chose it. */
export function isRestoredModelReason(reason: ModelSelectionReason | undefined): boolean {
	return reason === ModelSelectionReason.SessionRestore
		|| reason === ModelSelectionReason.RestoredChoice;
}

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
	readonly reason: ModelSelectionReason;
	readonly configuration?: Record<string, unknown>;
}

/**
 * Whether a reason represents a choice made inside the current conversation. `chat.defaultModel`
 * seeds every new conversation but must never override one of these. `SessionRestore` is excluded
 * deliberately: it is a model carried onto the conversation rather than chosen in it, which on an
 * empty session came from the previous one. A restore the surface can vouch for arrives as
 * {@link ModelSelectionReason.RestoredChoice} instead and does block the default.
 */
export function isInConversationModelChoice(reason: ModelSelectionReason | undefined): boolean {
	return reason === ModelSelectionReason.UserSelection
		|| reason === ModelSelectionReason.ProgrammaticSelection
		|| reason === ModelSelectionReason.RestoredChoice;
}

export interface IPendingModelSelection {
	readonly reference: string;
}

export type InitialModelSelectionResult =
	| { readonly kind: 'none' }
	| { readonly kind: 'pending'; readonly selection: IPendingModelSelection }
	| { readonly kind: 'apply'; readonly model: ILanguageModelChatMetadataAndIdentifier; readonly reason: ModelSelectionReason };

export interface IInitialModelSelectionInput {
	readonly configuredModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly desiredModelResolution: ModelIdentifierResolution;
	readonly desiredReason: ModelSelectionReason.SessionRestore | ModelSelectionReason.Remembered;
	readonly fallbackModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly fallbackReason: ModelSelectionReason.FirstAvailable;
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
