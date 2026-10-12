/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ILanguageModelToolsService, IToolInvocation } from '../../../contrib/chat/common/tools/languageModelToolsService.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadLanguageModelTools } from '../../browser/mainThreadLanguageModelTools.js';
import { IToolInvocationDto, MainContext } from '../../common/extHost.protocol.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { ExtHostLanguageModelTools } from '../../common/extHostLanguageModelTools.js';
import * as typeConvert from '../../common/extHostTypeConverters.js';
import { SingleProxyRPCProtocol, TestRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadLanguageModelTools invocation identity', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createMainThread(invoke?: ILanguageModelToolsService['invokeTool'], rpc = SingleProxyRPCProtocol({})) {
		const calls: IToolInvocation[] = [];
		const service = new class extends mock<ILanguageModelToolsService>() {
			override onDidChangeTools = Event.None;
			override getFullReferenceNameMap() { return new Map(); }
			override getAllToolsIncludingDisabled() { return []; }
			override invokeTool: ILanguageModelToolsService['invokeTool'] = invoke ?? (async dto => {
				calls.push(dto);
				return { content: [] };
			});
		};
		const mainThread = store.add(new MainThreadLanguageModelTools(rpc, service, new NullLogService(), new class extends mock<IProductService>() { }));
		return { mainThread, calls };
	}

	test('two parent tokens survive serialized RPC with exact request and subagent IDs', async () => {
		const rpc = store.add(new TestRPCProtocol());
		const { mainThread, calls } = createMainThread(undefined, rpc);
		rpc.set(MainContext.MainThreadLanguageModelTools, mainThread);
		const tools = new ExtHostLanguageModelTools(rpc, new class extends mock<ExtHostLanguageModels>() { });
		const resources = [URI.parse('vscode-chat:/one?original=value#one'), URI.parse('vscode-chat:/two?original=value#two')];
		await Promise.all(resources.map((sessionResource, index) => tools.invokeTool(nullExtensionDescription, 'testTool', {
			input: {}, toolInvocationToken: Object.freeze({ sessionResource, requestId: `request-${index}`, subagentInvocationId: `subagent-${index}` }) as never,
		}, CancellationToken.None)));
		await rpc.sync();
		assert.deepStrictEqual(calls.map(call => [call.context?.sessionResource.toString(), call.context?.requestId, call.chatRequestId, call.subAgentInvocationId]), resources.map((resource, index) => [resource.toString(), `request-${index}`, `request-${index}`, `subagent-${index}`]));
	});

	for (const sessionResource of ['vscode-chat:/unknown-child', { scheme: 'vscode-chat', path: '/unknown-child' }]) {
		test(`preserves unknown child and known exact parent for ${typeof sessionResource} resources`, async () => {
			const { mainThread, calls } = createMainThread();
			const context = {
				sessionResource, requestId: 'child-request', subagentInvocationId: 'exact-subagent',
				parentSessionResource: 'vscode-chat:/parent?original=query#original-fragment', parentRequestId: 'parent-request',
				modeInstructions: { name: 'Mode', content: 'Exact parent instructions', toolReferences: [] },
			};
			await mainThread.$invokeTool({ callId: 'call', toolId: 'testTool', parameters: {}, context, chatRequestId: 'other-request', subAgentInvocationId: 'other-subagent' });
			assert.deepStrictEqual({
				context: calls[0].context, request: calls[0].chatRequestId, subagent: calls[0].subAgentInvocationId,
			}, { context: typeConvert.LanguageModelToolInvocationContext.to(context), request: 'child-request', subagent: 'exact-subagent' });
		});
	}

	test('legacy DTOs retain explicit IDs and undefined context', async () => {
		const { mainThread, calls } = createMainThread();
		const dtos: IToolInvocationDto[] = [
			{ callId: 'legacy', toolId: 'testTool', parameters: {}, context: { sessionResource: URI.parse('vscode-chat:/legacy').toJSON() }, chatRequestId: 'explicit-request' },
			{ callId: 'tokenless', toolId: 'testTool', parameters: {}, context: undefined, chatRequestId: 'tokenless-request', subAgentInvocationId: 'explicit-subagent' },
		];
		await Promise.all(dtos.map(dto => mainThread.$invokeTool(dto)));
		assert.deepStrictEqual(calls.map(call => [call.context?.requestId, call.chatRequestId, call.subAgentInvocationId]), [
			[undefined, 'explicit-request', undefined], [undefined, 'tokenless-request', 'explicit-subagent'],
		]);
	});

	test('cancelled invocation never reaches tools service', async () => {
		const { mainThread, calls } = createMainThread();
		await assert.rejects(mainThread.$invokeTool({ callId: 'call', toolId: 'testTool', parameters: {}, context: undefined }, CancellationToken.Cancelled), CancellationError);
		assert.deepStrictEqual(calls, []);
	});

	for (const error of [new CancellationError(), new Error('Unknown exact parent request'), new Error('Mismatched parent request')]) {
		test(`preserves service rejection: ${error.message}`, async () => {
			const { mainThread } = createMainThread(async () => { throw error; });
			await assert.rejects(mainThread.$invokeTool({
				callId: 'call', toolId: 'testTool', parameters: {},
				context: { sessionResource: 'vscode-chat:/unknown-child', requestId: 'child', parentSessionResource: 'vscode-chat:/parent', parentRequestId: 'missing' },
			}), candidate => candidate === error);
		});
	}
});