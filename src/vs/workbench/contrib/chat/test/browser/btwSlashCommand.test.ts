/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorIdentifier } from '../../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { BtwSlashCommandContribution } from '../../browser/btwSlashCommand.js';
import { EditorSideChatProviderContribution } from '../../browser/chatSideChatProvider.js';
import { ChatTreeItem, IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatEditorInput } from '../../browser/widgetHosts/editor/chatEditorInput.js';
import { ChatSendResult, IChatSendRequestData, IChatSendRequestOptions, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatSideChatService, IChatSideChatOrigin, IChatSideChatRequestOptions, IChatSideChatSelection } from '../../common/chatSideChatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { IChatModel, IChatRequestModel } from '../../common/model/chatModel.js';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel } from '../../common/model/chatViewModel.js';
import { IChatSlashCallback, IChatSlashCommandService, IChatSlashData } from '../../common/participants/chatSlashCommands.js';

suite('BtwSlashCommandContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const source = URI.parse('agent-host-copilot:/source#peer');
	const target = source.with({ fragment: 'side' });
	const modeInfo: NonNullable<IChatSendRequestOptions['modeInfo']> = {
		kind: ChatModeKind.Agent, isBuiltin: true, modeInstructions: undefined,
		telemetryModeId: 'agent', applyCodeBlockSuggestionId: undefined, permissionLevel: undefined,
	};

	function setup(options?: {
		isSessionsWindow?: boolean;
		supported?: boolean;
		unavailable?: boolean;
		readOnly?: boolean;
		noTurn?: boolean;
		sourceTurnIds?: string[];
		sourceWidget?: IChatWidget;
		openedWidget?: IChatWidget;
		origin?: IObservable<IChatSideChatOrigin | undefined>;
		openError?: Error;
		sourceGroupId?: number;
		sourceEditorResource?: URI;
		fail?: 'create' | 'open' | 'send';
	}) {
		let registration: { data: IChatSlashData; callback: IChatSlashCallback } | undefined;
		const calls: object[] = [];
		const selections: (IChatSideChatSelection | undefined)[] = [];
		const warnings: string[] = [];
		const errors: string[] = [];
		const participants: string[] = [];
		const telemetryEvents: string[] = [];
		const activeGroup = upcastPartial<IEditorGroup>({ id: 1 });
		const sourceGroup = upcastPartial<IEditorGroup>({ id: options?.sourceGroupId ?? 1 });
		const splitGroup = upcastPartial<IEditorGroup>({ id: 3 });
		const sourceEditors: IEditorIdentifier[] = [];
		if (options?.sourceGroupId) {
			const services = disposables.add(workbenchInstantiationService(undefined, disposables));
			services.stub(IChatService, { acquireExistingSession: () => undefined });
			services.stub(IChatSessionsService, {});
			services.stub(IAgentHostEnablementService, {});
			const editor = disposables.add(services.createInstance(ChatEditorInput, options.sourceEditorResource ?? source, {}));
			editor.updateModel(upcastPartial<IChatModel>({ sessionResource: source }));
			sourceEditors.push({ editor, groupId: options.sourceGroupId });
		}
		const sideChatService = disposables.add(new ChatSideChatService());
		const chatService = upcastPartial<IChatService>({
			getSession: () => options?.unavailable ? undefined : upcastPartial<IChatModel>({
				isReadOnly: constObservable(!!options?.readOnly),
				requestInProgress: constObservable(true),
				getRequests: () => options?.noTurn ? [] : (options?.sourceTurnIds ?? ['active-turn']).map(id => upcastPartial<IChatRequestModel>({ id })),
			}),
			sendRequest: async (resource, query, sendOptions): Promise<ChatSendResult> => {
				calls.push({ send: resource, query, options: sendOptions });
				participants.push(sendOptions?.agentIdSilent ?? 'default-extension');
				return options?.fail === 'send'
					? { kind: 'rejected', reason: 'Send rejected' }
					: { kind: 'sent', data: upcastPartial<IChatSendRequestData>({}) };
			},
		});
		const chatWidgetService = upcastPartial<IChatWidgetService>({
			getWidgetBySessionResource: () => options?.sourceWidget,
			openSession: async (resource, group, editorOptions) => {
				calls.push({ open: resource, group, options: editorOptions });
				if (options?.openError) {
					throw options.openError;
				}
				return options?.fail === 'open' ? undefined : options?.openedWidget ?? upcastPartial<IChatWidget>({
					focusInput: () => calls.push({ focus: target }),
					getSelectedModelRequestOptions: () => ({ userSelectedModelId: 'native-model', userSelectedModelConfiguration: { effort: 'high' } }),
					getModeRequestOptions: () => ({ modeInfo }),
				});
			},
		});
		disposables.add(new EditorSideChatProviderContribution(
			sideChatService,
			upcastPartial<IChatSessionsService>({
				sessionSupportsSideChat: () => options?.supported !== false,
				observeSideChatOrigin: () => options?.origin ?? constObservable(undefined),
				createSideChat: async (resource, turnId, _token, selection) => {
					calls.push({ create: resource, turnId, selection });
					selections.push(selection);
					if (options?.fail === 'create') {
						throw new Error('Create failed');
					}
					return { resource: target, label: 'Side chat', timing: { created: 0, lastRequestStarted: 0, lastRequestEnded: 0 } };
				},
			}),
			chatService,
			chatWidgetService,
			upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: !!options?.isSessionsWindow }),
			upcastPartial<IEditorService>({
				getEditors: () => sourceEditors,
			}),
			upcastPartial<IEditorGroupsService>({
				activeGroup,
				getGroup: id => id === sourceGroup.id ? sourceGroup : undefined,
				findGroup: () => undefined,
				addGroup: group => {
					calls.push({ split: group });
					return splitGroup;
				},
			}),
			new TestConfigurationService(),
		));
		disposables.add(new BtwSlashCommandContribution(
			upcastPartial<IChatSlashCommandService>({
				registerSlashCommand: (data, callback) => {
					assert.strictEqual(registration, undefined);
					registration = { data, callback };
					return Disposable.None;
				},
			}),
			sideChatService,
			chatService,
			chatWidgetService,
			upcastPartial<INotificationService>({
				warn: message => warnings.push(String(message)),
				error: message => errors.push(String(message)),
			}),
			upcastPartial<ITelemetryService>({
				publicLog2: eventName => telemetryEvents.push(eventName),
			}),
		));

		return {
			registration, calls, selections, warnings, errors, participants, telemetryEvents, sourceGroup, splitGroup, sideChatService,
			run: async (prompt = 'question', requestOptions?: IChatSendRequestOptions, input = `/btw ${prompt}`) => {
				assert.ok(registration);
				await registration.callback(prompt, { report: () => { } }, [], ChatAgentLocation.Chat, source, CancellationToken.None, requestOptions, { input });
			},
		};
	}

	test('registers one silent concurrent command in either window', () => {
		const editor = setup().registration?.data;
		assert.deepStrictEqual({
			command: editor?.command,
			silent: editor?.silent,
			executeImmediately: editor?.executeImmediately,
			executeDuringRequest: editor?.executeDuringRequest,
			locations: editor?.locations,
			keys: editor?.when?.keys().sort(),
			agentsWindowCommand: setup({ isSessionsWindow: true }).registration?.data.command,
		}, {
			command: 'btw',
			silent: true,
			executeImmediately: false,
			executeDuringRequest: true,
			locations: [ChatAgentLocation.Chat],
			keys: ['chatIsEnabled', 'chatSessionSupportsSideChat', 'chatIsReadonly', 'quickChatHasFocus'].sort(),
			agentsWindowCommand: 'btw',
		});
	});

	test('does not register the editor side-chat provider in the Agents window', () => {
		const harness = setup({ isSessionsWindow: true });
		assert.strictEqual(harness.sideChatService.canAskInSideChat(source), false);
	});

	test('reports each successful /btw submission once', async () => {
		const harness = setup();
		await harness.run('first question');
		await harness.run('second question');
		assert.deepStrictEqual(harness.telemetryEvents, ['chatBtwUsed', 'chatBtwUsed']);
	});

	test('does not attribute side chats started without /btw to the command', async () => {
		const harness = setup();
		await harness.sideChatService.askInSideChat(source, 'question');
		assert.deepStrictEqual(harness.telemetryEvents, []);
	});

	test('uses the same command to forward prepared attachments to an Agents-window provider', async () => {
		const harness = setup({ isSessionsWindow: true });
		const requests: { resource: URI; query: string; options?: IChatSideChatRequestOptions }[] = [];
		disposables.add(harness.sideChatService.registerProvider({
			canAskInSideChat: () => true,
			askInSideChat: async (resource, query, _selection, options) => { requests.push({ resource, query, options }); },
			observeSideChatOrigin: () => constObservable(undefined),
			revealSideChatSource: async () => { },
		}));
		await harness.run('  question  ', {
			attachedContext: [{ id: 'inline', name: 'inline', kind: 'generic', value: 'context', range: { start: 7, endExclusive: 15 } }],
			resolvedVariables: [{ id: 'resolved', name: 'resolved', kind: 'generic', value: 'resolved context' }],
		}, '/btw   question  ');
		assert.deepStrictEqual({ requests, editorCalls: harness.calls, errors: harness.errors, telemetryEvents: harness.telemetryEvents }, {
			requests: [{
				resource: source,
				query: 'question',
				options: {
					attachedContext: [
						{ id: 'inline', name: 'inline', kind: 'generic', value: 'context', range: { start: 0, endExclusive: 8 } },
						{ id: 'resolved', name: 'resolved', kind: 'generic', value: 'resolved context' },
					],
					token: CancellationToken.None,
				},
			}],
			editorCalls: [],
			errors: [],
			telemetryEvents: ['chatBtwUsed'],
		});
	});

	test('creates a side chat and opens a pinned split before sending only the trimmed target prompt', async () => {
		const harness = setup();
		await harness.run('  question  ', {
			attachedContext: [{ id: 'inline', name: 'inline', kind: 'generic', value: 'context', range: { start: 7, endExclusive: 15 } }],
			resolvedVariables: [
				{ id: 'inline', name: 'inline', kind: 'generic', value: 'context', range: { start: 7, endExclusive: 15 } },
				{ id: 'resolved', name: 'resolved', kind: 'generic', value: URI.parse('file:///context') },
			],
		}, '/btw   question  ');
		assert.deepStrictEqual({ calls: harness.calls, warnings: harness.warnings, errors: harness.errors }, {
			calls: [
				{ create: source, turnId: 'active-turn', selection: undefined },
				{ open: target, group: SIDE_GROUP, options: { pinned: true } },
				{
					send: target, query: 'question', options: {
						location: ChatAgentLocation.Chat, agentIdSilent: source.scheme, modeInfo, userSelectedModelId: 'native-model', userSelectedModelConfiguration: { effort: 'high' }, attachedContext: [
							{ id: 'inline', name: 'inline', kind: 'generic', value: 'context', range: { start: 0, endExclusive: 8 } },
							{ id: 'resolved', name: 'resolved', kind: 'generic', value: URI.parse('file:///context') },
						]
					}
				},
				{ focus: target },
			],
			warnings: [],
			errors: [],
		});
	});

	test('routes each native side-chat request to its session participant with the selected model and agent mode', async () => {
		const harness = setup();
		await harness.run('first question');
		await harness.run('second question');
		assert.deepStrictEqual(harness.participants, [source.scheme, source.scheme]);
	});

	test('anchors a selected older response to its own turn instead of the latest turn', async () => {
		const harness = setup({ sourceTurnIds: ['older-turn', 'latest-turn'] });
		await harness.sideChatService.askInSideChat(source, 'Explain this', { text: 'Older answer' }, { sourceTurnId: 'older-turn' });
		assert.deepStrictEqual(harness.calls[0], { create: source, turnId: 'older-turn', selection: { text: 'Older answer' } });
	});

	test('rejects an explicit missing source turn without falling back to the latest turn', async () => {
		const harness = setup();
		await assert.rejects(harness.sideChatService.askInSideChat(source, 'Explain this', { text: 'Old text' }, { sourceTurnId: 'missing-turn' }));
		assert.deepStrictEqual(harness.calls, []);
	});

	test('anchors the split to the source editor rather than an unrelated active group', async () => {
		const harness = setup({ sourceGroupId: 2 });
		await harness.run();
		assert.deepStrictEqual(harness.calls.slice(0, 3), [
			{ create: source, turnId: 'active-turn', selection: undefined },
			{ split: harness.sourceGroup },
			{ open: target, group: harness.splitGroup, options: { pinned: true } },
		]);
	});

	test('finds the source session behind a distinct chat editor resource', async () => {
		const harness = setup({ sourceGroupId: 2, sourceEditorResource: ChatEditorInput.getNewEditorUri() });
		await harness.run();
		assert.deepStrictEqual(harness.calls.slice(0, 3), [
			{ create: source, turnId: 'active-turn', selection: undefined },
			{ split: harness.sourceGroup },
			{ open: target, group: harness.splitGroup, options: { pinned: true } },
		]);
	});

	suite('source navigation', () => {
		const origin: IChatSideChatOrigin = {
			sourceSessionResource: source,
			sourceTurnId: 'active-turn',
			sourceTitle: 'Source',
			selection: { text: 'Selected transcript' },
		};

		test('observes restored origin metadata and source title hydration without creating a side chat', () => {
			const metadata = observableValue<IChatSideChatOrigin | undefined>('origin', undefined);
			const harness = setup({ origin: metadata });
			const observed = harness.sideChatService.observeSideChatOrigin(target);
			const origins: (IChatSideChatOrigin | undefined)[] = [];
			disposables.add(autorun(reader => origins.push(observed.read(reader))));
			metadata.set({ ...origin, sourceTitle: undefined }, undefined);
			metadata.set(origin, undefined);
			assert.deepStrictEqual({
				origins,
				stable: observed === harness.sideChatService.observeSideChatOrigin(target),
				calls: harness.calls,
			}, { origins: [undefined, { ...origin, sourceTitle: undefined }, origin], stable: true, calls: [] });
		});

		test('uses the window-wide session helper without a target and reveals the originating request', async () => {
			const request = upcastPartial<IChatRequestViewModel>({ id: origin.sourceTurnId, message: { text: 'Source request', parts: [] } });
			const revealed: ChatTreeItem[] = [];
			const harness = setup({
				origin: constObservable(origin),
				openedWidget: upcastPartial<IChatWidget>({
					viewModel: upcastPartial<IChatViewModel>({ getItems: () => [request] }),
					reveal: item => { revealed.push(item); },
				}),
			});
			await harness.sideChatService.revealSideChatSource(target);
			assert.deepStrictEqual({ calls: harness.calls, revealed }, {
				calls: [{ open: source, group: undefined, options: undefined }],
				revealed: [request],
			});
		});

		test('does not navigate when the chat has no side-chat origin', async () => {
			const harness = setup({ fail: 'open' });
			await harness.sideChatService.revealSideChatSource(source);
			assert.deepStrictEqual(harness.calls, []);
		});

		test('opens the source without revealing a missing request or a response item', async () => {
			const response = upcastPartial<IChatResponseViewModel>({ id: origin.sourceTurnId });
			for (const items of [[], [response]]) {
				const harness = setup({
					origin: constObservable(origin),
					openedWidget: upcastPartial<IChatWidget>({
						viewModel: upcastPartial<IChatViewModel>({ getItems: () => items }),
						reveal: () => assert.fail('Only a matching request should be revealed'),
					}),
				});
				await harness.sideChatService.revealSideChatSource(target);
				assert.deepStrictEqual(harness.calls, [{ open: source, group: undefined, options: undefined }]);
			}
		});

		test('propagates source navigation failures', async () => {
			const openError = new Error('Source session is unavailable');
			const failed = setup({ origin: constObservable(origin), openError });
			const missing = setup({ origin: constObservable(origin), fail: 'open' });
			await assert.rejects(failed.sideChatService.revealSideChatSource(target), openError);
			await assert.rejects(missing.sideChatService.revealSideChatSource(target), /source conversation could not be opened/);
		});
	});

	for (const [name, options, prompt, warning] of [
		['missing prompt', {}, '  ', 'Enter a question after `/btw`.'],
		['unsupported session', { supported: false }, 'question', 'This conversation does not support side chats.'],
		['unavailable session', { unavailable: true }, 'question', 'This conversation does not support side chats.'],
		['read-only session', { readOnly: true }, 'question', 'This conversation does not support side chats.'],
		['no source turn', { noTurn: true }, 'question', 'Send a message in this conversation before starting a side chat.'],
	] as const) {
		test(`warns without mutating either chat for ${name}`, async () => {
			const harness = setup(options);
			await harness.run(prompt);
			assert.deepStrictEqual({ calls: harness.calls, warnings: harness.warnings, errors: harness.errors, telemetryEvents: harness.telemetryEvents }, { calls: [], warnings: [warning], errors: [], telemetryEvents: [] });
		});
	}

	for (const fail of ['create', 'open', 'send'] as const) {
		test(`reports ${fail} failure without sending to the source`, async () => {
			const harness = setup({ fail });
			await harness.run();
			assert.deepStrictEqual({
				calls: harness.calls.length,
				warnings: harness.warnings,
				errors: harness.errors.length,
				focused: harness.calls.some(call => hasKey(call, { focus: true })),
				telemetryEvents: harness.telemetryEvents,
			}, { calls: fail === 'create' ? 1 : fail === 'open' ? 2 : 3, warnings: [], errors: 1, focused: false, telemetryEvents: [] });
		});
	}

	test('captures transcript selection but never the question selected in the input', async () => {
		const node = dom.$('div');
		// Other suites load workbench CSS that disables native text selection on the body.
		node.style.userSelect = 'text';
		node.style.setProperty('-webkit-user-select', 'text');
		const transcript = dom.append(node, dom.$('div'));
		transcript.textContent = 'Selected transcript';
		const input = dom.append(node, dom.$('div'));
		input.textContent = 'Selected question';
		dom.getActiveDocument().body.appendChild(node);
		const selection = dom.getActiveWindow().getSelection();
		assert.ok(selection);
		disposables.add(toDisposable(() => {
			selection.removeAllRanges();
			node.remove();
		}));
		const widget = upcastPartial<IChatWidget>({
			domNode: node,
			inputEditor: upcastPartial<ICodeEditor>({ getDomNode: () => input }),
		});
		const captured: (IChatSideChatSelection | undefined)[] = [];
		for (const selectedNode of [transcript, input]) {
			const range = dom.getActiveDocument().createRange();
			range.selectNodeContents(selectedNode);
			selection.removeAllRanges();
			selection.addRange(range);
			assert.strictEqual(selection.toString(), selectedNode.textContent);
			const harness = setup({ sourceWidget: widget });
			await harness.run();
			captured.push(...harness.selections);
		}
		assert.deepStrictEqual(captured, [{ text: 'Selected transcript' }, undefined]);
	});
});
