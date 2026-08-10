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
import { IChatVariablesService } from '../../common/attachments/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { ChatAgentService, IChatAgentService } from '../../common/participants/chatAgents.js';
import { IChatSlashCommandService } from '../../common/participants/chatSlashCommands.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { MockChatService } from '../common/chatService/mockChatService.js';
import { MockChatVariablesService } from '../common/mockChatVariables.js';
import { MockPromptsService } from '../common/promptSyntax/service/mockPromptsService.js';

suite('ChatWidget Slash Commands', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('during-request execution trims from the parsed slash-command range', async () => {
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
		chatSlashCommandService.getCommands.returns([{ command: 'btw', executeDuringRequest: true, silent: true }]);
		chatSlashCommandService.executeCommand.callsFake(async (command, prompt) => {
			assert.strictEqual(command, 'btw');
			executedPrompt = prompt;
		});
		instantiationService.stub(IChatSlashCommandService, chatSlashCommandService);

		let acceptedInput: { storeToHistory: boolean | undefined; preserveFocus: boolean | undefined } | undefined;
		const widget = {
			viewModel: {
				sessionResource: LocalChatSessionUri.forSession('test-session'),
				model: { getRequests: () => [] },
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
				acceptInput(storeToHistory?: boolean, preserveFocus?: boolean): void {
					acceptedInput = { storeToHistory, preserveFocus };
				},
			},
		} as unknown as ChatWidget;

		const handled = await (ChatWidget.prototype as unknown as {
			_executeSlashCommandDuringRequest(widgetInput: string, store: boolean, isUserQuery: boolean | undefined): Promise<boolean>;
		})._executeSlashCommandDuringRequest.call(widget, '   /btw   keep indentation', true, true);

		assert.deepStrictEqual({
			handled,
			executedPrompt,
			acceptedInput,
		}, {
			handled: true,
			executedPrompt: 'keep indentation',
			acceptedInput: { storeToHistory: true, preserveFocus: true },
		});
	});
});
