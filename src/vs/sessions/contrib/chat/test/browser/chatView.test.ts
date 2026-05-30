/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
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

function createModel(identifier: string, name = identifier): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier,
		metadata: { id: identifier.substring(identifier.indexOf('/') + 1), name } as ILanguageModelChatMetadata,
	};
}

function createLanguageModelsService(models: readonly ILanguageModelChatMetadataAndIdentifier[]): ILanguageModelsService {
	return {
		lookupLanguageModel: (id: string) => models.find(model => model.identifier === id)?.metadata,
	} as Partial<ILanguageModelsService> as ILanguageModelsService;
}

function createChat(modelId: string | undefined): IChat {
	return {
		modelId: constObservable(modelId),
	} as IChat;
}

suite('ChatView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies restored session model to chat input model', () => {
		const restoredModel = createModel('copilotcli/gpt-5.5');
		const staleInputModel = createModel('copilotcli/claude-sonnet-4.6');
		const inputModel = createInputModel(staleInputModel);

		applySessionModelToInputModel(
			createChat(restoredModel.identifier),
			{ inputModel } as IChatModel,
			createLanguageModelsService([restoredModel, staleInputModel]),
		);

		assert.strictEqual(inputModel.state.get()?.selectedModel?.identifier, restoredModel.identifier);
	});

	test('does not apply unresolved session model to chat input model', () => {
		const staleInputModel = createModel('copilotcli/claude-sonnet-4.6');
		const inputModel = createInputModel(staleInputModel);

		applySessionModelToInputModel(
			createChat('copilotcli/removed'),
			{ inputModel } as IChatModel,
			createLanguageModelsService([staleInputModel]),
		);

		assert.strictEqual(inputModel.state.get()?.selectedModel?.identifier, staleInputModel.identifier);
	});
});
