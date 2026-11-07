/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { ChatDynamicVariableModel } from '../../../../chat/browser/attachments/chatDynamicVariables.js';
import { IChatAgentService } from '../../../../chat/common/participants/chatAgents.js';
import { IChatVariablesService, IDynamicVariable } from '../../../../chat/common/attachments/chatVariables.js';
import { IChatRequestVariableEntry, toPasteVariableEntry } from '../../../../chat/common/attachments/chatVariableEntries.js';
import { IModelPickerComparison } from '../../../../chat/browser/widget/input/modelPicker/modelPickerComparison.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../chat/common/constants.js';
import { IChatSlashCommandService, IChatSlashData } from '../../../../chat/common/participants/chatSlashCommands.js';
import { IPromptsService } from '../../../../chat/common/promptSyntax/service/promptsService.js';
import { ChatRequestParser } from '../../../../chat/common/requestParser/chatRequestParser.js';
import { INewChatComposerInputOptions, INewChatInputSendRequest } from '../../../browser/chat/newChatComposerInput.js';
import { SharedChatInputComposer } from '../../../browser/chat/sharedChatInputComposer.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatWidget, IQuickChatService } from '../../../../chat/browser/chat.js';
import { ChatWidgetService } from '../../../../chat/browser/widget/chatWidgetService.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { ComposerInputSnapshot, IComposerInputSnapshot, IComposerSendAttempt, readNewChatDraftState } from '../../../common/newChatDraftState.js';
import { IChat } from '../../../../../services/sessions/common/session.js';
import { ITestSessionWithChat } from '../sessionHostTestUtils.js';

suite('SharedChatInputComposer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const context = toPasteVariableEntry('Context', 'Pasted context', { id: 'context' });

	/** A composer over a fake chat widget, recording what the host is asked to send and the commands it runs. */
	function createComposer(options: { sendResult?: boolean | Error; disposeDuringSend?: boolean; canSendRequest?: boolean; text?: string; attachments?: IChatRequestVariableEntry[]; references?: IDynamicVariable[]; confirmSend?: DeferredPromise<boolean>; focused?: boolean; preserveInputFocusOnSend?: boolean; storageService?: IStorageService; onSend?: () => void; inputSnapshot?: IComposerInputSnapshot; onSendRequest?: () => void } = {}) {
		let text = options.text ?? 'Build it';
		let attachments: IChatRequestVariableEntry[] = options.attachments ?? [context];
		let references = options.references ?? [];
		let restoredReferences: unknown;
		let inputEnabled = true;
		let focusRestored = false;
		const inputTransitions: { enabled: boolean; preserveFocus: boolean }[] = [];
		let draftModelState: object | undefined;
		const requests: { query: string; attachments: string[]; background: boolean }[] = [];
		const attemptIds: (string | undefined)[] = [];
		let storageWrites = 0;
		const storageService = options.storageService ?? store.add(new InMemoryStorageService());
		const storageListener = store.add(new DisposableStore());
		storageListener.add(storageService.onDidChangeValue(StorageScope.WORKSPACE, undefined, storageListener)(() => storageWrites++));
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
		const widget: { input: object | undefined;[key: string]: unknown } = {
			getInput: () => {
				assert.ok(widget.input, 'Cannot read the disposed widget input');
				return text;
			},
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
				setInputEnabled: (enabled: boolean, preserveFocus = false) => { inputEnabled = enabled; inputTransitions.push({ enabled, preserveFocus }); },
				hasFocus: () => options.focused ?? false,
				focus: () => { focusRestored = true; },
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
			_confirmingSend: observableValue('confirmingSend', false),
			_userInteractionSource: store.add(new MutableDisposable()),
			_canSendRequest: constObservable(options.canSendRequest ?? true),
			_modelRef: { value: { object: { inputModel: { setState: (state: object) => { draftModelState = state; } } } } },
			options: {
				session: constObservable(undefined),
				confirmSend: options.confirmSend && (() => options.confirmSend!.p),
				preserveInputFocusOnSend: options.preserveInputFocusOnSend,
				inputSnapshot: options.inputSnapshot,
				sendRequest: async (request: INewChatInputSendRequest) => {
					attemptIds.push(request.attemptId);
					options.onSendRequest?.();
					requests.push({ query: request.query, attachments: request.attachments?.map(entry => entry.range ? `${entry.id}@${entry.range.start}-${entry.range.endExclusive}` : entry.id) ?? [], background: !!request.background });
					options.onSend?.();
					if (options.disposeDuringSend) {
						// Leaving the composer disposes its chat widget, whose input part is then gone.
						widget.input = undefined;
					}
					if (options.sendResult instanceof Error) {
						throw options.sendResult;
					}
					return options.sendResult ?? true;
				},
			},
			storageService,
			logService: new NullLogService(),
			chatSlashCommandService: slashCommands,
			instantiationService: { createInstance: (ctor: unknown) => ctor === ChatRequestParser ? parser : { cancel: () => { }, disposeSource: () => { } } },
		});
		return { composer, widget, inputTransitions, attemptIds, storageWrites: () => storageWrites, state: () => ({ requests, commands, restoredReferences, input: { text, attachments: attachments.map(entry => entry.id), enabled: inputEnabled }, draftModelState, focusRestored }) };
	}

	for (const preserveInputFocusOnSend of [false, true]) {
		test(`retains editor focus during confirmation and sending only when opted in (${preserveInputFocusOnSend})`, async () => {
			const confirmation = new DeferredPromise<boolean>();
			const { composer, inputTransitions } = createComposer({ confirmSend: confirmation, focused: true, preserveInputFocusOnSend });
			const sending = composer.submit(true);
			await timeout(0);
			confirmation.complete(true);
			await sending;
			assert.deepStrictEqual(inputTransitions, [
				{ enabled: false, preserveFocus: preserveInputFocusOnSend },
				{ enabled: true, preserveFocus: false },
				{ enabled: false, preserveFocus: preserveInputFocusOnSend },
				{ enabled: true, preserveFocus: false },
			]);
		});
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

	for (const sendResult of [true, false, new Error('send failed')]) {
		for (const nextInput of ['Next request', '']) {
			test(`a composer handoff preserves the next saved draft (${sendResult === true ? 'sent' : sendResult instanceof Error ? 'error' : 'declined'}, ${nextInput ? 'nonempty' : 'empty'})`, async () => {
				const storageService = store.add(new InMemoryStorageService());
				let restored: ReturnType<SharedChatInputComposer['getDraft']> | undefined;
				const { composer, state } = createComposer({
					storageService,
					sendResult,
					onSend: () => {
						const next = createComposer({ storageService, text: '', attachments: [] }).composer;
						Reflect.get(SharedChatInputComposer.prototype, '_restoreDraftState').call(next);
						restored = next.getDraft();
						next.setInputValue(nextInput);
						next.saveState();
					},
				});
				composer.saveState();

				const sent = await composer.submit(true);

				const nextDraft = readNewChatDraftState(storageService);
				assert.deepStrictEqual({ sent, restored, nextInput: nextDraft?.inputText, input: state().input }, {
					sent: sendResult === true,
					restored: { inputText: '', attachments: [] },
					nextInput,
					input: { text: sent ? '' : 'Build it', attachments: sent ? [] : ['context'], enabled: true },
				});
			});
		}
	}

	for (const background of [false, true]) {
		for (const sendResult of [false, new Error('send failed')]) {
			test(`restores the prompt when the host does not send (${background ? 'background' : 'foreground'}, ${sendResult instanceof Error ? 'error' : 'declined'})`, async () => {
				const storageService = store.add(new InMemoryStorageService());
				const { composer, state } = createComposer({ sendResult, storageService });
				composer.saveState();
				const sent = await composer.submit(background);
				const draft = readNewChatDraftState(storageService);
				const savedDraft = { inputText: draft?.inputText, attachments: draft?.attachments.map(entry => entry.id) };
				assert.deepStrictEqual({ sent, input: state().input, savedDraft }, {
					sent: false,
					input: { text: 'Build it', attachments: ['context'], enabled: true },
					savedDraft: { inputText: 'Build it', attachments: ['context'] },
				});
			});
		}
	}

	for (const background of [false, true]) {
		for (const sendResult of [true, false, new Error('send failed')]) {
			test(`a composer left while sending finishes the send without touching the gone input (${background ? 'background' : 'foreground'}, ${sendResult === true ? 'sent' : sendResult instanceof Error ? 'error' : 'declined'})`, async () => {
				const { composer, state } = createComposer({ sendResult, disposeDuringSend: true });
				const sent = await composer.submit(background);
				assert.deepStrictEqual({ sent, requests: state().requests.length, sending: Reflect.get(composer, '_sending').get() }, { sent: sendResult === true, requests: 1, sending: false });
			});
		}
	}

	for (const confirmed of [true, false]) {
		test(`keeps the input read-only while the host confirms a send, whose edits would be lost (${confirmed ? 'confirmed' : 'refused'})`, async () => {
			const confirmation = new DeferredPromise<boolean>();
			const { composer, state } = createComposer({ confirmSend: confirmation, focused: true });
			const sending = composer.submit(false);
			await timeout(0);
			const whileConfirming = state().input.enabled;
			confirmation.complete(confirmed);
			const sent = await sending;
			const { requests, input, focusRestored } = state();

			assert.deepStrictEqual({ whileConfirming, sent, requests: requests.length, input, focusRestored }, {
				whileConfirming: false,
				sent: confirmed,
				requests: confirmed ? 1 : 0,
				input: confirmed ? { text: '', attachments: [], enabled: true } : { text: 'Build it', attachments: ['context'], enabled: true },
				// A refused send leaves the user in the input to change the request.
				focusRestored: !confirmed,
			});
		});
	}

	test('focused as it opens, such as by New Session in a chat window, its input is the chat widget that has focus last, so Enter sends it, not the chat focused before', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IEditorGroupsService, {});
		instantiationService.stub(IViewsService, {});
		instantiationService.stub(IQuickChatService, {});
		instantiationService.stub(ILayoutService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IChatService, {});
		instantiationService.stub(ILogService, new NullLogService());
		const widgets = store.add(instantiationService.createInstance(ChatWidgetService));
		// As a chat widget does: focusing its input counts as its focus.
		const createWidget = () => {
			const onDidFocus = store.add(new Emitter<void>());
			const widget = upcastPartial<IChatWidget>({ onDidFocus: onDidFocus.event, onDidShow: Event.None, onDidHide: Event.None, onDidChangeViewModel: Event.None, focusInput: () => onDidFocus.fire() });
			store.add(widgets.register(widget));
			return widget;
		};
		const previous = createWidget();
		previous.focusInput();
		const widget = createWidget();
		const composer = Object.assign(Object.create(SharedChatInputComposer.prototype), { _widget: widget }) as SharedChatInputComposer;
		const before = widgets.lastFocusedWidget === previous;

		composer.focus();

		assert.deepStrictEqual({ before, after: widgets.lastFocusedWidget === widget }, { before: true, after: true });
	});

	suite('with an input snapshot of its host', () => {

		for (const sendResult of [true, false, new Error('send failed')]) {
			test(`brackets a send with an attempt holding the input before it was cleared, and ends it (${sendResult === true ? 'sent' : sendResult instanceof Error ? 'error' : 'declined'})`, async () => {
				const snapshot = new ComposerInputSnapshot();
				let attemptWhenSent: IComposerSendAttempt | undefined;
				const { composer, attemptIds, state, storageWrites } = createComposer({ sendResult, inputSnapshot: snapshot, onSendRequest: () => attemptWhenSent = snapshot.get().attempt });
				const sent = await composer.submit(false);
				composer.saveState();

				assert.deepStrictEqual({
					sent,
					attemptWhenSent: attemptWhenSent?.input,
					attemptIdSent: attemptIds.length === 1 && !!attemptWhenSent && attemptIds[0] === attemptWhenSent.id,
					attemptAfter: snapshot.get().attempt,
					input: state().input.text,
					storageWrites: storageWrites(),
				}, {
					sent: sendResult === true,
					attemptWhenSent: { inputText: 'Build it', attachments: [context], references: undefined },
					attemptIdSent: true,
					attemptAfter: undefined,
					input: sendResult === true ? '' : 'Build it',
					storageWrites: 0,
				});
			});
		}

		test('restores the input of a send that has not ended, else its input, and writes only while its widget is the bound one', () => {
			const withAttempt = new ComposerInputSnapshot({ input: { inputText: 'typed after', attachments: [] }, attempt: { id: 'a', input: { inputText: 'sent', attachments: [] } } });
			const restoredWithAttempt = createComposer({ text: '', attachments: [], inputSnapshot: withAttempt });
			Reflect.get(SharedChatInputComposer.prototype, '_restoreDraftState').call(restoredWithAttempt.composer);
			const withoutAttempt = new ComposerInputSnapshot({ input: { inputText: 'typed', attachments: [context] } });
			const restored = createComposer({ text: '', attachments: [], inputSnapshot: withoutAttempt });
			Reflect.get(SharedChatInputComposer.prototype, '_restoreDraftState').call(restored.composer);

			const writing = new ComposerInputSnapshot();
			const { composer, widget } = createComposer({ text: 'live', attachments: [], inputSnapshot: writing });
			const write = Reflect.get(SharedChatInputComposer.prototype, '_writeInputSnapshot') as (this: SharedChatInputComposer, widget: object) => void;
			write.call(composer, widget);
			const written = writing.get().input.inputText;
			// Another widget is bound now, such as after the input was rendered again: the earlier one no longer writes.
			Reflect.set(composer, '_widget', { getInput: () => 'other', attachmentModel: { attachments: [] }, input: {} });
			write.call(composer, widget);

			assert.deepStrictEqual({
				withAttempt: restoredWithAttempt.state().input,
				withoutAttempt: restored.state().input,
				written,
				afterGoneWidget: writing.get().input.inputText,
			}, {
				withAttempt: { text: 'sent', attachments: [], enabled: true },
				withoutAttempt: { text: 'typed', attachments: ['context'], enabled: true },
				written: 'live',
				afterGoneWidget: 'live',
			});
		});
	});

	suite('with an input snapshot of its host, as its input changes', () => {

		/** A chat widget whose input, attachments, inline references and pills change and say so, as the real one's do. */
		function createEventfulWidget(text: string, attachments: IChatRequestVariableEntry[], references: IDynamicVariable[]) {
			const content = store.add(new Emitter<void>());
			const attachmentsChanged = store.add(new Emitter<void>());
			const referencesChanged = store.add(new Emitter<void>());
			const pillsChanged = store.add(new Emitter<void>());
			const state = { text, attachments, references };
			const widget = {
				getInput: () => state.text,
				setInput: (value: string) => { state.text = value; content.fire(); },
				inputEditor: { onDidChangeModelContent: content.event, getModel: () => undefined },
				viewModel: { sessionResource: URI.parse('draft:/chat') },
				supportsFileReferences: true,
				attachmentModel: {
					get attachments() { return state.attachments; },
					onDidChange: attachmentsChanged.event,
					addContext: (...entries: IChatRequestVariableEntry[]) => { state.attachments = [...state.attachments, ...entries]; attachmentsChanged.fire(); },
					clearAndSetContext: (...entries: IChatRequestVariableEntry[]) => { state.attachments = entries; attachmentsChanged.fire(); },
				},
				getContrib: () => ({
					get variables() { return state.references; },
					onDidChangeReferences: referencesChanged.event,
					setInputState: (inputState: Record<string, unknown>) => { state.references = inputState[ChatDynamicVariableModel.ID] as IDynamicVariable[]; referencesChanged.fire(); },
				}),
				input: {
					get attachmentModel() { return widget.attachmentModel; },
					inlineAttachments: { isEnabled: true, onDidChange: pillsChanged.event, project: (projected: readonly IDynamicVariable[]) => ({ references: projected }) },
				},
			};
			return { widget, state, referencesChanged, pillsChanged, attachmentsChanged };
		}

		function createSnapshotComposer(widget: object, snapshot: IComposerInputSnapshot, pendingAttachments: IChatRequestVariableEntry[] = []): SharedChatInputComposer {
			const disposables = store.add(new DisposableStore());
			return Object.assign(Object.create(SharedChatInputComposer.prototype), {
				_widget: widget,
				_pendingAttachments: pendingAttachments,
				_register: <T extends IDisposable>(value: T) => disposables.add(value),
				options: { session: constObservable(undefined), inputSnapshot: snapshot },
				logService: new NullLogService(),
			});
		}

		const reference = (id: string): IDynamicVariable => ({ id, range: new Range(1, 1, 1, 2), data: URI.file(`/${id}`) });
		const ids = (input: { readonly references?: readonly IDynamicVariable[] }) => input.references?.map(entry => entry.id);

		test('writes the snapshot when only its inline references or pills change, without an edit, and stops when its tracking ends', () => {
			const snapshot = new ComposerInputSnapshot();
			const { widget, state, referencesChanged, pillsChanged } = createEventfulWidget('typed', [context], [reference('a')]);
			const composer = createSnapshotComposer(widget, snapshot);
			const tracking = Reflect.get(SharedChatInputComposer.prototype, '_trackInputSnapshot').call(composer, widget) as IDisposable;
			const initially = ids(snapshot.get().input);
			state.references = [reference('a'), reference('b')];
			referencesChanged.fire();
			const afterReferences = ids(snapshot.get().input);
			state.references = [reference('b')];
			pillsChanged.fire();
			const afterPills = ids(snapshot.get().input);
			tracking.dispose();
			state.references = [];
			referencesChanged.fire();

			assert.deepStrictEqual({ initially, afterReferences, afterPills, afterTracking: ids(snapshot.get().input), text: snapshot.get().input.inputText }, {
				initially: ['a'], afterReferences: ['a', 'b'], afterPills: ['b'], afterTracking: ['b'], text: 'typed',
			});
		});

		test('shows an input its host gives back, with its attachments and references, while it tracks the snapshot and does not send, and says whether it took it', () => {
			const snapshot = new ComposerInputSnapshot();
			const { widget, state } = createEventfulWidget('', [], []);
			const sending = observableValue('sending', false);
			const composer = Object.assign(createSnapshotComposer(widget, snapshot), { _sending: sending });
			const tracking = Reflect.get(SharedChatInputComposer.prototype, '_trackInputSnapshot').call(composer, widget) as IDisposable;
			const tookIt = snapshot.restore({ inputText: 'given back', attachments: [context], references: [reference('a')] });
			const shown = { tookIt, text: state.text, attachments: state.attachments.map(entry => entry.id), references: state.references.map(entry => entry.id) };
			sending.set(true, undefined);
			const whileSending = { tookIt: snapshot.restore({ inputText: 'while sending', attachments: [], references: [] }), text: state.text, snapshot: snapshot.get().input.inputText };
			sending.set(false, undefined);
			tracking.dispose();
			const afterTracking = { tookIt: snapshot.restore({ inputText: 'after tracking', attachments: [], references: [] }), text: state.text, snapshot: snapshot.get().input.inputText };

			assert.deepStrictEqual({ shown, whileSending, afterTracking }, {
				shown: { tookIt: true, text: 'given back', attachments: ['context'], references: ['a'] },
				// It does not take what it cannot show, so its host can offer it otherwise.
				whileSending: { tookIt: false, text: 'given back', snapshot: 'given back' },
				// Without an input that shows it, it is not taken either.
				afterTracking: { tookIt: false, text: 'given back', snapshot: 'given back' },
			});
		});

		test('restores the host\'s input together with context queued before rendering, without overwriting it first', () => {
			const snapshot = new ComposerInputSnapshot({ input: { inputText: 'keep me', attachments: [], references: [reference('a')] } });
			const { widget, state } = createEventfulWidget('', [], []);
			const composer = createSnapshotComposer(widget, snapshot, [context]);
			Reflect.get(SharedChatInputComposer.prototype, '_restoreInput').call(composer, widget);

			assert.deepStrictEqual({
				input: { text: state.text, attachments: state.attachments.map(entry => entry.id), references: state.references.map(entry => entry.id) },
				snapshot: { text: snapshot.get().input.inputText, attachments: snapshot.get().input.attachments.map(entry => entry.id), references: ids(snapshot.get().input) },
			}, {
				input: { text: 'keep me', attachments: ['context'], references: ['a'] },
				snapshot: { text: 'keep me', attachments: ['context'], references: ['a'] },
			});
		});

		test('an older send that does not go out after its view is gone neither gives its input back nor ends the newer send\'s attempt', async () => {
			const snapshot = new ComposerInputSnapshot();
			let newer: string | undefined;
			const { composer } = createComposer({ sendResult: false, disposeDuringSend: true, inputSnapshot: snapshot, onSendRequest: () => { newer = snapshot.beginSendAttempt({ inputText: 'newer', attachments: [] }); } });
			await composer.submit(false);

			assert.deepStrictEqual(snapshot.get(), { input: { inputText: '', attachments: [] }, attempt: { id: newer, input: { inputText: 'newer', attachments: [] } } });
		});

		for (const sendResult of [false, new Error('send failed')]) {
			for (const nextViewTyped of [false, true]) {
				test(`a send that does not go out after its view is gone gives its input back to the snapshot${nextViewTyped ? ', unless the next view has input of its own' : ''} (${sendResult instanceof Error ? 'error' : 'declined'})`, async () => {
					const snapshot = new ComposerInputSnapshot();
					const { composer } = createComposer({ sendResult, disposeDuringSend: true, inputSnapshot: snapshot, onSendRequest: () => { snapshot.set({ inputText: nextViewTyped ? 'typed in the next view' : '', attachments: [] }); } });
					await composer.submit(false);

					assert.deepStrictEqual(snapshot.get(), { input: nextViewTyped ? { inputText: 'typed in the next view', attachments: [] } : { inputText: 'Build it', attachments: [context], references: undefined } });
				});
			}
		}
	});

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

	test('binds the host\'s chat when it has one, otherwise the session\'s main chat', () => {
		const mainChat = upcastPartial<IChat>({ resource: URI.parse('chat:/main') });
		// The active chat of a session fake is not the chat of a composer that is given none.
		const activeChat = upcastPartial<IChat>({ resource: URI.parse('chat:/active') });
		const session = constObservable(upcastPartial<ITestSessionWithChat>({ mainChat: constObservable(mainChat), activeChat: constObservable(activeChat) }));
		const bindings = (options: Pick<INewChatComposerInputOptions, 'session' | 'chat'>, update?: () => void) => {
			const bound: (string | undefined)[] = [];
			const composer = Object.assign(Object.create(SharedChatInputComposer.prototype), {
				_store: store.add(new DisposableStore()),
				options,
				_bindModel: async (resource: URI | undefined) => { bound.push(resource?.toString()); },
			});
			Reflect.get(SharedChatInputComposer.prototype, '_bindChatModel').call(composer);
			update?.();
			return bound;
		};
		const hostChat = observableValue<IChat | undefined>('chat', undefined);

		assert.deepStrictEqual({
			draft: bindings({ session }),
			hostChat: bindings({ session, chat: hostChat }, () => hostChat.set(upcastPartial<IChat>({ resource: URI.parse('chat:/composer') }), undefined)),
		}, {
			draft: ['chat:/main'],
			hostChat: [undefined, 'chat:/composer'],
		});
	});

	test('keeps the input\'s inline references when another draft is bound', async () => {
		const reference: IDynamicVariable = { id: 'file', range: new Range(1, 5, 1, 17), data: 'foo.ts' };
		let input = 'Fix #file:foo.ts';
		const dynamicVariables = {
			variables: [reference],
			setInputState: (state: Readonly<Record<string, unknown>>) => { dynamicVariables.variables = state[ChatDynamicVariableModel.ID] as IDynamicVariable[]; },
		};
		const attachmentModel = { attachments: [], clearAndSetContext: () => { } };
		const composer: { _bindModel(resource: URI): Promise<void> } = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: store.add(new DisposableStore()),
			_modelRef: store.add(new MutableDisposable()),
			_modelBinding: 0,
			_widget: {
				viewModel: {},
				supportsFileReferences: true,
				input: { attachmentModel },
				inputEditor: { getValue: () => input },
				attachmentModel,
				getContrib: () => dynamicVariables,
				getInput: () => input,
				// Binding a model adopts its input state, which has none of the composer's text or references.
				setModel: () => {
					input = '';
					dynamicVariables.variables = [];
				},
			},
			setInputValue: (value: string) => { input = value; },
			chatService: { acquireOrLoadSession: async () => ({ object: {}, dispose: () => { } }) },
			logService: new NullLogService(),
		});

		await composer._bindModel(URI.parse('draft:/replacement'));

		assert.deepStrictEqual({ input, references: dynamicVariables.variables }, { input: 'Fix #file:foo.ts', references: [reference] });
	});

	test('binds the latest draft and releases an earlier draft that finishes loading later', async () => {
		const loads = new Map<string, { result: DeferredPromise<{ object: { id: string }; dispose(): void }>; token: CancellationToken }>();
		const released: string[] = [];
		const bound: string[] = [];
		const modelRef = store.add(new MutableDisposable());
		const composer: { _bindModel(resource: URI): Promise<void> } = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: store.add(new DisposableStore()),
			_modelRef: modelRef,
			_modelBinding: 0,
			_widget: {
				input: {},
				inputEditor: { getValue: () => '' },
				getInput: () => '',
				getContrib: () => undefined,
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

		// The superseded load is shared with the session, so it is released rather than cancelled.
		assert.deepStrictEqual({ bound, released, firstLoadCancelled: loads.get('/first')!.token.isCancellationRequested }, {
			bound: ['/second'],
			released: ['/first'],
			firstLoadCancelled: false,
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
			_confirmingSend: constObservable(false),
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

	test('shows no progress while the host confirms a send', () => runWithFakedTimers({}, async () => {
		const busyStore = new DisposableStore();
		const sending = observableValue('sending', false);
		const confirmingSend = observableValue('confirmingSend', false);
		const busy: string[] = [];
		const composer: { _renderBusyState(key: { set(value: string): void }): void } = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: busyStore,
			_sending: sending,
			_confirmingSend: confirmingSend,
			options: { loading: constObservable(false) },
		});
		composer._renderBusyState({ set: value => busy.push(value) });
		transaction(tx => {
			sending.set(true, tx);
			confirmingSend.set(true, tx);
		});
		await timeout(1000);
		const whileConfirming = busy.filter(value => value !== '');
		confirmingSend.set(false, undefined);
		await timeout(1000);
		sending.set(false, undefined);
		busyStore.dispose();

		assert.deepStrictEqual({ whileConfirming, busy: busy.filter(value => value !== '') }, { whileConfirming: [], busy: ['sending'] });
	}));

	test('uses the model picker progress instead of a separate busy action for comparison sends', () => runWithFakedTimers({}, async () => {
		const busyStore = new DisposableStore();
		const sending = observableValue('sending', false);
		const summary = observableValue<string | undefined>('summary', '3 Attempts');
		const busy: string[] = [];
		const composer: { _renderBusyState(key: { set(value: string): void }): void } = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: busyStore,
			_sending: sending,
			_confirmingSend: constObservable(false),
			options: {
				loading: constObservable(false),
				modelPickerComparison: upcastPartial<IModelPickerComparison>({ summary }),
			},
		});
		composer._renderBusyState({ set: value => busy.push(value) });
		sending.set(true, undefined);
		await timeout(1000);
		sending.set(false, undefined);
		busyStore.dispose();

		assert.deepStrictEqual(busy.filter(value => value !== ''), []);
	}));
});
