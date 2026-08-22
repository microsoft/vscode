/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mockObject } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ChatWidget } from '../../browser/widget/chatWidget.js';
import { toPasteVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatSendRequestOptions, IChatService } from '../../common/chatService/chatService.js';
import { IChatVariablesService } from '../../common/attachments/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { ChatAgentService, IChatAgentService } from '../../common/participants/chatAgents.js';
import { IChatSlashCommandService } from '../../common/participants/chatSlashCommands.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { MockChatService } from '../common/chatService/mockChatService.js';
import { MockChatVariablesService } from '../common/mockChatVariables.js';
import { MockPromptsService } from '../common/promptSyntax/service/mockPromptsService.js';

suite('ChatWidget Slash Commands', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('during-request execution handles an active request waiting for input', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IPromptsService, disposables.add(new MockPromptsService()));
		instantiationService.stub(IChatVariablesService, new MockChatVariablesService());

		const chatSlashCommandService = mockObject<IChatSlashCommandService>()({ _serviceBrand: undefined });
		let executedPrompt: string | undefined;
		let executedRequestOptions: IChatSendRequestOptions | undefined;
		chatSlashCommandService.getCommands.returns([{ command: 'btw', executeDuringRequest: true, silent: true }]);
		let acceptedInput: { storeToHistory: boolean | undefined; preserveFocus: boolean | undefined } | undefined;
		chatSlashCommandService.executeCommand.callsFake(async (command, prompt, _progress, _history, _location, _sessionResource, _token, requestOptions) => {
			assert.strictEqual(command, 'btw');
			assert.ok(acceptedInput);
			executedPrompt = prompt;
			executedRequestOptions = requestOptions;
		});
		instantiationService.stub(IChatSlashCommandService, chatSlashCommandService);

		const pastedText = toPasteVariableEntry('Pasted text #1', 'Long pasted text');
		let hasActiveRequest = false;
		const widget = {
			viewModel: {
				sessionResource: LocalChatSessionUri.forSession('test-session'),
				model: {
					getRequests: () => [],
					hasActiveRequest: { get: () => hasActiveRequest },
				},
			},
			instantiationService,
			location: ChatAgentLocation.Chat,
			_lastSelectedAgent: undefined,
			_lockedAgent: undefined,
			attachmentCapabilities: undefined,
			chatAgentService: instantiationService.get(IChatAgentService),
			chatSlashCommandService,
			input: {
				currentModeKind: ChatModeKind.Ask,
				getAttachedContext: () => ({ asArray: () => [pastedText] }),
				acceptInput(storeToHistory?: boolean, preserveFocus?: boolean): void {
					acceptedInput = { storeToHistory, preserveFocus };
				},
			},
		} as unknown as ChatWidget;

		const privateMethods = ChatWidget.prototype as unknown as {
			_getAttachedContextForConcurrentSlashCommand(preserveInput: boolean | undefined): NonNullable<IChatSendRequestOptions['attachedContext']>;
			_executeSlashCommandDuringRequest(input: string, requestOptions: IChatSendRequestOptions, storeToHistory: boolean, preserveFocus: boolean | undefined): Promise<boolean>;
		};
		const attachedContext = privateMethods._getAttachedContextForConcurrentSlashCommand.call(widget, false);
		const preservedInputContext = privateMethods._getAttachedContextForConcurrentSlashCommand.call(widget, true);
		const handledWithoutActiveRequest = await privateMethods._executeSlashCommandDuringRequest.call(widget, '   /btw   keep indentation', { attachedContext }, true, true);
		hasActiveRequest = true;
		const handled = await privateMethods._executeSlashCommandDuringRequest.call(widget, '   /btw   keep indentation', { attachedContext }, true, true);

		assert.deepStrictEqual({
			handledWithoutActiveRequest,
			handled,
			executedPrompt,
			acceptedInput,
			attachedContext: executedRequestOptions?.attachedContext,
			preservedInputContext,
		}, {
			handledWithoutActiveRequest: false,
			handled: true,
			executedPrompt: 'keep indentation',
			acceptedInput: { storeToHistory: true, preserveFocus: true },
			attachedContext: [pastedText],
			preservedInputContext: [],
		});
	});
});
