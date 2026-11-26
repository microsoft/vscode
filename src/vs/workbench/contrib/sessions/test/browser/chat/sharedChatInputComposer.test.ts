/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { ChatDynamicVariableModel } from '../../../../chat/browser/attachments/chatDynamicVariables.js';
import { IChatAgentService } from '../../../../chat/common/participants/chatAgents.js';
import { IChatVariablesService, IDynamicVariable } from '../../../../chat/common/attachments/chatVariables.js';
import { IChatRequestVariableEntry, toFileVariableEntry, toPasteVariableEntry } from '../../../../chat/common/attachments/chatVariableEntries.js';
import { IChatDraft } from '../../../../chat/common/attachments/chatDraft.js';
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
import { IChatWidget, IChatWidgetViewOptions, IQuickChatService } from '../../../../chat/browser/chat.js';
import { IChatViewHostService } from '../../../../chat/browser/chatViewHost.js';
import { ChatWidgetService } from '../../../../chat/browser/widget/chatWidgetService.js';
import { ChatInputPart } from '../../../../chat/browser/widget/input/chatInputPart.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { ComposerInputSnapshot, IComposerInputSnapshot, IComposerSendAttempt, readNewChatDraftState } from '../../../common/newChatDraftState.js';
import { IChat } from '../../../../../services/sessions/common/session.js';
import { ITestSessionWithChat } from '../sessionHostTestUtils.js';
import { ChatSubmitRequestOutcome, IChatSubmitRequestResult } from '../../../../chat/browser/chatSubmitRequestHandlerService.js';

suite('SharedChatInputComposer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const context = toPasteVariableEntry('Context', 'Pasted context', { id: 'context' });

	/** A composer over a fake chat widget, recording what the host is asked to send and the commands it runs. */
	function createComposer(options: { submitOverride?: INewChatComposerInputOptions['submitOverride']; shouldPersistInput?: () => boolean; sendResult?: boolean | Error; disposeDuringSend?: boolean; canSendRequest?: boolean | IObservable<boolean>; text?: string; attachments?: IChatRequestVariableEntry[]; references?: IDynamicVariable[]; confirmSend?: DeferredPromise<boolean>; focused?: boolean; preserveInputFocusOnSend?: boolean; storageService?: IStorageService; onSend?: () => void; inputSnapshot?: IComposerInputSnapshot; getSavedDraftId?: () => string | undefined; onSendRequest?: () => void; scheduleRequest?: INewChatComposerInputOptions['scheduleRequest']; tryHandle?: (input: string) => Promise<boolean | IChatSubmitRequestResult>; session?: IObservable<{ resource: URI; providerId: string; sessionId: string } | undefined> } = {}) {
		let text = options.text ?? 'Build it';
		let attachments: IChatRequestVariableEntry[] = options.attachments ?? [context];
		let references = options.references ?? [];
		let restoredReferences: unknown;
		let inputEnabled = true;
		const executeToolbarElement = dom.$('div');
		let focusRestored = false;
		const inputTransitions: { enabled: boolean; preserveFocus: boolean }[] = [];
		let draftModelState: object | undefined;
		const requests: { query: string; attachments: string[]; background: boolean }[] = [];
		const errors: string[] = [];
		const warnings: string[] = [];
		const readinessWait = store.add(new MutableDisposable<DisposableStore>());
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
			clearAndSetContext: (...entries: IChatRequestVariableEntry[]) => { attachments = entries; },
		};
		const widget: { input: object | undefined;[key: string]: unknown } = {
			domNode: dom.$('div'),
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
				executeToolbarElement,
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
			_store: store.add(new DisposableStore()),
			_widget: widget,
			_sending: observableValue('sending', false),
			_suppressSendProgress: observableValue('suppressSendProgress', false),
			_userInteractionSource: store.add(new MutableDisposable()),
			_readinessWait: readinessWait,
			_canSendRequest: typeof options.canSendRequest === 'object' ? options.canSendRequest : constObservable(options.canSendRequest ?? true),
			_modelRef: { value: { object: { inputModel: { setState: (state: object) => { draftModelState = state; } } } } },
			options: {
				submitOverride: options.submitOverride,
				shouldPersistInput: options.shouldPersistInput,
				session: options.session ?? constObservable(options.tryHandle ? { resource: URI.parse('session:/1'), providerId: 'provider', sessionId: '1' } : undefined),
				canSchedule: constObservable(!!options.scheduleRequest),
				scheduleRequest: options.scheduleRequest,
				confirmSend: options.confirmSend && (() => options.confirmSend!.p),
				preserveInputFocusOnSend: options.preserveInputFocusOnSend,
				inputSnapshot: options.inputSnapshot,
				getSavedDraftId: options.getSavedDraftId,
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
			notificationService: { error: (message: string | Error) => { errors.push(String(message)); }, warn: (message: string) => { warnings.push(message); } },
			chatSlashCommandService: slashCommands,
			// As the service answers for its handlers: a handler's `true` handled the request, its `false` went on
			chatSubmitRequestHandlerService: { tryHandle: async (request: { input: string }) => { const answer = await options.tryHandle?.(request.input) ?? false; return typeof answer === 'boolean' ? { outcome: answer ? ChatSubmitRequestOutcome.Handled : ChatSubmitRequestOutcome.Continue } : answer; } },
			instantiationService: { createInstance: (ctor: unknown) => ctor === ChatRequestParser ? parser : { cancel: () => { }, disposeSource: () => { } } },
		});
		return { composer, widget, executeToolbarElement, readinessWait, inputTransitions, attemptIds, storageWrites: () => storageWrites, state: () => ({ requests, errors, warnings, commands, restoredReferences, input: { text, attachments: attachments.map(entry => entry.id), enabled: inputEnabled }, draftModelState, focusRestored }) };
	}

	test('scheduled drafts remain editable and save without sending or overwriting ordinary input', async () => {
		let saves = 0;
		const { composer, state, storageWrites } = createComposer({ submitOverride: async () => { saves++; return true; }, shouldPersistInput: () => false, getSavedDraftId: () => 'saved-draft' });
		composer.setInputEnabled(true);
		composer.saveState();
		await composer.submit(true);
		assert.deepStrictEqual({
			saves,
			enabled: state().input.enabled,
			requests: state().requests,
			storageWrites: storageWrites(),
		}, { saves: 1, enabled: true, requests: [], storageWrites: 0 });
	});

	for (const cancelled of [true, false]) {
		test(`scheduled submit override failures keep input and only report non-cancellation errors, cancelled: ${cancelled}`, async () => {
			const error = cancelled ? new CancellationError() : new Error('Schedule changed');
			const { composer, state } = createComposer({ submitOverride: async () => { throw error; } });
			const sent = await composer.submit();
			assert.deepStrictEqual({ sent, errors: state().errors, requests: state().requests, input: state().input }, {
				sent: false, errors: cancelled ? [] : [String(error)], requests: [],
				input: { text: 'Build it', attachments: [context.id], enabled: true },
			});
		});
	}

	test('backs up the saved identity with input and clears it for a new composition', () => {
		const storageService = store.add(new InMemoryStorageService());
		let savedDraftId: string | undefined = 'saved-draft';
		const attachment = { kind: 'file' as const, id: 'file', name: 'file.ts', value: URI.file('/workspace/file.ts') };
		const { composer } = createComposer({ storageService, text: 'saved input', attachments: [attachment], getSavedDraftId: () => savedDraftId });
		composer.saveState();
		const saved = readNewChatDraftState(storageService);
		savedDraftId = undefined;
		composer.setDraft({ inputText: 'new input', attachments: [] });
		composer.saveState();
		assert.deepStrictEqual({ saved, next: readNewChatDraftState(storageService) }, {
			saved: { inputText: 'saved input', attachments: [attachment], references: undefined, savedDraftId: 'saved-draft' },
			next: { inputText: 'new input', attachments: [], references: undefined },
		});
	});

	test('scheduling supplies the send controls as the picker anchor and keeps input on cancel', async () => {
		let anchor: HTMLElement | undefined;
		const { composer, executeToolbarElement, state } = createComposer({
			scheduleRequest: async element => { anchor = element; return undefined; },
		});
		await composer.schedule();
		assert.deepStrictEqual({ anchor, input: state().input }, {
			anchor: executeToolbarElement, input: { text: 'Build it', attachments: [context.id], enabled: true },
		});
	});

	test('scheduling releases the captured source only after clearing its input', async () => {
		const released: string[] = [];
		const { composer, state } = createComposer({
			scheduleRequest: async () => () => { released.push(state().input.text); },
		});
		await composer.schedule();
		assert.deepStrictEqual({ released, input: state().input }, {
			released: [''], input: { text: '', attachments: [], enabled: true },
		});
	});

	test('late scheduling acceptance does not clear a replacement composition', async () => {
		const accepted = new DeferredPromise<(() => void) | undefined>();
		let released = false;
		const { composer, state } = createComposer({ scheduleRequest: () => accepted.p });
		const scheduling = composer.schedule();
		composer.setDraft({ inputText: 'replacement', attachments: [] });
		accepted.complete(() => { released = true; });
		await scheduling;
		assert.deepStrictEqual({ released, input: state().input }, {
			released: false, input: { text: 'replacement', attachments: [], enabled: true },
		});
	});

	test('scheduling can finish after the source composer is disposed', async () => {
		const accepted = new DeferredPromise<(() => void) | undefined>();
		let released = false;
		const { composer, widget, inputTransitions } = createComposer({ scheduleRequest: () => accepted.p });
		const scheduling = composer.schedule();
		composer.dispose();
		widget.input = undefined;
		accepted.complete(() => { released = true; });
		await scheduling;
		assert.deepStrictEqual({ released, inputTransitions }, {
			released: false, inputTransitions: [{ enabled: false, preserveFocus: false }],
		});
	});

	test('drafts retain ordinary inline references without attachment pills', () => {
		const references: IDynamicVariable[] = [{ id: 'file', range: new Range(1, 1, 1, 8), data: URI.file('/workspace/file.ts') }];
		const { composer, state } = createComposer({ text: '#file.ts', references });
		const draft = composer.getDraft();
		composer.setDraft(draft);
		assert.deepStrictEqual({ references: draft.references, restored: state().restoredReferences }, { references, restored: references });
	});

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

	for (const [moveFocus, disableMovesFocus] of [[false, false], [true, false], [false, true], [true, true]]) {
		test(`restores actual editor focus after rejection without stealing it from another control (moved: ${moveFocus}, toolbar: ${disableMovesFocus})`, async () => {
			const root = dom.append(dom.getActiveWindow().document.body, dom.$('div'));
			store.add(toDisposable(() => root.remove()));
			const editor = dom.append(root, dom.$<HTMLTextAreaElement>('textarea'));
			const sendControl = dom.append(root, dom.$('button'));
			const otherControl = dom.append(root, dom.$('button'));
			const { composer, widget, state } = createComposer({
				sendResult: false,
				onSend: () => {
					if (moveFocus) {
						otherControl.focus();
					}
				},
			});
			widget.domNode = root;
			Object.assign(widget.input!, {
				hasFocus: () => dom.getWindow(editor).document.activeElement === editor,
				setInputEnabled: (enabled: boolean) => {
					editor.disabled = !enabled;
					if (!enabled && disableMovesFocus) {
						sendControl.focus();
					}
				},
				focus: () => editor.focus(),
			});
			editor.focus();

			const sent = await composer.submit(true);

			assert.deepStrictEqual({ sent, input: state().input.text, focused: dom.getWindow(root).document.activeElement === (moveFocus ? otherControl : editor) }, {
				sent: false, input: 'Build it', focused: true,
			});
		});
	}

	for (const moveFocus of ['none', 'confirmation', 'send']) {
		test(`restores foreground editor focus after confirmation and rejection unless focus moved during ${moveFocus}`, async () => {
			const root = dom.append(dom.getActiveWindow().document.body, dom.$('div'));
			store.add(toDisposable(() => root.remove()));
			const editorHost = dom.append(root, dom.$('div'));
			const editor = dom.append(editorHost, dom.$<HTMLTextAreaElement>('textarea'));
			const inputActions = dom.append(root, dom.$('div'));
			const sendControl = dom.append(root, dom.$('button'));
			const otherControl = dom.append(root, dom.$('button'));
			const confirmation = new DeferredPromise<boolean>();
			const { composer, widget, state } = createComposer({
				sendResult: false,
				confirmSend: confirmation,
				onSend: () => {
					if (moveFocus === 'send') {
						otherControl.focus();
					}
				},
			});
			const input: ChatInputPart = Object.assign(Object.create(widget.input!), {
				inputEnabled: true,
				_inputEditor: {
					hasWidgetFocus: () => dom.getWindow(editor).document.activeElement === editor,
					updateOptions: ({ readOnly }: { readOnly: boolean }) => { editor.readOnly = readOnly; },
					focus: () => editor.focus(),
				},
				_inputEditorElement: editorHost,
				attachmentsContainer: dom.append(root, dom.$('div')),
				inputActionsToolbar: { getElement: () => inputActions },
				secondaryToolbarContainer: dom.append(root, dom.$('div')),
				dnd: { setDisabledOverlay: () => { } },
				executeToolbar: { focus: () => sendControl.focus() },
				setInputEnabled: ChatInputPart.prototype.setInputEnabled,
				hasFocus: ChatInputPart.prototype.hasFocus,
				focus: ChatInputPart.prototype.focus,
			});
			widget.domNode = root;
			widget.input = input;
			editor.focus();

			const sending = composer.submit(false);
			await timeout(0);
			const toolbarFocusedDuringConfirmation = dom.getWindow(root).document.activeElement === sendControl;
			if (moveFocus === 'confirmation') {
				otherControl.focus();
			}
			confirmation.complete(true);
			const sent = await sending;

			assert.deepStrictEqual({
				sent,
				toolbarFocusedDuringConfirmation,
				input: state().input.text,
				attachments: state().input.attachments,
				readOnly: editor.readOnly,
				focused: dom.getWindow(root).document.activeElement === (moveFocus === 'none' ? editor : otherControl),
			}, {
				sent: false,
				toolbarFocusedDuringConfirmation: true,
				input: 'Build it',
				attachments: ['context'],
				readOnly: false,
				focused: true,
			});
		});
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

	for (const confirmed of [true, false]) {
		test(`a submit is submitting from before the host confirms it until it is ${confirmed ? 'sent' : 'refused'}, so its host doesn't retarget it meanwhile`, async () => {
			const confirmation = new DeferredPromise<boolean>();
			const snapshot = new ComposerInputSnapshot();
			const { composer } = createComposer({ confirmSend: confirmation, focused: true, inputSnapshot: snapshot });
			const sending = composer.submit(false);
			const whileConfirming = { submitting: snapshot.isSubmitting, attempt: !!snapshot.get().attempt };
			confirmation.complete(confirmed);
			await sending;

			assert.deepStrictEqual({ whileConfirming, after: snapshot.isSubmitting }, { whileConfirming: { submitting: true, attempt: false }, after: false });
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
		instantiationService.stub(IChatViewHostService, {});
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
				inputEditor: { onDidChangeModelContent: content.event, getModel: () => undefined, getValue: () => state.text },
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

		test('remaps the resources of its attachments and inline references, and of context queued before rendering, keeping its prompt and the snapshot in step', () => {
			const wsl = (path: string) => URI.from({ scheme: 'vscode-agent-host', authority: 'wsl', path: `/file/-/project${path}` });
			const mapResource = (resource: URI) => resource.authority === 'wsl' ? resource.with({ authority: 'env' }) : undefined;
			const file = toFileVariableEntry(wsl('/a.ts'));
			const snapshot = new ComposerInputSnapshot();
			const { widget, state } = createEventfulWidget('Fix #a.ts', [file, context], [{ id: file.id, range: new Range(1, 5, 1, 10), isAttachmentReference: true, data: undefined }, reference('c')]);
			const composer = createSnapshotComposer(widget, snapshot);
			store.add(Reflect.get(SharedChatInputComposer.prototype, '_trackInputSnapshot').call(composer, widget) as IDisposable);
			composer.remapDraftResources(mapResource);
			const queued = [toFileVariableEntry(wsl('/b.ts')), context];
			const unrendered = createSnapshotComposer({}, snapshot, queued);
			Reflect.set(unrendered, '_widget', undefined);
			Reflect.set(unrendered, '_remapsBeforeRestore', []);
			unrendered.remapDraftResources(mapResource);

			assert.deepStrictEqual({
				input: { text: state.text, attachments: state.attachments.map(entry => entry.id), references: state.references.map(entry => entry.id) },
				snapshot: { text: snapshot.get().input.inputText, attachments: snapshot.get().input.attachments.map(entry => entry.id), references: ids(snapshot.get().input) },
				queued: queued.map(entry => entry.id),
			}, {
				input: { text: 'Fix #a.ts', attachments: ['vscode-agent-host://env/file/-/project/a.ts', 'context'], references: ['vscode-agent-host://env/file/-/project/a.ts', 'c'] },
				snapshot: { text: 'Fix #a.ts', attachments: ['vscode-agent-host://env/file/-/project/a.ts', 'context'], references: ['vscode-agent-host://env/file/-/project/a.ts', 'c'] },
				queued: ['vscode-agent-host://env/file/-/project/b.ts', 'context'],
			});
		});

		test('remaps the saved input it restores as it renders by a remap before rendering, and writes it to the snapshot', () => {
			const wsl = (path: string) => URI.from({ scheme: 'vscode-agent-host', authority: 'wsl', path: `/file/-/project${path}` });
			const file = toFileVariableEntry(wsl('/a.ts'));
			const snapshot = new ComposerInputSnapshot({ input: { inputText: 'Fix #a.ts', attachments: [file], references: [{ id: file.id, range: new Range(1, 5, 1, 10), isAttachmentReference: true, data: undefined }] } });
			const { widget, state } = createEventfulWidget('', [], []);
			const composer = createSnapshotComposer({}, snapshot, [toFileVariableEntry(wsl('/b.ts'))]);
			Reflect.set(composer, '_widget', undefined);
			Reflect.set(composer, '_remapsBeforeRestore', []);
			composer.remapDraftResources(resource => resource.authority === 'wsl' ? resource.with({ authority: 'env' }) : undefined);
			Reflect.set(composer, '_widget', widget);
			Reflect.get(SharedChatInputComposer.prototype, '_restoreInput').call(composer, widget);

			const env = (path: string) => `vscode-agent-host://env/file/-/project${path}`;
			assert.deepStrictEqual({
				input: { text: state.text, attachments: state.attachments.map(entry => entry.id), references: state.references.map(entry => entry.id) },
				snapshot: { text: snapshot.get().input.inputText, attachments: snapshot.get().input.attachments.map(entry => entry.id), references: ids(snapshot.get().input) },
			}, {
				input: { text: 'Fix #a.ts', attachments: [env('/b.ts'), env('/a.ts')], references: [env('/a.ts')] },
				snapshot: { text: 'Fix #a.ts', attachments: [env('/b.ts'), env('/a.ts')], references: [env('/a.ts')] },
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

	test('a send that comes before the session is ready to send, such as by Run Prompt as the composer opens, waits for it with its input read-only, and sends', () => runWithFakedTimers({}, async () => {
		const canSendRequest = observableValue('canSendRequest', false);
		const { composer, state } = createComposer({ canSendRequest });
		const sending = composer.submit(true);
		await timeout(1000);
		const whileWaiting = { requests: state().requests.length, inputEnabled: state().input.enabled, duplicate: await composer.submit(true) };
		canSendRequest.set(true, undefined);
		const sent = await sending;
		assert.deepStrictEqual({ whileWaiting, sent, requests: state().requests.map(request => request.query), errors: state().errors }, {
			whileWaiting: { requests: 0, inputEnabled: false, duplicate: false },
			sent: true,
			requests: ['Build it'],
			errors: [],
		});
	}));

	const replacements: { name: string; replace: (widget: ReturnType<typeof createComposer>['widget'], references: IDynamicVariable[]) => void; input: { text: string; attachments: string[] } }[] = [
		// Run Prompt sets the input programmatically, which a read-only input does not prevent.
		{ name: 'its text changes', replace: widget => (widget.setInput as (value: string) => void)('/review'), input: { text: '/review', attachments: ['context'] } },
		{ name: 'its attachments change', replace: widget => (widget.attachmentModel as { addContext(...entries: IChatRequestVariableEntry[]): void }).addContext({ kind: 'generic', id: 'other', name: 'other', value: 'other' }), input: { text: 'Build it', attachments: ['context', 'other'] } },
		{ name: 'its references change', replace: (_widget, references) => references.push({ id: 'file', range: new Range(1, 1, 1, 6), data: 'a.ts' }), input: { text: 'Build it', attachments: ['context'] } },
	];
	for (const replacement of replacements) {
		test(`a send waiting for its session is not sent, keeps the newer input and says so when ${replacement.name} meanwhile`, () => runWithFakedTimers({}, async () => {
			const canSendRequest = observableValue('canSendRequest', false);
			const references: IDynamicVariable[] = [];
			const { composer, widget, state } = createComposer({ canSendRequest, references });
			const sending = composer.submit();
			await timeout(1000);
			replacement.replace(widget, references);
			const duplicate = await composer.submit();
			canSendRequest.set(true, undefined);
			const sent = await sending;
			assert.deepStrictEqual({ duplicate, sent, requests: state().requests, errors: state().errors, warnings: state().warnings.length, input: state().input }, {
				duplicate: false,
				sent: false,
				requests: [],
				errors: [],
				warnings: 1,
				input: { ...replacement.input, enabled: true },
			});
		}));
	}

	test('a send waiting for the host to confirm is not sent, keeps the newer input and says so when the input is replaced meanwhile', async () => {
		const confirmation = new DeferredPromise<boolean>();
		const { composer, widget, state } = createComposer({ confirmSend: confirmation });
		const sending = composer.submit();
		await timeout(0);
		(widget.setInput as (value: string) => void)('/review');
		const duplicate = await composer.submit();
		confirmation.complete(true);
		const sent = await sending;
		assert.deepStrictEqual({ duplicate, sent, requests: state().requests, warnings: state().warnings.length, input: state().input }, {
			duplicate: false,
			sent: false,
			requests: [],
			warnings: 1,
			input: { text: '/review', attachments: ['context'], enabled: true },
		});
	});

	for (const handled of [true, false]) {
		test(`a request whose input is replaced while a submit handler runs keeps the newer input (${handled ? 'handled, which says nothing' : 'not handled, so not sent, which says so'})`, async () => {
			const handling = new DeferredPromise<boolean>();
			const handledInputs: string[] = [];
			const { composer, widget, state } = createComposer({ tryHandle: input => { handledInputs.push(input); return handling.p; } });
			const sending = composer.submit();
			await timeout(0);
			(widget.setInput as (value: string) => void)('/review');
			handling.complete(handled);
			const sent = await sending;
			assert.deepStrictEqual({ sent, handledInputs, requests: state().requests, warnings: state().warnings.length, input: state().input }, {
				sent: handled,
				handledInputs: ['Build it'],
				requests: [],
				warnings: handled ? 0 : 1,
				input: { text: '/review', attachments: ['context'], enabled: true },
			});
		});
	}

	test('a request waiting on a submit handler is sent for its own draft only: not once the composer moved to another with the same input, which keeps it and says so, nor once it was closed; also where the handler acted on it, which clears neither and says nothing, while one it acted on for its own draft clears the input as before', async () => {
		const results = [];
		for (const [change, handled] of [['switched', false], ['closed', false], ['switched', true], ['closed', true], ['unchanged', true]] as const) {
			const handling = new DeferredPromise<boolean>();
			const session = observableValue<{ resource: URI; providerId: string; sessionId: string } | undefined>('session', { resource: URI.parse('session:/1'), providerId: 'provider', sessionId: '1' });
			const { composer, widget, state } = createComposer({ tryHandle: () => handling.p, session });
			const sending = composer.submit();
			await timeout(0);
			if (change === 'switched') {
				session.set({ resource: URI.parse('session:/2'), providerId: 'provider', sessionId: '2' }, undefined);
			} else if (change === 'closed') {
				composer.dispose();
				widget.input = undefined;
			}
			handling.complete(handled);
			const sent = await sending;
			results.push({ change, handled, sent, requests: state().requests.length, warnings: state().warnings.length, input: state().input.text });
		}

		assert.deepStrictEqual(results, [
			{ change: 'switched', handled: false, sent: false, requests: 0, warnings: 1, input: 'Build it' },
			{ change: 'closed', handled: false, sent: false, requests: 0, warnings: 0, input: 'Build it' },
			{ change: 'switched', handled: true, sent: false, requests: 0, warnings: 0, input: 'Build it' },
			{ change: 'closed', handled: true, sent: false, requests: 0, warnings: 0, input: 'Build it' },
			{ change: 'unchanged', handled: true, sent: true, requests: 0, warnings: 0, input: '' },
		]);
	});

	test('a request sent again while a submit handler holds the first is ignored: the first is sent once', async () => {
		const handling = new DeferredPromise<boolean>();
		let handled = 0;
		const { composer, state } = createComposer({ tryHandle: () => { handled++; return handling.p; } });
		const first = composer.submit();
		await timeout(0);
		const again = await composer.submit();
		handling.complete(false);

		assert.deepStrictEqual({ again, first: await first, handled, requests: state().requests.map(request => request.query) }, { again: false, first: true, handled: 1, requests: ['Build it'] });
	});

	test('a request a submit handler cancels is neither sent nor cleared, and keeps its input', async () => {
		const { composer, state } = createComposer({ tryHandle: async () => ({ outcome: ChatSubmitRequestOutcome.Cancelled }) });
		const sent = await composer.submit();
		assert.deepStrictEqual({ sent, requests: state().requests, input: state().input }, {
			sent: false,
			requests: [],
			input: { text: 'Build it', attachments: ['context'], enabled: true },
		});
	});

	test('a send whose session does not get ready in time is not sent, gives its input back as it was and says so', () => runWithFakedTimers({}, async () => {
		const { composer, inputTransitions, state } = createComposer({ canSendRequest: false, focused: true });
		const sent = await composer.submit(true);
		const { requests, errors, input, focusRestored } = state();
		assert.deepStrictEqual({ sent, requests, errors: errors.length, input, inputTransitions: inputTransitions.map(transition => transition.enabled), focusRestored }, {
			sent: false,
			requests: [],
			errors: 1,
			input: { text: 'Build it', attachments: ['context'], enabled: true },
			inputTransitions: [false, true],
			focusRestored: true,
		});
	}));

	test('a send waiting for its session as the composer is disposed is neither sent nor reported, and leaves no wait behind', () => runWithFakedTimers({}, async () => {
		const { composer, readinessWait, state } = createComposer({ canSendRequest: false });
		const sending = composer.submit(true);
		await timeout(1000);
		readinessWait.dispose();
		const sent = await sending;
		await timeout(20_000);
		assert.deepStrictEqual({ sent, requests: state().requests, errors: state().errors }, { sent: false, requests: [], errors: [] });
	}));

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

	test('keeps the input, inline references, and saved snapshot when another draft is bound', async () => {
		const reference: IDynamicVariable = { id: 'file', range: new Range(1, 5, 1, 17), data: 'foo.ts' };
		const contentChanged = store.add(new Emitter<void>());
		const snapshots: IChatDraft[] = [];
		let input = 'Fix #file:foo.ts';
		const dynamicVariables = {
			variables: [reference],
			onDidChangeReferences: Event.None,
			setInputState: (state: Readonly<Record<string, unknown>>) => { dynamicVariables.variables = state[ChatDynamicVariableModel.ID] as IDynamicVariable[]; },
		};
		const attachmentModel = { attachments: [], onDidChange: Event.None, clearAndSetContext: () => { } };
		const composer: SharedChatInputComposer = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: store.add(new DisposableStore()),
			_modelRef: store.add(new MutableDisposable()),
			_modelBinding: 0,
			options: { onDidChangeDraft: (draft: IChatDraft) => snapshots.push(draft) },
			_widget: {
				viewModel: {},
				supportsFileReferences: true,
				input: { attachmentModel },
				inputEditor: { getValue: () => input, onDidChangeModelContent: contentChanged.event },
				attachmentModel,
				getContrib: () => dynamicVariables,
				getInput: () => input,
				// Binding a model adopts its input state, which has none of the composer's text or references.
				setModel: () => {
					input = '';
					dynamicVariables.variables = [];
					contentChanged.fire();
				},
			},
			setInputValue: (value: string) => { input = value; contentChanged.fire(); },
			chatService: { acquireOrLoadSession: async () => ({ object: {}, dispose: () => { } }) },
			logService: new NullLogService(),
		});

		store.add(Reflect.get(SharedChatInputComposer.prototype, '_trackInputSnapshot').call(composer, composer.widget));
		await Reflect.get(SharedChatInputComposer.prototype, '_bindModel').call(composer, URI.parse('draft:/replacement'));

		assert.deepStrictEqual({ input, references: dynamicVariables.variables, snapshots }, {
			input: 'Fix #file:foo.ts', references: [reference],
			snapshots: [{ inputText: 'Fix #file:foo.ts', attachments: [], references: [reference] }],
		});
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
			_suppressSendProgress: constObservable(false),
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
		const suppressSendProgress = observableValue('suppressSendProgress', false);
		const busy: string[] = [];
		const composer: { _renderBusyState(key: { set(value: string): void }): void } = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: busyStore,
			_sending: sending,
			_suppressSendProgress: suppressSendProgress,
			options: { loading: constObservable(false) },
		});
		composer._renderBusyState({ set: value => busy.push(value) });
		transaction(tx => {
			sending.set(true, tx);
			suppressSendProgress.set(true, tx);
		});
		await timeout(1000);
		const whileConfirming = busy.filter(value => value !== '');
		suppressSendProgress.set(false, undefined);
		await timeout(1000);
		sending.set(false, undefined);
		busyStore.dispose();

		assert.deepStrictEqual({ whileConfirming, busy: busy.filter(value => value !== '') }, { whileConfirming: [], busy: ['sending'] });
	}));

	test('scheduling blocks duplicate sends without showing send progress', () => runWithFakedTimers({}, async () => {
		const sending = observableValue('sending', false);
		const picker = new DeferredPromise<undefined>();
		const busy: string[] = [];
		const inputEnabled: boolean[] = [];
		const composer: { schedule(): Promise<void>; _renderBusyState(key: { set(value: string): void }): void } = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: store.add(new DisposableStore()),
			_sending: sending,
			_suppressSendProgress: observableValue('suppressSendProgress', false),
			getInputValue: () => 'Build it',
			getDraft: () => ({ inputText: 'Build it', attachments: [] }),
			setInputEnabled: (enabled: boolean) => inputEnabled.push(enabled),
			options: {
				loading: constObservable(false),
				canSchedule: constObservable(true),
				scheduleRequest: () => picker.p,
			},
		});
		composer._renderBusyState({ set: value => busy.push(value) });

		const scheduling = composer.schedule();
		await timeout(1000);
		const whilePicking = busy.filter(value => value !== '');
		await assert.rejects(composer.schedule(), /Send Later is not available/);
		await picker.complete(undefined);
		await scheduling;

		sending.set(true, undefined);
		await timeout(1000);
		sending.set(false, undefined);
		assert.deepStrictEqual({ whilePicking, busy: busy.filter(value => value !== ''), inputEnabled }, {
			whilePicking: [], busy: ['sending'], inputEnabled: [false, true],
		});
	}));

	test('uses the model picker progress instead of a separate busy action for comparison sends', () => runWithFakedTimers({}, async () => {
		const busyStore = new DisposableStore();
		const sending = observableValue('sending', false);
		const summary = observableValue<string | undefined>('summary', '3 Attempts');
		const busy: string[] = [];
		const composer: { _renderBusyState(key: { set(value: string): void }): void } = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: busyStore,
			_sending: sending,
			_suppressSendProgress: constObservable(false),
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

	test('renders without an overflow widgets element of its own, so suggest shows in the window its chat widget is attached to later, such as the Agents Launcher\'s', () => {
		const renderStore = store.add(new DisposableStore());
		const windowContainer = dom.$('.monaco-workbench');
		let widgetOptions: IChatWidgetViewOptions | undefined;
		const widget = {
			render: () => { },
			setVisible: () => { },
			setInputPartMaxHeightOverride: () => { },
			layout: () => { },
			onDidFocus: Event.None,
			inputEditor: { onDidChangeModelContent: Event.None },
			attachmentModel: { onDidChange: Event.None },
			scopedContextKeyService: new MockContextKeyService(),
			input: { gettingStartedTipContainerElement: dom.$('div'), registerChatPetHorizontalPlatformProvider: () => Disposable.None },
			inputPart: {},
			dispose: () => { },
		};
		const composer: SharedChatInputComposer = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_store: renderStore,
			options: { session: constObservable(undefined) },
			contextKeyService: new MockContextKeyService(),
			layoutService: { getContainer: () => windowContainer },
			sessionsProvidersService: { onDidChangeProviders: Event.None },
			sessionTypePicker: { onDidChangeChatPetPlatform: Event.None },
			instantiationService: { createInstance: () => Disposable.None },
			_scopedInstantiationService: {
				createChild: () => ({
					createInstance: (_ctor: unknown, _location: unknown, _viewContext: unknown, options: IChatWidgetViewOptions) => {
						widgetOptions = options;
						return widget;
					},
					dispose: () => { },
				}),
			},
			_createHostModelSelection: () => undefined,
			_renderBusyState: () => { },
			_registerVoiceTarget: () => Disposable.None,
			_renderSessionControls: () => { },
			_restoreInput: () => { },
			_bindChatModel: () => { },
			_renderAttachmentOffset: () => { },
		});

		// Rendered detached, as its view renders before a window, such as the Agents Launcher's, attaches it. An element the
		// composer put into a window's container now would stay in the main window; the chat widget's own one follows it.
		composer.render(dom.$('div'), dom.$('div'));

		assert.deepStrictEqual({
			overflowWidgetsElement: widgetOptions?.editorOverflowWidgetsDomNode,
			windowContainerChildren: windowContainer.childElementCount,
		}, {
			overflowWidgetsElement: undefined,
			windowContainerChildren: 0,
		});
	});
});
