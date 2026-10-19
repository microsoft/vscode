/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatDynamicVariableModel } from '../../../../../workbench/contrib/chat/browser/attachments/chatDynamicVariables.js';
import { IChatAgentService } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { IChatVariablesService, IDynamicVariable } from '../../../../../workbench/contrib/chat/common/attachments/chatVariables.js';
import { IChatRequestVariableEntry, toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatSlashCommandService, IChatSlashData } from '../../../../../workbench/contrib/chat/common/participants/chatSlashCommands.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ChatRequestParser } from '../../../../../workbench/contrib/chat/common/requestParser/chatRequestParser.js';
import { INewChatInputSendRequest } from '../../browser/newChatComposerInput.js';
import { SharedChatInputComposer } from '../../browser/sharedChatInputComposer.js';

suite('SharedChatInputComposer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const context = toPasteVariableEntry('Context', 'Pasted context', { id: 'context' });

	/** A composer over a fake chat widget, recording what the host is asked to send and the commands it runs. */
	function createComposer(options: { sendResult?: boolean | Error; canSendRequest?: boolean; text?: string; attachments?: IChatRequestVariableEntry[]; references?: IDynamicVariable[] } = {}) {
		let text = options.text ?? 'Build it';
		let attachments: IChatRequestVariableEntry[] = options.attachments ?? [context];
		let references = options.references ?? [];
		let restoredReferences: unknown;
		let inputEnabled = true;
		let draftModelState: object | undefined;
		const requests: { query: string; attachments: string[]; background: boolean }[] = [];
		const commands: { command: string; prompt: string }[] = [];
		const slashCommands = new class extends mock<IChatSlashCommandService>() {
			override getCommands(): IChatSlashData[] {
				return [{ command: 'models', detail: '', locations: [ChatAgentLocation.Chat], silent: true, executeImmediately: true }];
			}
			override async executeCommand(command: string, prompt: string) {
				commands.push({ command, prompt });
			}
		};
		const parser = new ChatRequestParser(new class extends mock<IChatAgentService>() { }, new class extends mock<IChatVariablesService>() { }, slashCommands, new class extends mock<IPromptsService>() {
			override isValidSlashCommandName() { return false; }
		});
		const attachmentModel = {
			get attachments() { return attachments; },
			addContext: (...entries: IChatRequestVariableEntry[]) => { attachments = [...attachments, ...entries]; },
		};
		const widget = {
			getInput: () => text,
			setInput: (value: string) => { text = value; },
			inputEditor: { getModel: () => undefined },
			viewModel: { sessionResource: URI.parse('draft:/chat') },
			supportsFileReferences: true,
			getContrib: () => ({
				get variables() { return references; },
				setInputState: (state: Record<string, unknown>) => { restoredReferences = state[ChatDynamicVariableModel.ID]; },
			}),
			attachmentModel,
			input: {
				attachmentModel,
				currentModeKind: ChatModeKind.Agent,
				selectedToolsModel: { entriesMap: { get: () => new Map() } },
				setInputEnabled: (enabled: boolean) => { inputEnabled = enabled; },
				getAttachedContext: () => ({ asArray: () => [...attachments] }),
				acceptInput: async () => {
					text = '';
					attachments = [];
					references = [];
				},
			},
		};
		const composer: SharedChatInputComposer = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_widget: widget,
			_sending: observableValue('sending', false),
			_userInteractionSource: store.add(new MutableDisposable()),
			_canSendRequest: constObservable(options.canSendRequest ?? true),
			_modelRef: { value: { object: { inputModel: { setState: (state: object) => { draftModelState = state; } } } } },
			options: {
				session: constObservable(undefined),
				sendRequest: async (request: INewChatInputSendRequest) => {
					requests.push({ query: request.query, attachments: request.attachments?.map(entry => entry.range ? `${entry.id}@${entry.range.start}-${entry.range.endExclusive}` : entry.id) ?? [], background: !!request.background });
					if (options.sendResult instanceof Error) {
						throw options.sendResult;
					}
					return options.sendResult ?? true;
				},
			},
			storageService: { store: () => { } },
			logService: new NullLogService(),
			chatSlashCommandService: slashCommands,
			instantiationService: { createInstance: (ctor: unknown) => ctor === ChatRequestParser ? parser : { cancel: () => { }, disposeSource: () => { } } },
		});
		return { composer, state: () => ({ requests, commands, restoredReferences, input: { text, attachments: attachments.map(entry => entry.id), enabled: inputEnabled }, draftModelState }) };
	}

	test('hands the prompt to the host and clears the input and the draft chat the session adopts', async () => {
		const { composer, state } = createComposer();
		const sent = await composer.submit(true);
		const { requests, input, draftModelState } = state();
		assert.deepStrictEqual({ sent, requests, input, draftModelState }, {
			sent: true,
			requests: [{ query: 'Build it', attachments: ['context'], background: true }],
			input: { text: '', attachments: [], enabled: true },
			draftModelState: { inputText: '', attachments: [] },
		});
	});

	for (const sendResult of [false, new Error('send failed')]) {
		test(`restores the prompt when the host does not send (${sendResult instanceof Error ? 'error' : 'declined'})`, async () => {
			const { composer, state } = createComposer({ sendResult });
			const sent = await composer.submit(true);
			assert.deepStrictEqual({ sent, input: state().input }, { sent: false, input: { text: 'Build it', attachments: ['context'], enabled: true } });
		});
	}

	test('does not send while the host blocks sending', async () => {
		const { composer, state } = createComposer({ canSendRequest: false });
		const sent = await composer.submit(true);
		assert.deepStrictEqual({ sent, requests: state().requests }, { sent: false, requests: [] });
	});

	for (const background of [false, true]) {
		test(`runs client-side commands in the input instead of sending them (${background ? 'background' : 'regular'} submit)`, async () => {
			const { composer, state } = createComposer({ text: '/models gpt', canSendRequest: false });
			const sent = await composer.submit(background);
			assert.deepStrictEqual({ sent, commands: state().commands, requests: state().requests, text: state().input.text }, {
				sent: true,
				commands: [{ command: 'models', prompt: 'gpt' }],
				requests: [],
				text: '',
			});
		});
	}

	test('sends inline references relative to the trimmed prompt and restores them when sending fails', async () => {
		const reference: IDynamicVariable = { id: 'file', range: new Range(1, 7, 1, 12), data: 'a.ts' };
		const { composer, state } = createComposer({
			text: '  Fix #a.ts',
			attachments: [context, { kind: 'generic', id: 'file', name: 'a.ts', value: 'a.ts', range: { start: 6, endExclusive: 11 } }],
			references: [reference],
			sendResult: false,
		});
		const sent = await composer.submit(true);
		assert.deepStrictEqual({ sent, requests: state().requests, input: state().input, restoredReferences: state().restoredReferences }, {
			sent: false,
			requests: [{ query: 'Fix #a.ts', attachments: ['context', 'file@4-9'], background: true }],
			input: { text: '  Fix #a.ts', attachments: ['context', 'file'], enabled: true },
			restoredReferences: [reference],
		});
	});

	test('binds the latest draft when an earlier draft finishes loading later', async () => {
		const loads = new Map<string, { result: DeferredPromise<{ object: { id: string }; dispose(): void }>; token: CancellationToken }>();
		const released: string[] = [];
		const bound: string[] = [];
		const modelRef = store.add(new MutableDisposable());
		const composer: { _bindModel(resource: URI): Promise<void> } = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: store.add(new DisposableStore()),
			_modelRef: modelRef,
			_widget: {
				getInput: () => '',
				setModel: (model: { id: string }) => bound.push(model.id),
				attachmentModel: { attachments: [], clearAndSetContext: () => { } },
			},
			chatService: {
				acquireOrLoadSession: (resource: URI, _location: unknown, token: CancellationToken) => {
					const result = new DeferredPromise<{ object: { id: string }; dispose(): void }>();
					loads.set(resource.path, { result, token });
					return result.p;
				},
			},
			logService: new NullLogService(),
		});
		const resolve = (path: string) => loads.get(path)!.result.complete({ object: { id: path }, dispose: () => released.push(path) });

		const first = composer._bindModel(URI.parse('draft:/first'));
		const second = composer._bindModel(URI.parse('draft:/second'));
		resolve('/second');
		await second;
		resolve('/first');
		await first;

		assert.deepStrictEqual({ bound, released, firstLoadCancelled: loads.get('/first')!.token.isCancellationRequested }, {
			bound: ['/second'],
			released: ['/first'],
			firstLoadCancelled: true,
		});
	});

	test('shows progress only once initializing or sending outlasts the delay', () => runWithFakedTimers({}, async () => {
		const busyStore = new DisposableStore();
		const loading = observableValue('loading', false);
		const sending = observableValue('sending', false);
		const busy: string[] = [];
		const composer: { _renderBusyState(key: { set(value: string): void }): void } = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: busyStore,
			_sending: sending,
			options: { loading },
		});
		composer._renderBusyState({ set: value => busy.push(value) });
		loading.set(true, undefined);
		await timeout(100);
		loading.set(false, undefined);
		await timeout(1000);
		sending.set(true, undefined);
		await timeout(1000);
		sending.set(false, undefined);
		busyStore.dispose();
		assert.deepStrictEqual(busy.filter(value => value !== ''), ['sending']);
	}));
});
