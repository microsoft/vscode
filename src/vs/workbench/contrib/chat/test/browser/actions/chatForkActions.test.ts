/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService, IPromptChoice } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { ForkConversationAction, IForkConversationOptions } from '../../../browser/actions/chatForkActions.js';
import { ChatViewPaneTarget, IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatPetService } from '../../../browser/chatPetService.js';
import { ChatSlashCommandsContribution } from '../../../browser/chatSlashCommands.js';
import { IChatEditorOptions } from '../../../browser/widgetHosts/editor/chatEditor.js';
import { IChatModelReference, IChatService } from '../../../common/chatService/chatService.js';
import { ChatSessionForkError, getChatSessionInitialMessageVariables, IChatSession, IChatSessionItem, IChatSessionRequestHistoryItem, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, SessionTypeSelectionReason } from '../../../common/constants.js';
import { IChatModel, IChatRequestModel, ISerializableChatData } from '../../../common/model/chatModel.js';
import { IChatRequestViewModel, IChatViewModel } from '../../../common/model/chatViewModel.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { IChatSlashCallback, IChatSlashCommandService, IChatSlashData } from '../../../common/participants/chatSlashCommands.js';

class TestForkConversationAction extends ForkConversationAction {
	openForkedSession(instantiationService: TestInstantiationService, parentSessionResource: URI, forkedSessionResource: URI, options?: IForkConversationOptions): Promise<void> {
		return this._openForkedSession(instantiationService, parentSessionResource, forkedSessionResource, options);
	}
}

suite('ForkConversationAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('rebases and deduplicates fork prompt variables', () => {
		const variables = getChatSessionInitialMessageVariables({
			text: 'prompt',
			textOffset: 13,
			requestOptions: {
				attachedContext: [
					{ id: 'text', name: 'text', kind: 'generic', value: URI.parse('file:///text'), range: { start: 13, endExclusive: 19 } },
					{ id: 'prefix', name: 'prefix', kind: 'generic', value: URI.parse('file:///prefix'), range: { start: 2, endExclusive: 7 } },
				],
				resolvedVariables: [
					{ id: 'text', name: 'text', kind: 'generic', value: URI.parse('file:///text'), range: { start: 13, endExclusive: 19 } },
					{ id: 'image', name: 'image', kind: 'generic', value: URI.parse('file:///image') },
				],
			},
		});

		assert.deepStrictEqual(variables.map(variable => ({ id: variable.id, range: variable.range })), [
			{ id: 'text', range: { start: 0, endExclusive: 6 } },
			{ id: 'prefix', range: undefined },
			{ id: 'image', range: undefined },
		]);
	});

	test('retains target identity and original cause for unknown prompt forks', () => {
		const target = URI.parse('contributed:/source#fork');
		const cause = new Error('connection lost');
		const error = new ChatSessionForkError(target, cause);
		assert.deepStrictEqual({
			target: error.target,
			cause: error.cause,
		}, { target, cause });
	});

	test('offers three fork presentations and preserves prompt syntax and offsets', async () => {
		let forkCommand: IChatSlashCallback | undefined;
		let forkData: IChatSlashData | undefined;
		const commandCalls: { readonly options: unknown }[] = [];
		const slashCommandService = new class extends mock<IChatSlashCommandService>() {
			override registerSlashCommand(data: IChatSlashData, callback: IChatSlashCallback) {
				if (data.command === 'fork') {
					forkData = data;
					forkCommand = callback;
				}
				return Disposable.None;
			}
		}();
		const commandService = upcastPartial<ICommandService>({
			executeCommand: async (_commandId: string, _resource: URI, options?: unknown) => {
				commandCalls.push({ options });
			},
		});
		const configurationService = new TestConfigurationService();
		disposables.add(new ChatSlashCommandsContribution(
			slashCommandService, commandService, new class extends mock<IChatAgentService>() { }(),
			disposables.add(new TestInstantiationService()), new class extends mock<IAgentSessionsService>() { }(),
			new class extends mock<IChatService>() { }(), configurationService, new class extends mock<IChatWidgetService>() { }(),
			new class extends mock<IAgentHostService>() { }(), new class extends mock<IAgentHostUntitledProvisionalSessionService>() { }(),
			new class extends mock<IAgentHostSessionWorkingDirectoryResolver>() { }(), new class extends mock<IWorkspaceContextService>() { }(),
			new class extends mock<IChatPetService>() { }(), new class extends mock<IWorkbenchEnvironmentService>() { override readonly isSessionsWindow = false; }(),
			new class extends mock<IAgentHostConnectionsService>() { }(),
		));
		assert.deepStrictEqual(forkData?.completionVariants?.map(variant => [variant.label, variant.insertText, variant.argumentHint, variant.executeImmediately, variant.detail ?? forkData?.detail]), [
			['/fork', '', undefined, true, 'Fork conversation into a new chat session'],
			['/fork <title>', '/fork ', 'title', undefined, 'Fork conversation with a custom title'],
			['/fork prompt <prompt>', '/fork prompt ', 'prompt', undefined, 'Fork conversation and send a prompt'],
		]);

		const resource = URI.parse('agent-host-copilot:/source');
		assert.ok(forkCommand);
		await forkCommand('prompt  line one\nline two', { report: () => { } }, [], ChatAgentLocation.Chat, resource, CancellationToken.None, {
			attachedContext: [],
		}, { input: '/fork   prompt  line one\nline two' });
		await forkCommand('prompting title', { report: () => { } }, [], ChatAgentLocation.Chat, resource, CancellationToken.None, undefined, { input: '/fork prompting title' });
		await forkCommand('prompt   ', { report: () => { } }, [], ChatAgentLocation.Chat, resource, CancellationToken.None, undefined, { input: '/fork prompt   ' });
		await forkCommand('prompt legacy title', { report: () => { } }, [], ChatAgentLocation.Chat, URI.parse('contributed:/source'), CancellationToken.None, undefined, { input: '/fork prompt legacy title' });

		assert.deepStrictEqual(commandCalls.map(call => call.options), [
			{ initialMessage: { text: ' line one\nline two', textOffset: 15, requestOptions: { attachedContext: [], resolvedVariables: undefined } } },
			{ title: 'prompting title' },
			undefined,
			{ title: 'prompt legacy title' },
		]);
	});

	test('retains the created target when opening an initial-message fork fails', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const source = URI.parse('agent-host-copilot:/source');
		const target = URI.parse('agent-host-copilot:/source#fork');
		const cause = new Error('Unable to open the new chat');
		let creations = 0;
		let openings = 0;
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({}));
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [source.scheme],
			forkChatSession: async () => {
				creations++;
				return { resource: target, label: 'Fork', timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined } };
			},
		}));
		const action = new class extends ForkConversationAction {
			protected override async _openForkedSession(): Promise<void> {
				openings++;
				throw cause;
			}
		};
		await assert.rejects(
			instantiationService.invokeFunction(accessor => action.run(accessor, source, { initialMessage: { text: 'new prompt' } })),
			error => {
				assert.ok(error instanceof ChatSessionForkError);
				assert.deepStrictEqual({ target: error.target, cause: error.cause, creations, openings }, { target, cause, creations: 1, openings: 1 });
				return true;
			},
		);
	});

	test('offers target inspection for an unknown transport outcome without restoring or resending the prompt', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const source = URI.parse('agent-host-copilot:/source');
		const target = source.with({ fragment: 'fork' });
		const failure = new ChatSessionForkError(target, new Error('connection lost'));
		const choices: IPromptChoice[] = [];
		const prompts: string[] = [];
		const errors: string[] = [];
		const opens: URI[] = [];
		let creations = 0;
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({}));
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override prompt(...args: Parameters<INotificationService['prompt']>) {
				prompts.push(String(args[1]));
				choices.push(...args[2]);
				return super.prompt(...args);
			}
			override error(...args: Parameters<TestNotificationService['error']>) {
				errors.push(String(args[0]));
				return super.error(...args);
			}
		}());
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [source.scheme],
			forkChatSession: async () => {
				creations++;
				throw failure;
			},
		}));
		const action = new class extends ForkConversationAction {
			protected override async _openForkedSession(_instantiationService: IInstantiationService, _source: URI, target: URI): Promise<void> {
				opens.push(target);
			}
		};
		await assert.rejects(
			instantiationService.invokeFunction(accessor => action.run(accessor, source, { initialMessage: { text: 'new prompt' } })),
			error => error === failure,
		);
		const beforeInspection = [...opens];
		await choices[0]?.run();

		assert.deepStrictEqual({ beforeInspection, choices: choices.map(choice => choice.label), creations, opens, prompts, errors }, {
			beforeInspection: [],
			choices: ['Inspect Target'],
			creations: 1,
			opens: [target],
			prompts: ['The fork request outcome is unknown: connection lost. Inspect the target before sending the prompt again.'],
			errors: [],
		});
	});

	test('reports a failure to inspect the target instead of silently doing nothing', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const source = URI.parse('agent-host-copilot:/source');
		const target = source.with({ fragment: 'fork' });
		const failure = new ChatSessionForkError(target, new Error('connection lost'));
		const choices: IPromptChoice[] = [];
		const errors: string[] = [];
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({}));
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override prompt(...args: Parameters<INotificationService['prompt']>) {
				choices.push(...args[2]);
				return super.prompt(...args);
			}
			override error(...args: Parameters<TestNotificationService['error']>) {
				errors.push(String(args[0]));
				return super.error(...args);
			}
		}());
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [source.scheme],
			forkChatSession: async () => {
				throw failure;
			},
		}));
		const action = new class extends ForkConversationAction {
			protected override async _openForkedSession(): Promise<void> {
				throw new Error('The forked chat did not appear, so it was most likely never created.');
			}
		};
		await assert.rejects(
			instantiationService.invokeFunction(accessor => action.run(accessor, source, { initialMessage: { text: 'new prompt' } })),
			error => error === failure,
		);
		await choices[0]?.run();

		assert.deepStrictEqual(errors, [
			'The forked chat could not be opened: The forked chat did not appear, so it was most likely never created..',
		]);
	});

	test('trims only the fork slash command title', async () => {
		let forkCommand: IChatSlashCallback | undefined;
		let forkData: IChatSlashData | undefined;
		const commandCalls: { readonly resource: URI; readonly options: object | undefined }[] = [];
		const slashCommandService = new class extends mock<IChatSlashCommandService>() {
			override registerSlashCommand(data: IChatSlashData, callback: IChatSlashCallback) {
				if (data.command === 'fork') {
					forkData = data;
					forkCommand = callback;
				}
				return Disposable.None;
			}
		}();
		const commandService = upcastPartial<ICommandService>({
			executeCommand: async (_commandId: string, resource: URI, options?: object) => {
				commandCalls.push({ resource, options });
				return undefined;
			},
		});
		const configurationService = new TestConfigurationService();
		disposables.add(new ChatSlashCommandsContribution(
			slashCommandService,
			commandService,
			new class extends mock<IChatAgentService>() { }(),
			disposables.add(new TestInstantiationService()),
			new class extends mock<IAgentSessionsService>() { }(),
			new class extends mock<IChatService>() { }(),
			configurationService,
			new class extends mock<IChatWidgetService>() { }(),
			new class extends mock<IAgentHostService>() { }(),
			new class extends mock<IAgentHostUntitledProvisionalSessionService>() { }(),
			new class extends mock<IAgentHostSessionWorkingDirectoryResolver>() { }(),
			new class extends mock<IWorkspaceContextService>() { }(),
			new class extends mock<IChatPetService>() { }(),
			new class extends mock<IWorkbenchEnvironmentService>() { override readonly isSessionsWindow = false; }(),
			new class extends mock<IAgentHostConnectionsService>() { }(),
		));
		const resource = URI.parse('contributed:/source');
		const agentHostResource = URI.parse('agent-host-copilot:/source');

		assert.ok(forkCommand);
		for (const prompt of ['', '   ', '  My  title.  ']) {
			await forkCommand(prompt, { report: () => { } }, [], ChatAgentLocation.Chat, resource, CancellationToken.None);
		}
		await forkCommand('icipant /fork Participant title  ', { report: () => { } }, [], ChatAgentLocation.Chat, agentHostResource, CancellationToken.None, undefined, { input: '@participant /fork Participant title  ' });
		await forkCommand('ork  Leading title  ', { report: () => { } }, [], ChatAgentLocation.Chat, agentHostResource, CancellationToken.None, undefined, { input: '   /fork  Leading title  ' });
		await forkCommand('  Fallback  title.  ', { report: () => { } }, [], ChatAgentLocation.Chat, agentHostResource, CancellationToken.None);
		await forkCommand('Legacy title', { report: () => { } }, [], ChatAgentLocation.Chat, resource, CancellationToken.None, undefined, { input: '/fork Different title' });

		assert.deepStrictEqual({
			executeImmediately: forkData?.executeImmediately,
			detailIncludesNewChatSession: forkData?.detail.includes('new chat session'),
			commandCalls,
		}, {
			executeImmediately: true,
			detailIncludesNewChatSession: true,
			commandCalls: [
				{ resource, options: undefined },
				{ resource, options: undefined },
				{ resource, options: { title: 'My  title.' } },
				{ resource: agentHostResource, options: { title: 'Participant title' } },
				{ resource: agentHostResource, options: { title: 'Leading title' } },
				{ resource: agentHostResource, options: { title: 'Fallback  title.' } },
				{ resource, options: { title: 'Legacy title' } },
			],
		});
	});

	test('forwards a title from a URI fork through contributed hooks', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const source = URI.parse('contributed:/source');
		const fork = URI.parse('contributed:/fork');
		const calls: { resource: URI; options: object | undefined }[] = [];
		const hooks: (IForkConversationOptions | undefined)[] = [];
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [source.scheme],
			sessionSupportsFork: () => true,
			forkChatSession: async (resource, _request, _token, options?: object) => {
				calls.push({ resource, options });
				return { resource: fork, label: 'Fork', timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined } };
			},
		}));
		const action = new class extends ForkConversationAction {
			protected override async _tryForkAsChat(_instantiationService: IInstantiationService, _source: URI, _request: IChatSessionRequestHistoryItem | undefined, options?: IForkConversationOptions): Promise<boolean> {
				hooks.push(options);
				return false;
			}
			protected override async _openForkedSession(): Promise<void> { }
		};

		await instantiationService.invokeFunction(accessor => action.run(accessor, source, { title: 'My title' }));

		assert.deepStrictEqual({ calls, hooks }, {
			calls: [{ resource: source, options: { title: 'My title' } }],
			hooks: [{ title: 'My title' }],
		});
	});

	const circularMetadata: { self?: object } = {};
	circularMetadata.self = circularMetadata;
	const sharedRequestOptions = { attachedContext: [] };
	const forkIdentityCases: { name: string; first: IForkConversationOptions; second: IForkConversationOptions }[] = [
		{ name: 'requested title', first: { title: 'First' }, second: { title: 'Second' } },
		{ name: 'initial prompt', first: { initialMessage: { text: 'First' } }, second: { initialMessage: { text: 'Second' } } },
		{ name: 'source request', first: { title: 'Same title', sourceRequestId: 'first' }, second: { title: 'Same title', sourceRequestId: 'second' } },
		{
			name: 'initial prompt offset',
			first: { initialMessage: { text: 'Same prompt', textOffset: 13, requestOptions: sharedRequestOptions } },
			second: { initialMessage: { text: 'Same prompt', textOffset: 20, requestOptions: sharedRequestOptions } },
		},
		{
			name: 'initial prompt intent reference',
			first: { initialMessage: { text: 'Same prompt' } },
			second: { initialMessage: { text: 'Same prompt' } },
		},
		{
			name: 'initial attachment payload',
			first: { initialMessage: { text: 'Same prompt', requestOptions: { attachedContext: [{ id: 'context', name: 'context', kind: 'generic', value: 'first payload' }] } } },
			second: { initialMessage: { text: 'Same prompt', requestOptions: { attachedContext: [{ id: 'context', name: 'context', kind: 'generic', value: 'second payload' }] } } },
		},
		{
			name: 'circular attachment value and metadata context',
			first: { initialMessage: { text: 'Same prompt', requestOptions: { attachedContext: [{ id: 'context', name: 'context', kind: 'generic', value: circularMetadata, _meta: circularMetadata }] } } },
			second: { initialMessage: { text: 'Same prompt', requestOptions: { attachedContext: [{ id: 'context', name: 'context', kind: 'generic', value: circularMetadata, _meta: circularMetadata }] } } },
		},
		{
			name: 'BigInt attachment context',
			first: { initialMessage: { text: 'Same prompt', requestOptions: { attachedContext: [{ id: 'context', name: 'context', kind: 'generic', value: 1n }] } } },
			second: { initialMessage: { text: 'Same prompt', requestOptions: { attachedContext: [{ id: 'context', name: 'context', kind: 'generic', value: 2n }] } } },
		},
		{
			name: 'function attachment context with colliding serialization',
			first: { initialMessage: { text: 'Same prompt', requestOptions: { attachedContext: [{ id: 'context', name: 'context', kind: 'generic', value: () => 'first payload' }] } } },
			second: { initialMessage: { text: 'Same prompt', requestOptions: { attachedContext: [{ id: 'context', name: 'context', kind: 'generic', value: () => 'second payload' }] } } },
		},
	];
	for (const scenario of forkIdentityCases) {
		test(`uses the ${scenario.name} in contributed pending fork identity`, async () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			const source = URI.parse('contributed:/source');
			const calls: (object | undefined)[] = [];
			const gates: DeferredPromise<IChatSessionItem>[] = [];
			instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
			instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ openSession: async () => undefined }));
			instantiationService.stub(INotificationService, new TestNotificationService());
			instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
				getContentProviderSchemes: () => [source.scheme],
				sessionSupportsFork: () => true,
				forkChatSession: async (_resource, _request, _token, options?: object) => {
					calls.push(options);
					const gate = new DeferredPromise<IChatSessionItem>();
					gates.push(gate);
					return gate.p;
				},
			}));
			const action = new ForkConversationAction();

			const first = instantiationService.invokeFunction(accessor => action.run(accessor, source, scenario.first));
			const second = instantiationService.invokeFunction(accessor => action.run(accessor, source, scenario.second));
			const duplicate = instantiationService.invokeFunction(accessor => action.run(accessor, source, scenario.first));
			const repeatedContext = instantiationService.invokeFunction(accessor => action.run(accessor, source, {
				...scenario.first,
				...(scenario.first.initialMessage?.requestOptions ? { initialMessage: { ...scenario.first.initialMessage } } : {}),
			}));
			const outcomes = Promise.allSettled([first, second, duplicate, repeatedContext]);
			await timeout(0);
			for (const [index, gate] of gates.entries()) {
				gate.complete({ resource: URI.parse(`contributed:/fork-${index + 1}`), label: 'Fork', timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined } });
			}
			const results = await outcomes;
			await timeout(0);

			assert.deepStrictEqual({ calls, outcomes: results.map(result => result.status) }, {
				calls: [scenario.first, scenario.second],
				outcomes: ['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled'],
			});
		});
	}

	test('clears a failed pending fork before retrying the same context', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const source = URI.parse('contributed:/source');
		const target = URI.parse('contributed:/fork');
		const cause = new Error('Unable to create the fork');
		const gate = new DeferredPromise<IChatSessionItem>();
		const options: IForkConversationOptions = {
			initialMessage: { text: 'Same prompt', requestOptions: { attachedContext: [{ id: 'context', name: 'context', kind: 'generic', value: 1n }] } },
		};
		let creations = 0;
		let openings = 0;
		let fail = true;
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async () => {
				openings++;
				return undefined;
			},
		}));
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [source.scheme],
			forkChatSession: async () => {
				creations++;
				if (fail) {
					return gate.p;
				}
				return { resource: target, label: 'Fork', timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined } };
			},
		}));
		const action = new ForkConversationAction();
		const first = instantiationService.invokeFunction(accessor => action.run(accessor, source, options));
		const duplicate = instantiationService.invokeFunction(accessor => action.run(accessor, source, options));
		const outcomes = Promise.allSettled([first, duplicate]);
		await timeout(0);
		gate.error(cause);
		const results = await outcomes;
		fail = false;
		await instantiationService.invokeFunction(accessor => action.run(accessor, source, options));

		assert.deepStrictEqual({
			errors: results.map(result => result.status === 'rejected' ? result.reason : undefined),
			creations,
			openings,
		}, { errors: [cause, cause], creations: 2, openings: 1 });
	});

	test('opens a fork with the current session selection reason', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const parentSessionResource = URI.parse('vscode-chat-session://parent');
		const forkedSessionResource = URI.parse('vscode-chat-session://fork');
		let openCall: { resource: URI; usesViewTarget: boolean; options: IChatEditorOptions | undefined } | undefined;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async (resource, target, options) => {
				openCall = { resource, usesViewTarget: target === ChatViewPaneTarget, options };
				return undefined;
			},
		}));

		await new TestForkConversationAction().openForkedSession(instantiationService, parentSessionResource, forkedSessionResource, { toSide: true });

		assert.deepStrictEqual(openCall, {
			resource: forkedSessionResource,
			usesViewTarget: true,
			options: { sessionTypeSelectionReason: 'currentSession' },
		});
	});

	for (const toSide of [false, true]) {
		test(`preserves the local checkpoint and source when opening a fork${toSide ? ' to the side' : ''}`, async () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			const source = URI.parse('test-chat:/source');
			const fork = URI.parse('test-chat:/fork');
			const requests = ['first', 'second', 'third'].map((message, index) => ({
				requestId: `request-${index + 1}`,
				message,
				variableData: { variables: [] },
				response: [],
			}));
			const serializedData: ISerializableChatData = {
				version: 3,
				sessionId: 'source',
				creationDate: 0,
				customTitle: undefined,
				initialLocation: ChatAgentLocation.Chat,
				responderUsername: 'test',
				requests,
			};
			const model = upcastPartial<IChatModel>({
				sessionResource: source,
				title: 'Source',
				toJSON: () => serializedData,
				getRequests: () => requests.map(request => upcastPartial<IChatRequestModel>({ id: request.requestId })),
			});
			const checkpoint = upcastPartial<IChatRequestViewModel>({
				id: 'request-2',
				sessionResource: source,
				message: { text: 'second', parts: [] },
			});
			let loaded: Parameters<IChatService['loadSessionFromData']>[0] | undefined;
			let disposed = false;
			let opened: { parent: URI; resource: URI; options: IForkConversationOptions | undefined } | undefined;
			instantiationService.stub(IChatService, upcastPartial<IChatService>({
				getSession: resource => resource.toString() === source.toString() ? model : undefined,
				loadSessionFromData: data => {
					loaded = data;
					return upcastPartial<IChatModelReference>({
						object: upcastPartial<IChatModel>({ sessionResource: fork }),
						dispose: () => disposed = true,
					});
				},
			}));
			instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getContentProviderSchemes: () => [] }));
			instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
				getWidgetBySessionResource: () => undefined,
				lastFocusedWidget: upcastPartial<IChatWidget>({
					viewModel: upcastPartial<IChatViewModel>({ sessionResource: URI.parse('test-chat:/unrelated') }),
				}),
			}));
			const action = new class extends ForkConversationAction {
				protected override async _openForkedSession(_instantiationService: IInstantiationService, parent: URI, resource: URI, options?: IForkConversationOptions): Promise<void> {
					opened = { parent, resource, options };
				}
			};

			await instantiationService.invokeFunction(accessor => action.run(accessor, toSide ? { element: checkpoint, toSide } : checkpoint));

			assert.deepStrictEqual({
				opened,
				messages: loaded?.requests.map(request => request.message),
				sourceMessages: serializedData.requests.map(request => request.message),
				disposed,
			}, {
				opened: { parent: source, resource: fork, options: toSide ? { toSide: true } : undefined },
				messages: ['first'],
				sourceMessages: ['first', 'second', 'third'],
				disposed: true,
			});
		});
	}

	test('forwards contributed checkpoint placement through the hooks and deduplicates pending forks', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const source = URI.parse('contributed:/source');
		const fork = URI.parse('contributed:/fork');
		const checkpoint = upcastPartial<IChatRequestViewModel>({
			id: 'request-2',
			sessionResource: source,
			message: { text: 'second', parts: [] },
		});
		const request: IChatSessionRequestHistoryItem = { type: 'request', id: checkpoint.id, prompt: 'second', participant: '' };
		const gate = new DeferredPromise<IChatSessionItem>();
		const started = new DeferredPromise<void>();
		const calls: { resource: URI; request: IChatSessionRequestHistoryItem | undefined; options: object | undefined }[] = [];
		const hooks: { source: URI; request: IChatSessionRequestHistoryItem | undefined; options: IForkConversationOptions | undefined }[] = [];
		const opens: { source: URI; resource: URI; options: IForkConversationOptions | undefined }[] = [];
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: () => undefined }));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [source.scheme],
			sessionSupportsFork: () => true,
			getOrCreateChatSession: async () => upcastPartial<IChatSession>({ history: [request] }),
			forkChatSession: async (resource, request, _token, options) => {
				calls.push({ resource, request, options });
				started.complete();
				return gate.p;
			},
		}));
		const action = new class extends ForkConversationAction {
			protected override async _tryForkAsChat(_instantiationService: IInstantiationService, source: URI, request: IChatSessionRequestHistoryItem | undefined, options?: IForkConversationOptions): Promise<boolean> {
				hooks.push({ source, request, options });
				return false;
			}
			protected override async _openForkedSession(_instantiationService: IInstantiationService, source: URI, resource: URI, options?: IForkConversationOptions): Promise<void> {
				opens.push({ source, resource, options });
			}
		};
		const first = instantiationService.invokeFunction(accessor => action.run(accessor, { element: checkpoint, toSide: true }));
		await started.p;
		const second = instantiationService.invokeFunction(accessor => action.run(accessor, checkpoint));
		await timeout(0);
		gate.complete({ resource: fork, label: 'Fork', timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined } });
		await Promise.all([first, second]);

		assert.deepStrictEqual({ calls, hooks, opens }, {
			calls: [{ resource: source, request, options: undefined }],
			hooks: [{ source, request, options: { toSide: true } }, { source, request, options: undefined }],
			opens: [{ source, resource: fork, options: { toSide: true } }],
		});
	});

	test('loads a local fork with the current session selection reason', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const sourceSessionResource = URI.parse('vscode-chat-session://source');
		const forkedSessionResource = URI.parse('vscode-chat-session://fork');
		const serializedData: ISerializableChatData = {
			version: 3,
			sessionId: 'source',
			creationDate: 0,
			customTitle: undefined,
			initialLocation: ChatAgentLocation.Chat,
			responderUsername: 'test',
			requests: [{
				requestId: 'request',
				message: 'hello',
				variableData: { variables: [] },
				response: [],
			}],
		};
		const sourceModel = upcastPartial<IChatModel>({
			sessionResource: sourceSessionResource,
			title: 'Source',
			toJSON: () => serializedData,
		});
		let loadCall: { debugOwner: string | undefined; selectionReason: SessionTypeSelectionReason | undefined } | undefined;
		let modelDisposed = false;
		const modelRef = upcastPartial<IChatModelReference>({
			object: upcastPartial<IChatModel>({ sessionResource: forkedSessionResource, sessionTypeSelectionReason: 'currentSession' }),
			dispose: () => modelDisposed = true,
		});
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: resource => resource.toString() === sourceSessionResource.toString() ? sourceModel : undefined,
			loadSessionFromData: (_data, debugOwner, selectionReason) => {
				loadCall = { debugOwner, selectionReason };
				return modelRef;
			},
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			getContentProviderSchemes: () => [],
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async () => undefined,
		}));

		await instantiationService.invokeFunction(accessor => new ForkConversationAction().run(accessor, sourceSessionResource));
		await timeout(0);

		assert.deepStrictEqual({ loadCall, modelDisposed }, {
			loadCall: {
				debugOwner: 'ChatForkActions#forkCleanSession',
				selectionReason: 'currentSession',
			},
			modelDisposed: true,
		});
	});
});
