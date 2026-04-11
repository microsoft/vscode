/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { MockChatMLFetcher } from '../../../../platform/chat/test/common/mockChatMLFetcher';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionTestingServices } from '../../../test/vscode-node/services';
import { CopilotLanguageModelWrapper } from '../languageModelAccess';


suite('CopilotLanguageModelWrapper', () => {
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;

	function createAccessor(vscodeExtensionContext?: IVSCodeExtensionContext) {
		const testingServiceCollection = createExtensionTestingServices();
		testingServiceCollection.define(IChatMLFetcher, new MockChatMLFetcher());

		accessor = testingServiceCollection.createTestingAccessor();
		instaService = accessor.get(IInstantiationService);
	}

	suite('validateRequest - invalid', async () => {
		let wrapper: CopilotLanguageModelWrapper;
		let endpoint: IChatEndpoint;
		setup(async () => {
			createAccessor();
			endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-base');
			wrapper = instaService.createInstance(CopilotLanguageModelWrapper);
		});

		const runTest = async (messages: vscode.LanguageModelChatMessage[], tools?: vscode.LanguageModelChatTool[], errMsg?: string) => {
			await assert.rejects(
				() => wrapper.provideLanguageModelResponse(endpoint, messages, { tools, requestInitiator: 'unknown', toolMode: vscode.LanguageModelChatToolMode.Auto }, vscode.extensions.all[0].id, { report: () => { } }, CancellationToken.None),
				err => {
					errMsg ??= 'Invalid request';
					assert.ok(err instanceof Error, 'expected an Error');
					assert.ok(err.message.includes(errMsg), `expected error to include "${errMsg}", got ${err.message}`);
					return true;
				}
			);
		};

		test('empty', async () => {
			await runTest([]);
		});

		test('bad tool name', async () => {
			await runTest([vscode.LanguageModelChatMessage.User('hello')], [{ name: 'hello world', description: 'my tool' }], 'Invalid tool name');
		});
	});

	suite('validateRequest - valid', async () => {
		let wrapper: CopilotLanguageModelWrapper;
		let endpoint: IChatEndpoint;
		setup(async () => {
			createAccessor();
			endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-base');
			wrapper = instaService.createInstance(CopilotLanguageModelWrapper);
		});
		const runTest = async (messages: vscode.LanguageModelChatMessage[], tools?: vscode.LanguageModelChatTool[]) => {
			await wrapper.provideLanguageModelResponse(endpoint, messages, { tools, requestInitiator: 'unknown', toolMode: vscode.LanguageModelChatToolMode.Auto }, vscode.extensions.all[0].id, { report: () => { } }, CancellationToken.None);
		};

		test('simple', async () => {
			await runTest([vscode.LanguageModelChatMessage.User('hello')]);
		});

		test('tool call and user message', async () => {
			const toolCall = vscode.LanguageModelChatMessage.Assistant('');
			toolCall.content = [new vscode.LanguageModelToolCallPart('id', 'func', { param: 123 })];
			const toolResult = vscode.LanguageModelChatMessage.User('');
			toolResult.content = [new vscode.LanguageModelToolResultPart('id', [new vscode.LanguageModelTextPart('result')])];
			await runTest([toolCall, toolResult, vscode.LanguageModelChatMessage.User('user message')]);
		});

		test('good tool name', async () => {
			await runTest([vscode.LanguageModelChatMessage.User('hello2')], [{ name: 'hello_world', description: 'my tool' }]);
		});
	});
});
