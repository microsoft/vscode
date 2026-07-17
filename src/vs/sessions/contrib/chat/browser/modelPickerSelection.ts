/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { resolveConfiguredModel } from '../../../../workbench/contrib/chat/browser/widget/input/chatModelSelectionLogic.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionModelPickerOptions, ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';

export interface INormalizedSessionModelPickerOptions extends ISessionModelPickerOptions {
	readonly showAutoModel: boolean;
}

const DEFAULT_MODEL_PICKER_OPTIONS: INormalizedSessionModelPickerOptions = {
	useGroupedModelPicker: true,
	showFeatured: true,
	showUnavailableFeatured: false,
	showManageModelsAction: false,
	showAutoModel: true,
};

export function normalizeModelPickerOptions(options: ISessionModelPickerOptions | undefined): INormalizedSessionModelPickerOptions {
	return {
		...DEFAULT_MODEL_PICKER_OPTIONS,
		...options,
		showAutoModel: options?.showAutoModel ?? true,
	};
}

export function modelPickerStorageKey(providerId: string, sessionType: string): string {
	return `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId`;
}

export interface ISessionModelSelectionTarget {
	readonly providerId: string;
	readonly sessionType: string;
	readonly sessionId: string;
}

export function persistSessionModelSelection(
	session: ISessionModelSelectionTarget,
	provider: Pick<ISessionsProvider, 'setModel'>,
	storageService: Pick<IStorageService, 'store'>,
	model: ILanguageModelChatMetadataAndIdentifier,
): void {
	storageService.store(
		modelPickerStorageKey(session.providerId, session.sessionType),
		model.identifier,
		StorageScope.PROFILE,
		StorageTarget.MACHINE,
	);
	provider.setModel(session.sessionId, model.identifier);
}

export function selectAvailableSessionModel(
	session: ISessionModelSelectionTarget,
	provider: Pick<ISessionsProvider, 'getModelsSnapshot' | 'setModel'>,
	storageService: Pick<IStorageService, 'store'>,
	modelIdentifier: string,
): ILanguageModelChatMetadataAndIdentifier | undefined {
	const model = provider.getModelsSnapshot(session.sessionId).models.find(model => model.identifier === modelIdentifier);
	if (!model) {
		return undefined;
	}
	persistSessionModelSelection(session, provider, storageService, model);
	return model;
}

export function hasSelectableModel(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	options: INormalizedSessionModelPickerOptions,
): boolean {
	return models.length > 0 || options.showAutoModel;
}

export const enum ModelSelectionReason {
	ConfiguredDefault = 'configuredDefault',
	FirstAvailable = 'firstAvailable',
	NoModels = 'noModels',
	Remembered = 'remembered',
	RemovedModelFallback = 'removedModelFallback',
	SessionRestore = 'sessionRestore',
	NewChatRepush = 'newChatRepush',
}

export type ModelSelectionEffect =
	| { readonly kind: 'none' }
	| { readonly kind: 'clear'; readonly reason: ModelSelectionReason.NoModels | ModelSelectionReason.SessionRestore }
	| { readonly kind: 'apply'; readonly model: ILanguageModelChatMetadataAndIdentifier; readonly reason: Exclude<ModelSelectionReason, ModelSelectionReason.NoModels> };

export type IModelSelectionSessionContext =
	| { readonly kind: 'none' }
	| {
		readonly kind: 'untitled' | 'existing';
		readonly key: string;
		readonly chatKey: string | undefined;
		readonly modelId: string | undefined;
		readonly modelsResolved: boolean;
	};

export interface IModelSelectionModelsContext {
	readonly available: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly configuredModel: string | undefined;
	readonly rememberedModelId: string | undefined;
}

export interface IModelSelectionMemory {
	readonly sessionKey: string | undefined;
	readonly lastPushedChatKey: string | undefined;
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
}

export interface IModelSelectionTransitionInput {
	readonly session: IModelSelectionSessionContext;
	readonly models: IModelSelectionModelsContext;
	readonly previous: IModelSelectionMemory;
}

export interface IModelSelectionTransitionResult {
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
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
	if (models.available.length === 0) {
		return {
			currentModel: undefined,
			effect: currentModel ? { kind: 'clear', reason: ModelSelectionReason.NoModels } : { kind: 'none' },
			sessionKey,
			lastPushedChatKey: previous.lastPushedChatKey,
		};
	}

	const sessionModel = sessionModelId
		? models.available.find(model => model.identifier === sessionModelId)
		: undefined;
	const fallback = resolveFallbackModel(models.available, models.rememberedModelId);

	if (session.kind === 'existing') {
		if (!sessionModelId || sessionModel || !session.modelsResolved) {
			return {
				currentModel: sessionModel,
				effect: !sessionModel && currentModel
					? { kind: 'clear', reason: ModelSelectionReason.SessionRestore }
					: { kind: 'none' },
				sessionKey,
				lastPushedChatKey: chatKey,
			};
		}

		return applyResult(sessionKey, chatKey, fallback, ModelSelectionReason.RemovedModelFallback);
	}

	const configured = resolveConfiguredModel(models.configuredModel, [...models.available]);
	if (configured && session.kind !== 'none' && chatKey !== previous.lastPushedChatKey) {
		return applyResult(sessionKey, chatKey, configured, ModelSelectionReason.ConfiguredDefault);
	}
	if (sessionModel && currentModel && sessionModel.identifier !== currentModel.identifier) {
		return {
			currentModel: sessionModel,
			effect: { kind: 'none' },
			sessionKey,
			lastPushedChatKey: chatKey,
		};
	}

	if (!currentModel) {
		const model = sessionModel ?? fallback;
		const reason = sessionModel
			? ModelSelectionReason.SessionRestore
			: model.identifier === models.rememberedModelId
				? ModelSelectionReason.Remembered
				: ModelSelectionReason.FirstAvailable;
		return applyResult(sessionKey, chatKey, model, reason);
	}

	if (session.kind === 'untitled' && chatKey !== previous.lastPushedChatKey && models.available.some(model => model.identifier === currentModel.identifier)) {
		return applyResult(sessionKey, chatKey, currentModel, ModelSelectionReason.NewChatRepush);
	}

	return {
		currentModel,
		effect: { kind: 'none' },
		sessionKey,
		lastPushedChatKey: previous.lastPushedChatKey,
	};
}

function resolveFallbackModel(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	rememberedModelId: string | undefined,
): ILanguageModelChatMetadataAndIdentifier {
	return models.find(model => model.identifier === rememberedModelId) ?? models[0];
}

function applyResult(
	sessionKey: string | undefined,
	chatKey: string | undefined,
	model: ILanguageModelChatMetadataAndIdentifier,
	reason: Exclude<ModelSelectionReason, ModelSelectionReason.NoModels>,
): IModelSelectionTransitionResult {
	return {
		currentModel: model,
		effect: { kind: 'apply', model, reason },
		sessionKey,
		lastPushedChatKey: chatKey,
	};
}
