/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IToolInvocationContextDto, IToolInvocationDto, MainThreadLanguageModelsShape, MainThreadLanguageModelToolsShape } from '../../common/extHost.protocol.js';
import { IExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { ExtHostLanguageModelTools } from '../../common/extHostLanguageModelTools.js';
import { LanguageModelError, LanguageModelTextPart, LanguageModelToolResult } from '../../common/extHostTypes.js';
import * as typeConvert from '../../common/extHostTypeConverters.js';
import { ChatAgentLocation } from '../../../contrib/chat/common/constants.js';
import { IChatAgentRequest } from '../../../contrib/chat/common/participants/chatAgents.js';
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

suite('ExtHostLanguageModelTools invocation identity', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const extension = { ...nullExtensionDescription, enabledApiProposals: ['chatParticipantPrivate', 'chatParticipantAdditions'] };
	const modeInstructions = { name: 'Exact mode', content: 'Preserve\nthese instructions verbatim.', toolReferences: [], allowedSubagents: ['Explore'] };

	function createTools(invoke?: MainThreadLanguageModelToolsShape['$invokeTool']) {
		const calls: IToolInvocationDto[] = [];
		const proxy: Partial<MainThreadLanguageModelToolsShape> = {
			$getTools: async () => [],
			$registerTool: () => { },
			$unregisterTool: () => { },
			$invokeTool: invoke ?? (async dto => {
				calls.push(dto);
				return { content: [] };
			}),
		};
		const models = new class extends mock<ExtHostLanguageModels>() {
			override async getLanguageModelForRequest(): Promise<vscode.LanguageModelChat> {
				throw LanguageModelError.NotFound('external/model');
			}
		};
		return { tools: new ExtHostLanguageModelTools(SingleProxyRPCProtocol(proxy), models), calls };
	}

	test('two concurrent parents keep their exact tokens, not contradictory explicit IDs', async () => {
		const { tools, calls } = createTools();
		const contexts: IToolInvocationContextDto[] = ['one', 'two'].map(id => ({
			sessionResource: `vscode-chat:/parent-${id}?query=${id}#fragment-${id}`,
			requestId: `request-${id}`,
			subagentInvocationId: `subagent-${id}`,
			modeInstructions: { ...modeInstructions, content: id },
		}));
		await Promise.all(contexts.map(context => tools.invokeTool(extension, 'testTool', {
			input: {}, toolInvocationToken: Object.freeze(context) as never,
			chatRequestId: 'other-request', subAgentInvocationId: 'other-subagent',
		}, CancellationToken.None)));
		assert.deepStrictEqual(calls.map(call => ({
			session: URI.isUri(call.context?.sessionResource) ? call.context.sessionResource.toString(true) : undefined, request: call.chatRequestId,
			subagent: call.subAgentInvocationId, mode: call.context?.modeInstructions?.content,
		})), contexts.map(context => ({ session: context.sessionResource, request: context.requestId, subagent: context.subagentInvocationId, mode: context.modeInstructions?.content })));
	});

	for (const resource of [URI.parse('vscode-chat:/session?value=one#section'), { scheme: 'vscode-chat', path: '/session', query: 'value=one', fragment: 'section' }, 'vscode-chat:/session?value=one#section']) {
		test(`revives ${typeof resource === 'string' ? 'string' : URI.isUri(resource) ? 'URI' : 'cross-realm components'} without changing session identity`, async () => {
			const { tools, calls } = createTools();
			await tools.invokeTool(nullExtensionDescription, 'testTool', {
				input: {}, toolInvocationToken: { sessionResource: resource, requestId: 'exact', subagentInvocationId: 'subagent' } as never,
			}, CancellationToken.None);
			assert.deepStrictEqual({
				session: URI.isUri(calls[0].context?.sessionResource) ? calls[0].context.sessionResource.toString(true) : undefined, request: calls[0].chatRequestId, subagent: calls[0].subAgentInvocationId,
			}, { session: 'vscode-chat:/session?value=one#section', request: 'exact', subagent: 'subagent' });
		});
	}

	test('detached child receives exact parent and mode with an unresolved model', async () => {
		const { tools } = createTools();
		let received: vscode.LanguageModelToolInvocationOptions<object> | undefined;
		store.add(tools.registerTool(extension, 'testTool', {
			invoke: options => {
				received = options;
				return new LanguageModelToolResult([]);
			},
		}));
		await tools.$invokeTool({
			callId: 'call', toolId: 'testTool', parameters: {}, modelId: 'external/model',
			chatRequestId: 'other-request', subAgentInvocationId: 'other-subagent',
			context: {
				sessionResource: 'vscode-chat:/unknown-child', requestId: 'child-request',
				parentSessionResource: 'vscode-chat:/known-parent?original=query#original-fragment', parentRequestId: 'parent-request',
				subagentInvocationId: 'exact-subagent', modeInstructions,
			},
		}, CancellationToken.None);
		assert.deepStrictEqual({
			request: received?.chatRequestId, parent: received?.parentRequestId,
			parentSession: received?.parentSessionResource?.toString(true), session: received?.chatSessionResource?.toString(true),
			subagent: received?.subAgentInvocationId, mode: received?.modeInstructions2,
		}, {
			request: 'child-request', parent: 'parent-request', parentSession: 'vscode-chat:/known-parent?original=query#original-fragment',
			session: 'vscode-chat:/unknown-child', subagent: 'exact-subagent',
			mode: { ...modeInstructions, uri: undefined, metadata: undefined, isBuiltin: undefined },
		});
	});

	test('request converter binds parent, subagent and exact instructions without inspecting model', () => {
		const request: IChatAgentRequest = {
			requestId: 'child-request', sessionResource: URI.parse('vscode-chat:/child'),
			agentId: 'agent', message: 'prompt', location: ChatAgentLocation.Chat, variables: { variables: [] },
			parentRequestId: 'parent-request', subAgentInvocationId: 'subagent', modeInstructions,
		};
		const model = new class extends mock<vscode.LanguageModelChat>() {
			override get id(): string { throw new Error('Model must not be inspected'); }
		};
		const converted = typeConvert.ChatAgentRequest.to(request, undefined, model, undefined, [], new Map(), extension, new NullLogService());
		const context = typeConvert.LanguageModelToolInvocationContext.to(converted.toolInvocationToken);
		assert.deepStrictEqual({
			request: context?.requestId, parent: context?.parentRequestId, subagent: context?.subagentInvocationId,
			mode: context?.modeInstructions?.content, frozen: Object.isFrozen(converted.toolInvocationToken),
		}, { request: 'child-request', parent: 'parent-request', subagent: 'subagent', mode: modeInstructions.content, frozen: true });
	});

	test('legacy tokens and tokenless private calls retain optional-ID behavior', async () => {
		const { tools, calls } = createTools();
		await tools.invokeTool(extension, 'testTool', { input: {}, toolInvocationToken: { sessionResource: URI.parse('vscode-chat:/legacy') } as never, chatRequestId: 'explicit' });
		await tools.invokeTool(extension, 'testTool', { input: {}, toolInvocationToken: undefined, chatRequestId: 'tokenless', subAgentInvocationId: 'explicit-subagent' });
		assert.deepStrictEqual(calls.map(call => [call.context?.requestId, call.chatRequestId, call.subAgentInvocationId]), [
			[undefined, 'explicit', undefined], [undefined, 'tokenless', 'explicit-subagent'],
		]);
	});

	for (const context of [null, {}, { sessionResource: 'no-scheme' }, { sessionResource: 42 }, { sessionResource: 'vscode-chat:/session', requestId: '' }, { sessionResource: 'vscode-chat:/session', parentRequestId: 42 }]) {
		test(`rejects malformed token ${JSON.stringify(context)} before RPC`, async () => {
			const { tools, calls } = createTools();
			await assert.rejects(tools.invokeTool(extension, 'testTool', { input: {}, toolInvocationToken: context as never }), /Invalid tool invocation token|UriError/);
			assert.deepStrictEqual(calls, []);
		});
	}

	test('cancelled invocations do not cross RPC or invoke registered tools', async () => {
		const { tools, calls } = createTools();
		let invoked = false;
		store.add(tools.registerTool(extension, 'testTool', { invoke: () => { invoked = true; return new LanguageModelToolResult([]); } }));
		await assert.rejects(tools.invokeTool(extension, 'testTool', { input: {}, toolInvocationToken: undefined }, CancellationToken.Cancelled), CancellationError);
		await assert.rejects(tools.$invokeTool({ callId: 'call', toolId: 'testTool', parameters: {}, context: undefined }, CancellationToken.Cancelled), CancellationError);
		assert.deepStrictEqual({ calls, invoked }, { calls: [], invoked: false });
	});

	test('unknown or mismatched routing failures propagate unchanged', async () => {
		const error = new Error('Unknown exact parent request');
		const { tools } = createTools(async () => { throw error; });
		await assert.rejects(tools.invokeTool(extension, 'testTool', {
			input: {}, toolInvocationToken: { sessionResource: 'vscode-chat:/unknown-child', requestId: 'child', parentRequestId: 'unknown-parent' } as never,
		}), candidate => candidate === error);
	});

	test('cancellation during model resolution prevents the extension invocation', async () => {
		const source = store.add(new CancellationTokenSource());
		const proxy: Partial<MainThreadLanguageModelToolsShape> = {
			$getTools: async () => [], $registerTool: () => { }, $unregisterTool: () => { },
		};
		const models = new class extends mock<ExtHostLanguageModels>() {
			override async getLanguageModelForRequest(): Promise<vscode.LanguageModelChat> {
				source.cancel();
				throw LanguageModelError.NotFound('external/model');
			}
		};
		const tools = new ExtHostLanguageModelTools(SingleProxyRPCProtocol(proxy), models);
		let invoked = false;
		store.add(tools.registerTool(extension, 'testTool', { invoke: () => { invoked = true; return new LanguageModelToolResult([]); } }));
		await assert.rejects(tools.$invokeTool({
			callId: 'call', toolId: 'testTool', parameters: {}, modelId: 'external/model',
			context: { sessionResource: 'vscode-chat:/child', requestId: 'child', parentRequestId: 'parent' },
		}, source.token), CancellationError);
		assert.strictEqual(invoked, false);
	});
});
