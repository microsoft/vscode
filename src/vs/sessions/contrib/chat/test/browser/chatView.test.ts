/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatModel, IChatModelInputState, IInputModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChat } from '../../../../services/sessions/common/session.js';
import { applySessionModelToInputModel } from '../../browser/chatView.js';

function createInputModel(selectedModel: ILanguageModelChatMetadataAndIdentifier | undefined): IInputModel {
	const state = observableValue<IChatModelInputState | undefined>('testInputModelState', {
		attachments: [],
		mode: { id: 'agent', kind: ChatModeKind.Agent },
		selectedModel,
		inputText: '',
		selections: [],
		contrib: {},
	});

	return {
		state,
		setState: newState => state.set({ ...state.get()!, ...newState }, undefined),
		clearState: () => state.set(undefined, undefined),
		toJSON: () => undefined,
	};
}

function createModel(identifier: string, name = identifier, targetChatSessionType?: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier,
		metadata: { id: identifier.substring(identifier.indexOf('/') + 1), name, targetChatSessionType } as ILanguageModelChatMetadata,
	};
}

function createLanguageModelsService(models: readonly ILanguageModelChatMetadataAndIdentifier[], allModels = models): ILanguageModelsService {
	return {
		getLanguageModelIds: () => models.map(model => model.identifier),
		lookupLanguageModel: (id: string) => models.find(model => model.identifier === id)?.metadata,
		getVendors: () => Array.from(new Set(allModels.map(model => model.identifier.substring(0, model.identifier.indexOf('/'))))).map(vendor => ({ vendor, displayName: vendor, description: vendor })),
		hasResolvedVendor: (vendor: string) => models.some(model => model.identifier.startsWith(`${vendor}/`)),
	} as unknown as ILanguageModelsService;
}

function createStorageService(models: readonly ILanguageModelChatMetadataAndIdentifier[] = []): IStorageService {
	return {
		getObject: <T>(_key: string, _scope: StorageScope, _fallbackValue: T) => models as T,
	} as Partial<IStorageService> as IStorageService;
}

function createChat(modelId: string | undefined, sessionType = 'copilotcli'): IChat {
	return {
		resource: URI.from({ scheme: sessionType, path: '/session' }),
		modelId: constObservable(modelId),
	} as IChat;
}

suite('ChatView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies restored session model to chat input model', () => {
		const restoredModel = createModel('copilotcli/gpt-5.5');
		const staleInputModel = createModel('copilotcli/claude-sonnet-4.6');
		const inputModel = createInputModel(staleInputModel);

		assert.strictEqual(applySessionModelToInputModel(
			createChat(restoredModel.identifier),
			{ inputModel } as IChatModel,
			createLanguageModelsService([restoredModel, staleInputModel]),
			createStorageService(),
		), true);

		assert.strictEqual(inputModel.state.get()?.selectedModel?.identifier, restoredModel.identifier);
	});

	test('resolves raw restored session model id to chat input model', () => {
		const restoredModel = createModel('copilotcli/gpt-5.5', 'GPT-5.5', 'copilotcli');
		const staleInputModel = createModel('copilotcli/claude-sonnet-4.6', 'Claude Sonnet 4.6', 'copilotcli');
		const inputModel = createInputModel(staleInputModel);

		assert.strictEqual(applySessionModelToInputModel(
			createChat(restoredModel.metadata.id),
			{ inputModel } as IChatModel,
			createLanguageModelsService([restoredModel, staleInputModel]),
			createStorageService(),
		), true);

		assert.strictEqual(inputModel.state.get()?.selectedModel?.identifier, restoredModel.identifier);
	});

	test('resolves raw restored session model id from cached models', () => {
		const restoredModel = createModel('copilotcli/gpt-5.5', 'GPT-5.5', 'copilotcli');
		const staleInputModel = createModel('copilotcli/claude-sonnet-4.6', 'Claude Sonnet 4.6', 'copilotcli');
		const inputModel = createInputModel(staleInputModel);

		assert.strictEqual(applySessionModelToInputModel(
			createChat(restoredModel.metadata.id),
			{ inputModel } as IChatModel,
			createLanguageModelsService([staleInputModel], [restoredModel, staleInputModel]),
			createStorageService([restoredModel, staleInputModel]),
		), true);

		assert.strictEqual(inputModel.state.get()?.selectedModel?.identifier, restoredModel.identifier);
	});

	test('resolves full restored session model id from cached models', () => {
		const restoredModel = createModel('copilotcli/gpt-5.5', 'GPT-5.5', 'copilotcli');
		const staleInputModel = createModel('copilotcli/claude-sonnet-4.6', 'Claude Sonnet 4.6', 'copilotcli');
		const inputModel = createInputModel(staleInputModel);

		assert.strictEqual(applySessionModelToInputModel(
			createChat(restoredModel.identifier),
			{ inputModel } as IChatModel,
			createLanguageModelsService([staleInputModel], [restoredModel, staleInputModel]),
			createStorageService([restoredModel, staleInputModel]),
		), true);

		assert.strictEqual(inputModel.state.get()?.selectedModel?.identifier, restoredModel.identifier);
	});

	test('does not apply ambiguous raw restored session model id', () => {
		const firstMatch = createModel('copilotcli/gpt-5.5-a', 'GPT-5.5 A', 'copilotcli');
		const secondMatch = createModel('copilotcli/gpt-5.5-b', 'GPT-5.5 B', 'copilotcli');
		(firstMatch.metadata as { id: string }).id = 'gpt-5.5';
		(secondMatch.metadata as { id: string }).id = 'gpt-5.5';
		const staleInputModel = createModel('copilotcli/claude-sonnet-4.6', 'Claude Sonnet 4.6', 'copilotcli');
		const inputModel = createInputModel(staleInputModel);

		assert.strictEqual(applySessionModelToInputModel(
			createChat('gpt-5.5'),
			{ inputModel } as IChatModel,
			createLanguageModelsService([firstMatch, secondMatch, staleInputModel]),
			createStorageService(),
		), false);

		assert.strictEqual(inputModel.state.get()?.selectedModel?.identifier, staleInputModel.identifier);
	});

	test('does not apply unresolved session model to chat input model', () => {
		const staleInputModel = createModel('copilotcli/claude-sonnet-4.6');
		const inputModel = createInputModel(staleInputModel);

		assert.strictEqual(applySessionModelToInputModel(
			createChat('copilotcli/removed'),
			{ inputModel } as IChatModel,
			createLanguageModelsService([staleInputModel]),
			createStorageService(),
		), false);

		assert.strictEqual(inputModel.state.get()?.selectedModel?.identifier, staleInputModel.identifier);
	});
});
