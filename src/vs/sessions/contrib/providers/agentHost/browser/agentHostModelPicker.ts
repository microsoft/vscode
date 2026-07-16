/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { type ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { type ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { type ISession } from '../../../../services/sessions/common/session.js';

// -- Agent Host Model Helpers --
//
// The desktop agent-host model selection now flows through the sessions-core
// model picker (`contrib/chat/browser/modelPicker.ts`) and the provider's
// `getModels`/`setModel` APIs. These helpers remain because the phone combined
// mode + model sheet (`mobileChatInputConfigPicker.ts` and
// `mobileChatPhoneInputPresenter.ts`) still resolves models directly.

/**
 * Gets the language models registered for the active agent-host session resource scheme.
 */
export function getAgentHostModels(
	languageModelsService: ILanguageModelsService,
	session: ISession | undefined,
): ILanguageModelChatMetadataAndIdentifier[] {
	if (!session) {
		return [];
	}
	// Filter models by resource scheme. For remote agent hosts the scheme is
	// a unique per-connection ID; for local agent hosts it equals the session
	// type. Both are used as the targetChatSessionType when registering
	// models via AgentHostLanguageModelProvider.
	const resourceScheme = session.resource.scheme;
	return languageModelsService.getLanguageModelIds()
		.map(id => {
			const metadata = languageModelsService.lookupLanguageModel(id);
			return metadata ? { metadata, identifier: id } : undefined;
		})
		.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m && m.metadata.targetChatSessionType === resourceScheme);
}

export function agentHostModelPickerStorageKey(resourceScheme: string): string {
	return `workbench.agentsession.agentHostModelPicker.${resourceScheme}.selectedModelId`;
}

/** Persists and applies a validated Agent Host model selection. */
export function setAgentHostModelSelection(
	session: Pick<ISession, 'resource' | 'sessionId'>,
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	modelIdentifier: string,
	provider: Pick<ISessionsProvider, 'setModel'>,
	storageService: Pick<IStorageService, 'store'>,
): boolean {
	const model = models.find(model => model.identifier === modelIdentifier);
	if (!model) {
		return false;
	}
	storageService.store(agentHostModelPickerStorageKey(session.resource.scheme), model.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
	provider.setModel(session.sessionId, model.identifier);
	return true;
}

/**
 * Resolves the model that should be shown for a session.
 */
export function resolveAgentHostModel(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	sessionModelId: string | undefined,
	storedModelId: string | undefined,
): ILanguageModelChatMetadataAndIdentifier | undefined {
	const sessionModel = sessionModelId ? models.find(model => model.identifier === sessionModelId) : undefined;
	if (sessionModel) {
		return sessionModel;
	}

	return storedModelId ? models.find(model => model.identifier === storedModelId) : undefined;
}
