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
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatRequestVariableEntry, toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { INewChatInputSendRequest } from '../../browser/newChatComposerInput.js';
import { SharedChatInputComposer } from '../../browser/sharedChatInputComposer.js';

suite('SharedChatInputComposer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const context = toPasteVariableEntry('Context', 'Pasted context', { id: 'context' });

	/** A composer over a fake chat widget, recording what the host is asked to send. */
	function createComposer(options: { sendResult?: boolean | Error; canSendRequest?: boolean } = {}) {
		let text = 'Build it';
		let attachments: IChatRequestVariableEntry[] = [context];
		let inputEnabled = true;
		let draftModelState: object | undefined;
		const requests: { query: string; attachments: string[]; background: boolean }[] = [];
		const widget = {
			getInput: () => text,
			setInput: (value: string) => { text = value; },
			inputEditor: { getModel: () => undefined },
			attachmentModel: {
				get attachments() { return attachments; },
				addContext: (...entries: IChatRequestVariableEntry[]) => { attachments = [...attachments, ...entries]; },
			},
			input: {
				setInputEnabled: (enabled: boolean) => { inputEnabled = enabled; },
				getAttachedContext: () => ({ asArray: () => [...attachments] }),
				acceptInput: async () => {
					text = '';
					attachments = [];
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
					requests.push({ query: request.query, attachments: request.attachments?.map(entry => entry.id) ?? [], background: !!request.background });
					if (options.sendResult instanceof Error) {
						throw options.sendResult;
					}
					return options.sendResult ?? true;
				},
			},
			storageService: { store: () => { } },
			logService: new NullLogService(),
		});
		return { composer, state: () => ({ requests, input: { text, attachments: attachments.map(entry => entry.id), enabled: inputEnabled }, draftModelState }) };
	}

	test('hands the prompt to the host and clears the input and the draft chat the session adopts', async () => {
		const { composer, state } = createComposer();
		const sent = await composer.submit(true);
		assert.deepStrictEqual({ sent, ...state() }, {
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
