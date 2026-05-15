/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType } from '../../../../platform/chat/common/commonTypes';
import { MockChatMLFetcher } from '../../../../platform/chat/test/common/mockChatMLFetcher';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { CustomDataPartMimeTypes } from '../../../../platform/endpoint/common/endpointTypes';
import { CopilotChatEndpoint } from '../../../../platform/endpoint/node/copilotChatEndpoint';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionTestingServices } from '../../../test/vscode-node/services';
import { buildUtilityAliasModelInfo, CopilotLanguageModelWrapper } from '../languageModelAccess';


suite('CopilotLanguageModelWrapper', () => {
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;

	function createAccessor(vscodeExtensionContext?: IVSCodeExtensionContext) {
		const testingServiceCollection = createExtensionTestingServices();
		testingServiceCollection.define(IChatMLFetcher, new MockChatMLFetcher());

		accessor = testingServiceCollection.createTestingAccessor();
		instaService = accessor.get(IInstantiationService);
	}

	suite('validateRequest - invalid', () => {
		let wrapper: CopilotLanguageModelWrapper;
		let endpoint: IChatEndpoint;
		setup(async () => {
			createAccessor();
			endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-utility');
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

	suite('validateRequest - valid', () => {
		let wrapper: CopilotLanguageModelWrapper;
		let endpoint: IChatEndpoint;
		setup(async () => {
			createAccessor();
			endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-utility');
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

	suite('usage emission', () => {
		let wrapper: CopilotLanguageModelWrapper;
		let endpoint: IChatEndpoint;
		let fetcher: MockChatMLFetcher;
		setup(async () => {
			createAccessor();
			fetcher = accessor.get(IChatMLFetcher) as MockChatMLFetcher;
			endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-utility');
			wrapper = instaService.createInstance(CopilotLanguageModelWrapper);
		});

		test('reports usage as a LanguageModelDataPart', async () => {
			const expectedUsage = {
				prompt_tokens: 100,
				completion_tokens: 50,
				total_tokens: 150,
				prompt_tokens_details: { cached_tokens: 10 }
			};
			fetcher.setNextResponse({
				type: ChatFetchResponseType.Success,
				requestId: 'test-request-id',
				serverRequestId: 'test-server-request-id',
				usage: expectedUsage,
				value: 'hello',
				resolvedModel: 'test-model'
			});

			const reportedParts: vscode.LanguageModelResponsePart2[] = [];
			await wrapper.provideLanguageModelResponse(
				endpoint,
				[vscode.LanguageModelChatMessage.User('hello')],
				{ requestInitiator: 'unknown', toolMode: vscode.LanguageModelChatToolMode.Auto },
				vscode.extensions.all[0].id,
				{ report: part => reportedParts.push(part) },
				CancellationToken.None
			);

			const usagePart = reportedParts.find((p): p is vscode.LanguageModelDataPart =>
				p instanceof vscode.LanguageModelDataPart && p.mimeType === CustomDataPartMimeTypes.Usage);
			assert.ok(usagePart, 'expected a usage data part to be reported');
			const decoded = JSON.parse(new TextDecoder().decode(usagePart.data));
			assert.deepStrictEqual(decoded, expectedUsage);
		});
	});
});

suite('buildUtilityAliasModelInfo', () => {

	function makeEndpoint(overrides: Partial<IChatEndpoint>): IChatEndpoint {
		return {
			model: 'gpt-4o-mini',
			name: 'GPT 4o mini',
			version: '2024-07-18',
			modelMaxPromptTokens: 128_000,
			maxOutputTokens: 4_096,
			supportsToolCalls: true,
			supportsVision: false,
			...overrides,
		} as IChatEndpoint;
	}

	function makeCopilotEndpoint(overrides: Partial<IChatEndpoint>): IChatEndpoint {
		const endpoint = makeEndpoint(overrides);
		Object.setPrototypeOf(endpoint, CopilotChatEndpoint.prototype);
		return endpoint;
	}

	function makeBaseModelInfo(overrides: Partial<vscode.LanguageModelChatInformation> & Pick<vscode.LanguageModelChatInformation, 'id'>): vscode.LanguageModelChatInformation {
		return {
			name: 'Cloned Display Name',
			family: 'gpt-4o-mini',
			version: '2024-07-18',
			maxInputTokens: 100_000,
			maxOutputTokens: 4_096,
			isUserSelectable: true,
			isDefault: true,
			tooltip: 'tooltip-from-base',
			...overrides,
		} as vscode.LanguageModelChatInformation;
	}

	test('clones an existing copilot-provider entry, overriding id/family/selectable/default', () => {
		const endpoint = makeCopilotEndpoint({ model: 'gpt-4o-mini' });
		const base = makeBaseModelInfo({ id: 'gpt-4o-mini', requiresAuthorization: { label: 'octocat' } });
		const result = buildUtilityAliasModelInfo('copilot-utility-small', endpoint, [base], /* baseCount */ 50, undefined);

		assert.strictEqual(result.synthesized, false);
		assert.deepStrictEqual(result.info, {
			...base,
			id: 'copilot-utility-small',
			family: 'copilot-utility-small',
			isUserSelectable: false,
			isDefault: false,
		});
	});

	test('synthesizes for non-copilot endpoints when a copilot model shares the same id', () => {
		const endpoint = makeEndpoint({
			model: 'gpt-4o-mini',
			name: 'BYOK GPT 4o mini',
			maxOutputTokens: 2_048,
			supportsToolCalls: false,
			supportsVision: true,
		});
		const base = makeBaseModelInfo({ id: 'gpt-4o-mini', requiresAuthorization: { label: 'octocat' } });
		const result = buildUtilityAliasModelInfo('copilot-utility-small', endpoint, [base], /* baseCount */ 50, { label: 'octocat' });

		assert.deepStrictEqual({
			synthesized: result.synthesized,
			name: result.info.name,
			maxOutputTokens: result.info.maxOutputTokens,
			requiresAuthorization: result.info.requiresAuthorization,
			capabilities: result.info.capabilities,
		}, {
			synthesized: true,
			name: 'BYOK GPT 4o mini',
			maxOutputTokens: 2_048,
			requiresAuthorization: { label: 'octocat' },
			capabilities: { toolCalling: false, imageInput: true },
		});
	});

	test('synthesizes when no matching base entry exists, subtracting baseCount and completion reserve', () => {
		const endpoint = makeEndpoint({
			model: 'unknown-model',
			name: 'Unknown Model',
			version: '2025-01-01',
			modelMaxPromptTokens: 32_000,
			maxOutputTokens: 1_024,
			supportsToolCalls: false,
			supportsVision: true,
		});
		const result = buildUtilityAliasModelInfo('copilot-utility', endpoint, [], /* baseCount */ 100, { label: 'octocat' });

		assert.strictEqual(result.synthesized, true);
		assert.strictEqual(result.info.id, 'copilot-utility');
		assert.strictEqual(result.info.name, 'Unknown Model');
		assert.strictEqual(result.info.family, 'copilot-utility');
		assert.strictEqual(result.info.version, '2025-01-01');
		assert.strictEqual(result.info.maxOutputTokens, 1_024);
		assert.strictEqual(result.info.isUserSelectable, false);
		assert.strictEqual(result.info.isDefault, false);
		assert.deepStrictEqual(result.info.capabilities, { toolCalling: false, imageInput: true });
		// Synthesized alias must carry requiresAuthorization so consumers using
		// `vscode.lm.selectChatModels({ vendor: 'copilot', id: 'copilot-utility' })`
		// against a BYOK override still go through model-access authorization.
		assert.deepStrictEqual(result.info.requiresAuthorization, { label: 'octocat' });
		// 32_000 - 100 (baseCount) - BaseTokensPerCompletion. Use a strict
		// upper bound to assert the subtraction happened without re-importing
		// the constant in the test.
		assert.ok(result.info.maxInputTokens! < 32_000 - 100, `expected maxInputTokens to subtract baseCount and completion reserve, got ${result.info.maxInputTokens}`);
	});
});
