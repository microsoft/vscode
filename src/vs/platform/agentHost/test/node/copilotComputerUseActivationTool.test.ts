/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Tool, ToolResultObject } from '@github/copilot-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { COMPUTER_USE_ACTIVATION_REASON_MAX_LENGTH } from '../../common/computerUse.js';
import { ChatInputRequestPurpose, readChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { getComputerUseActivationAnswers, readComputerUseActivationCard } from '../../common/meta/computerUse.js';
import { ChatInputResponseKind, type ChatInputAnswer, type ChatInputRequest } from '../../common/state/sessionState.js';
import { CopilotComputerUseActivation, type IComputerUseActivationChat, type ICopilotRuntimePlugin } from '../../node/copilot/copilotComputerUseActivationTool.js';

class TestActivationChat implements IComputerUseActivationChat {
	plugins: ICopilotRuntimePlugin[] = [{ name: 'computer-use', source: 'builtin', enabled: false }];
	readonly requests: ChatInputRequest[] = [];
	enableCalls = 0;
	enableError: Error | undefined;
	/** Leaves the plugin off after a successful enable, as a runtime that ignores it would. */
	enableIgnored = false;
	listError: Error | undefined;
	canAsk = true;
	private _requestWaiters: { readonly index: number; readonly deferred: DeferredPromise<ChatInputRequest> }[] = [];

	async listPlugins(): Promise<readonly ICopilotRuntimePlugin[]> {
		if (this.listError) {
			throw this.listError;
		}
		return this.plugins.map(plugin => ({ ...plugin }));
	}

	async enablePlugin(): Promise<void> {
		this.enableCalls++;
		if (this.enableError) {
			throw this.enableError;
		}
		if (!this.enableIgnored) {
			this.plugins = this.plugins.map(plugin => plugin.name === 'computer-use' ? { ...plugin, enabled: true } : plugin);
		}
	}

	canAskUser(): boolean {
		return this.canAsk;
	}

	requestInput(request: ChatInputRequest): void {
		this.requests.push(request);
		const ready = this._requestWaiters.filter(waiter => waiter.index < this.requests.length);
		this._requestWaiters = this._requestWaiters.filter(waiter => !ready.includes(waiter));
		for (const waiter of ready) {
			waiter.deferred.complete(this.requests[waiter.index]);
		}
	}

	/** The `index`th request, once the activation made it. */
	request(index: number): Promise<ChatInputRequest> {
		const existing = this.requests[index];
		if (existing) {
			return Promise.resolve(existing);
		}
		const deferred = new DeferredPromise<ChatInputRequest>();
		this._requestWaiters.push({ index, deferred });
		return deferred.p;
	}
}

suite('CopilotComputerUseActivation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function createActivation(configure?: (chat: TestActivationChat) => void) {
		const chat = new TestActivationChat();
		configure?.(chat);
		const activation = new CopilotComputerUseActivation(chat, '[test]', new NullLogService());
		const tools: Tool<unknown>[] = await activation.createTools();
		const call = (args: Record<string, unknown> = { reason: 'Open Calculator' }) => {
			const tool = tools[0];
			return Promise.resolve(tool.handler!(args, { sessionId: 's', toolCallId: 't', toolName: tool.name, arguments: args })) as Promise<ToolResultObject>;
		};
		/** Answers the `index`th card once it appears. */
		const answer = async (index: number, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>) => {
			activation.respondToInput((await chat.request(index)).id, response, answers);
		};
		return { chat, activation, tools, call, answer };
	}

	test('is offered only while the runtime has the built-in plugin and it is off', async () => {
		const offered = async (configure: (chat: TestActivationChat) => void) => (await createActivation(configure)).tools.map(tool => ({ name: tool.name, skipPermission: tool.skipPermission, defer: tool.defer }));
		assert.deepStrictEqual({
			off: await offered(() => { }),
			on: await offered(chat => chat.plugins = [{ name: 'computer-use', source: 'builtin', enabled: true }]),
			absent: await offered(chat => chat.plugins = []),
			notBuiltin: await offered(chat => chat.plugins = [{ name: 'computer-use', enabled: false }]),
			listFails: await offered(chat => chat.listError = new Error('runtime gone')),
		}, {
			off: [{ name: 'enable_computer_use', skipPermission: true, defer: 'never' }],
			on: [],
			absent: [],
			notBuiltin: [],
			listFails: [],
		});
	});

	test('tells the model that the tools are available right away and not to ask again after a decline', async () => {
		const { tools } = await createActivation();
		const description = tools[0].description ?? '';
		assert.deepStrictEqual(['Ask the user to turn on Computer Use', 'available as soon as this call returns', 'don\'t call this again in this chat'].filter(clause => !description.includes(clause)), []);
	});

	test('asks with a marked yes/no question that keeps the agent\'s reason literal', async () => {
		const { chat, call, answer } = await createActivation();
		const reason = `Open *Calculator* and [check](https://example.com) the ${'total '.repeat(60)}`;
		const result = call({ reason });
		await answer(0, ChatInputResponseKind.Decline);
		await result;
		const request = chat.requests[0];
		const trimmed = reason.trim().slice(0, COMPUTER_USE_ACTIVATION_REASON_MAX_LENGTH);
		assert.deepStrictEqual({
			card: readComputerUseActivationCard(request),
			purpose: readChatInputRequestPurpose(request),
			messageStart: request.message?.slice(0, 50),
			questions: request.questions,
		}, {
			card: { reason: trimmed },
			purpose: ChatInputRequestPurpose.Elicitation,
			messageStart: 'Open \\*Calculator\\* and \\[check\\]\\(https://example',
			questions: [{
				kind: 'single-select',
				id: 'computerUse',
				title: 'Computer Use',
				message: 'Turn on Computer Use?',
				required: true,
				allowFreeformInput: false,
				options: [{ id: 'turnOn', label: 'Turn On', recommended: true }, { id: 'notNow', label: 'Not Now' }],
			}],
		});
	});

	test('turns Computer Use on only after Turn On, and remembers a decline for the chat', async () => {
		const run = async (response: ChatInputResponseKind, answers: Record<string, ChatInputAnswer> | undefined, asksAgain: boolean) => {
			const { chat, call, answer } = await createActivation();
			const first = call();
			await answer(0, response, answers);
			const results = [(await first).textResultForLlm];
			const second = call();
			if (asksAgain) {
				await answer(1, ChatInputResponseKind.Cancel);
			}
			results.push((await second).textResultForLlm);
			return { results, cards: chat.requests.length, enableCalls: chat.enableCalls };
		};
		assert.deepStrictEqual({
			turnOn: await run(ChatInputResponseKind.Accept, getComputerUseActivationAnswers('turnOn'), false),
			notNow: await run(ChatInputResponseKind.Accept, getComputerUseActivationAnswers('notNow'), false),
			declined: await run(ChatInputResponseKind.Decline, undefined, false),
			cancelled: await run(ChatInputResponseKind.Cancel, undefined, true),
		}, {
			turnOn: {
				results: ['Computer Use is on. Its tools, from the computer-use MCP server, are available now.', 'Computer Use is already on. Use the tools from the computer-use MCP server.'],
				cards: 1,
				enableCalls: 1,
			},
			notNow: {
				results: ['The user chose not to turn on Computer Use. Continue without it, and don\'t ask again in this chat. If they ask for it later, tell them they can turn it on with /computer on.', 'The user already chose not to turn on Computer Use in this chat. Continue without it. If they ask for it, tell them they can turn it on with /computer on.'],
				cards: 1,
				enableCalls: 0,
			},
			declined: {
				results: ['The user chose not to turn on Computer Use. Continue without it, and don\'t ask again in this chat. If they ask for it later, tell them they can turn it on with /computer on.', 'The user already chose not to turn on Computer Use in this chat. Continue without it. If they ask for it, tell them they can turn it on with /computer on.'],
				cards: 1,
				enableCalls: 0,
			},
			cancelled: {
				results: ['The request to turn on Computer Use was cancelled.', 'The request to turn on Computer Use was cancelled.'],
				cards: 2,
				enableCalls: 0,
			},
		});
	});

	test('reports Computer Use as on when the user turned it on with `/computer on` after a decline', async () => {
		const { chat, call, answer } = await createActivation();
		const first = call();
		await answer(0, ChatInputResponseKind.Accept, getComputerUseActivationAnswers('notNow'));
		await first;
		chat.plugins = [{ name: 'computer-use', source: 'builtin', enabled: true }];
		assert.deepStrictEqual({ result: (await call()).textResultForLlm, cards: chat.requests.length }, {
			result: 'Computer Use is already on. Use the tools from the computer-use MCP server.',
			cards: 1,
		});
	});

	test('answers without a card when Computer Use is gone, already on, blocked by policy or no one can answer', async () => {
		const outcome = async (configure: (chat: TestActivationChat, activation: CopilotComputerUseActivation) => void) => {
			const { chat, activation, call } = await createActivation();
			configure(chat, activation);
			return { result: (await call()).textResultForLlm, cards: chat.requests.length };
		};
		assert.deepStrictEqual({
			gone: await outcome(chat => chat.plugins = []),
			alreadyOn: await outcome(chat => chat.plugins = [{ name: 'computer-use', source: 'builtin', enabled: true }]),
			blocked: await outcome((_chat, activation) => activation.observeManagedSettings({ features: { computerUse: false } })),
			unattended: await outcome(chat => chat.canAsk = false),
		}, {
			gone: { result: 'Computer Use isn\'t available in this chat. Continue without it.', cards: 0 },
			alreadyOn: { result: 'Computer Use is already on. Use the tools from the computer-use MCP server.', cards: 0 },
			blocked: { result: 'The user\'s organization turned off Computer Use, so it can\'t be turned on. Continue without it.', cards: 0 },
			unattended: { result: 'Computer Use is off, and no one can turn it on while this chat runs unattended. Continue without it, and tell the user they can turn it on with /computer on.', cards: 0 },
		});
	});

	test('reads only an explicit managed `features.computerUse: false` as blocked', async () => {
		const blocked = async (settings: unknown) => {
			const { chat, activation, call } = await createActivation();
			activation.observeManagedSettings({ features: { computerUse: false } });
			activation.observeManagedSettings(settings);
			const result = call();
			const first = await Promise.race([chat.request(0).then(() => 'card'), result.then(() => 'answered')]);
			activation.cancel();
			await result;
			return first === 'answered';
		};
		assert.deepStrictEqual([await blocked({ features: { computerUse: false } }), await blocked(undefined), await blocked({ features: { computerUse: true } }), await blocked({ features: 'off' }), await blocked('x')], [true, false, false, false, false]);
	});

	test('lets calls made while the user decides share one card', async () => {
		const { chat, call, answer } = await createActivation();
		const first = call();
		const second = call();
		await answer(0, ChatInputResponseKind.Accept, getComputerUseActivationAnswers('turnOn'));
		assert.deepStrictEqual({ results: [(await first).resultType, (await second).resultType], cards: chat.requests.length, enableCalls: chat.enableCalls }, {
			results: ['success', 'success'],
			cards: 1,
			enableCalls: 1,
		});
	});

	test('reports to the model when the runtime doesn\'t turn Computer Use on', async () => {
		const failure = async (configure: (chat: TestActivationChat) => void) => {
			const { call, answer } = await createActivation(configure);
			const result = call();
			await answer(0, ChatInputResponseKind.Accept, getComputerUseActivationAnswers('turnOn'));
			const { resultType, textResultForLlm } = await result;
			return { resultType, textResultForLlm };
		};
		assert.deepStrictEqual({
			throws: await failure(chat => chat.enableError = new Error('repository controls enabledPlugins')),
			ignored: await failure(chat => chat.enableIgnored = true),
		}, {
			throws: { resultType: 'failure', textResultForLlm: 'Computer Use couldn\'t be turned on: repository controls enabledPlugins. Continue without it.' },
			ignored: { resultType: 'failure', textResultForLlm: 'Computer Use couldn\'t be turned on. Continue without it.' },
		});
	});
});
