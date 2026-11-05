/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadLanguageModelsShape, MainThreadLanguageModelToolsShape } from '../../common/extHost.protocol.js';
import { IExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { ExtHostLanguageModelTools } from '../../common/extHostLanguageModelTools.js';
import { LanguageModelError, LanguageModelTextPart, LanguageModelToolResult } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostLanguageModelTools request model resolution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createTools(tool: vscode.LanguageModelTool<object>, resolutionError?: Error) {
		const selections: string[] = [];
		const modelProxy: Partial<MainThreadLanguageModelsShape> = {
			$registerLanguageModelProvider: () => { },
			$unregisterProvider: () => { },
			$selectChatModels: async selector => {
				selections.push(selector.vendor ?? 'default');
				if (resolutionError) {
					throw resolutionError;
				}
				return [];
			},
		};
		const models = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(modelProxy), new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
		store.add(models.registerLanguageModelChatProvider(nullExtensionDescription, 'test', {
			provideLanguageModelChatInformation: async () => [{ id: 'available', name: 'Available', family: 'test', version: '1', maxInputTokens: 1000, maxOutputTokens: 1000, capabilities: {} }],
			provideLanguageModelChatResponse: async () => { throw new Error('Unexpected model request'); },
			provideTokenCount: async () => 0,
		}));
		await models.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);
		const toolsProxy: Partial<MainThreadLanguageModelToolsShape> = {
			$getTools: async () => [],
			$registerTool: () => { },
			$unregisterTool: () => { },
		};
		const tools = new ExtHostLanguageModelTools(SingleProxyRPCProtocol(toolsProxy), models);
		store.add(tools.registerTool({ ...nullExtensionDescription, enabledApiProposals: ['chatParticipantAdditions'] }, 'testTool', tool));
		return {
			selections,
			invoke: (modelId?: string) => tools.$invokeTool({ callId: 'call', toolId: 'testTool', parameters: {}, modelId, context: undefined }, CancellationToken.None),
		};
	}

	for (const modelId of ['agent-host-copilotcli:claude-opus-5.5', 'remote-host:opaque-model', 'test/missing']) {
		test(`model-independent tool runs with unresolved ${modelId} without falling back`, async () => {
			const { invoke, selections } = await createTools({
				invoke: () => new LanguageModelToolResult([new LanguageModelTextPart('["readAttemptComparison","completeAttemptComparison"]')]),
			});
			const result = await invoke(modelId);
			assert.deepStrictEqual({ result, selections }, {
				result: {
					content: [{ kind: 'text', value: '["readAttemptComparison","completeAttemptComparison"]', audience: undefined }],
					toolResultMessage: undefined, toolResultDetails: undefined, toolMetadata: undefined, toolResultError: undefined,
				},
				selections: modelId === 'test/missing' ? ['test'] : [],
			});
		});

		test(`model-dependent tool still rejects unresolved ${modelId} without falling back`, async () => {
			const { invoke, selections } = await createTools({
				invoke: options => new LanguageModelToolResult([new LanguageModelTextPart(options.model?.id ?? 'default')]),
			});
			await assert.rejects(invoke(modelId), error => error instanceof LanguageModelError
				&& error.code === LanguageModelError.NotFound.name
				&& error.message.includes(modelId));
			assert.deepStrictEqual(selections, modelId === 'test/missing' ? ['test'] : []);
		});
	}

	for (const modelId of [undefined, 'test/available']) {
		test(`preserves ${modelId ?? 'absent'} tool model selection`, async () => {
			const { invoke, selections } = await createTools({
				invoke: options => new LanguageModelToolResult([new LanguageModelTextPart(options.model?.id ?? 'none')]),
			});
			const result = await invoke(modelId);
			assert.deepStrictEqual({ result, selections }, {
				result: {
					content: [{ kind: 'text', value: modelId ? 'available' : 'none', audience: undefined }],
					toolResultMessage: undefined, toolResultDetails: undefined, toolMetadata: undefined, toolResultError: undefined,
				},
				selections: [],
			});
		});
	}

	for (const error of [new CancellationError(), LanguageModelError.NoPermissions('Permission denied')]) {
		test(`does not defer ${error.name} ${error.message} during model resolution`, async () => {
			let invoked = false;
			const { invoke } = await createTools({
				invoke: () => {
					invoked = true;
					return new LanguageModelToolResult([]);
				},
			}, error);
			await assert.rejects(invoke('test/missing'), candidate => candidate === error);
			assert.strictEqual(invoked, false);
		});
	}
});
