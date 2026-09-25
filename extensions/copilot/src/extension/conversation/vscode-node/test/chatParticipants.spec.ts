/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { IChatQuotaService } from '../../../../platform/chat/common/chatQuotaService';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { SpyChatResponseStream } from '../../../../util/common/test/mockChatResponseStream';
import { mock } from '../../../../util/common/test/simpleMock';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../util/common/test/testUtils';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IPromptCategorizerService } from '../../../prompt/node/promptCategorizer';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { mockLanguageModelChat } from '../../../tools/node/test/searchToolTestUtils';
import { ChatAgentService } from '../chatParticipants';
import { IUserFeedbackService } from '../userActions';

vi.mock('vscode', async () => ({
	...await import('../../../../vscodeTypes'),
	ChatEditingSessionActionOutcome: { Accepted: 1, Rejected: 2, Saved: 3 },
	chat: {
		createChatParticipant: () => ({
			onDidReceiveFeedback: () => ({ dispose() { } }),
			onDidPerformAction: () => ({ dispose() { } }),
			dispose() { },
		}),
	},
	env: { appName: 'Code - OSS' },
	lm: { selectChatModels: vi.fn() },
	commands: { executeCommand: vi.fn() },
}));

describe('Chat participants Auto tier attribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	afterEach(() => vi.restoreAllMocks());

	it.each([
		{ quotaExhausted: true, baseAvailable: true },
		{ quotaExhausted: false, baseAvailable: true },
		{ quotaExhausted: true, baseAvailable: false },
	])('clears the tier only when quota fallback switches models ($quotaExhausted, $baseAvailable)', async ({ quotaExhausted, baseAvailable }) => {
		const services = disposables.add(createExtensionUnitTestingServices(disposables));
		services.define(IUserFeedbackService, { _serviceBrand: undefined, handleFeedback() { }, handleUserAction() { } });
		services.define(IPromptCategorizerService, { _serviceBrand: undefined, categorizePrompt() { } });
		const getChatEndpoint = vi.fn<IEndpointProvider['getChatEndpoint']>();
		services.define(IEndpointProvider, new class extends mock<IEndpointProvider>() {
			override getChatEndpoint = getChatEndpoint;
		});
		const accessor = disposables.add(services.createTestingAccessor());
		const instantiationService = accessor.get(IInstantiationService);
		const premiumEndpoint = instantiationService.createInstance(MockEndpoint, 'premium');
		premiumEndpoint.multiplier = 1;
		const baseEndpoint = instantiationService.createInstance(MockEndpoint, 'base');
		getChatEndpoint.mockImplementation(async request => typeof request === 'string' ? baseEndpoint : premiumEndpoint);
		vi.spyOn(accessor.get(IChatQuotaService), 'quotaExhausted', 'get').mockReturnValue(quotaExhausted);
		vi.spyOn(accessor.get(IChatQuotaService), 'additionalUsageEnabled', 'get').mockReturnValue(false);
		const autoModel = { ...mockLanguageModelChat, id: 'auto', vendor: 'copilot' };
		const baseModel = { ...mockLanguageModelChat, id: baseEndpoint.model, vendor: 'copilot', family: baseEndpoint.family };
		vi.mocked(vscode.lm.selectChatModels).mockResolvedValue(baseAvailable ? [baseModel] : []);
		const chatAgents = instantiationService.createInstance(ChatAgentService);
		disposables.add(chatAgents.register());
		const request = { ...new TestChatRequest('edit'), model: autoModel };
		const stream = new SpyChatResponseStream();
		stream.push(new vscode.ChatResponseAutoModeTierPart('balance'));

		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Exercise quota preflight without running the conversation handler.
		const result = await chatAgents.debugGetCurrentChatAgents()!['switchToBaseModel'](request, stream);
		const uri = vscode.Uri.parse('test:/file.ts');
		stream.textEdit(uri, []);

		const switched = quotaExhausted && baseAvailable;
		expect({
			modelId: result.model.id,
			parts: stream.items.filter(part => part instanceof vscode.ChatResponseAutoModeTierPart || part instanceof vscode.ChatResponseTextEditPart),
		}).toEqual({
			modelId: switched ? baseModel.id : autoModel.id,
			parts: [
				new vscode.ChatResponseAutoModeTierPart('balance'),
				...(switched ? [new vscode.ChatResponseAutoModeTierPart()] : []),
				new vscode.ChatResponseTextEditPart(uri, []),
			],
		});
	});
});
