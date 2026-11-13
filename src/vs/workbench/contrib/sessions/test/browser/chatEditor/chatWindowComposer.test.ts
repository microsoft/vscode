/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotification, INotificationHandle, INotificationService, NotificationMessage } from '../../../../../../platform/notification/common/notification.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { parse, stringify } from '../../../../../../base/common/marshalling.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IAgentHostSessionsProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../../common/sessionsProvider.js';
import { ISessionGroupsService } from '../../../browser/sessionGroupsService.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ICreateNewSessionSlotOptions, INewSessionDraftSlot, INewSessionRequestAcceptedEvent, INewSessionRequestEndedEvent, ISessionsManagementService, WorkspaceNotTrustedError } from '../../../common/sessionsManagement.js';
import { IChatRequestVariableEntry } from '../../../../chat/common/attachments/chatVariableEntries.js';
import { ChatDynamicVariableModel } from '../../../../chat/browser/attachments/chatDynamicVariables.js';
import { IDynamicVariable } from '../../../../chat/common/attachments/chatVariables.js';
import { SharedChatInputComposer } from '../../../browser/chat/sharedChatInputComposer.js';
import { CHAT_WINDOW_COMPOSERS_STORAGE_KEY, ChatWindowComposerBackgroundSends, ChatWindowComposerModel, ChatWindowComposers, getChatWindowComposerTarget } from '../../../browser/chatEditor/chatWindowComposer.js';

suite('Chat window composer', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(sessionId: string, options?: { readonly folder?: string; readonly quickChat?: boolean; readonly providerId?: string; readonly status?: IObservable<SessionStatus> }): ISession {
		const main = new class extends mock<IChat>() {
			override readonly resource = URI.parse(`test:/${sessionId}-main`);
			override readonly modelId = constObservable('model');
			override readonly mode = constObservable({ id: 'agent', kind: 'agent' });
		}();
		const folder = options?.folder;
		return new class extends mock<ISession>() {
			override readonly sessionId = sessionId;
			override readonly resource = URI.parse(`test:/${sessionId}`);
			override readonly providerId = options?.providerId ?? 'provider';
			override readonly sessionType = 'type';
			override readonly status = options?.status ?? constObservable(SessionStatus.Untitled);
			override readonly workspace = constObservable(folder ? upcastPartial<ISessionWorkspace>({ uri: URI.file(folder), label: folder.slice(1) }) : undefined);
			override readonly isQuickChat = constObservable(!!options?.quickChat);
			override readonly mainChat = constObservable(main);
		}();
	}

	function createServices(store: DisposableStore, sessions: readonly ISession[] = []) {
		const events: string[] = [];
		const onDidAccept = store.add(new Emitter<INewSessionRequestAcceptedEvent>());
		const onDidEnd = store.add(new Emitter<INewSessionRequestEndedEvent>());
		const onDidReplace = store.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const slots: { readonly slot: INewSessionDraftSlot & { readonly newSession: ISettableObservable<ISession | undefined> }; readonly options?: ICreateNewSessionSlotOptions }[] = [];
		/** The actions of the last notification with actions. */
		const actions: IAction[] = [];
		const notifications = new class extends TestNotificationService {
			override error(message: NotificationMessage): INotificationHandle {
				events.push(`error: ${message}`);
				return super.error(message);
			}
			override info(message: NotificationMessage): INotificationHandle {
				events.push(`info: ${message}`);
				return super.info(message);
			}
			override notify(notification: INotification): INotificationHandle {
				// Those with actions; `error` notifies through here too.
				if (notification.actions) {
					actions.splice(0, actions.length, ...(notification.actions.primary ?? []));
					events.push(`notify: ${notification.message} [${actions.map(action => action.label).join(', ')}]`);
				}
				return super.notify(notification);
			}
		}();

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(INotificationService, notifications);
		instantiationService.stub(IAccessibilityService, new class extends mock<IAccessibilityService>() {
			override status(message: string) { events.push(`status: ${message}`); }
		}());
		instantiationService.stub(IClipboardService, new class extends mock<IClipboardService>() {
			override async writeText(text: string) { events.push(`copied: ${text}`); }
		}());
		const storageService = store.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			// The local agent host, whose drafts can run in a Dev Container
			override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				return providerId === 'local-agent-host' ? upcastPartial<IAgentHostSessionsProvider>({ id: providerId, isDevContainerRequested: () => true }) as ISessionsProvider as T : undefined;
			}
		}());
		instantiationService.stub(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
			override setDraftSlotGroup(slotId: string, groupId: string | undefined) {
				events.push(`group ${slotId} ${groupId}`);
				return toDisposable(() => events.push(`ungroup ${slotId}`));
			}
		}());
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidAcceptNewSessionRequest = onDidAccept.event;
			override readonly onDidEndNewSessionRequest = onDidEnd.event;
			override readonly onDidReplaceNewDraftSession = onDidReplace.event;
			override readonly onDidReplaceSession = Event.None;
			override getNewSessionTarget() { return undefined; }
			override getSession(resource: URI) { return sessions.find(session => session.resource.toString() === resource.toString()); }
			override isNewSessionTargetAvailable(_folder: URI, target: { readonly providerId: string }) { return target.providerId !== 'unavailable'; }
			override createNewSessionSlot(options?: ICreateNewSessionSlotOptions) {
				const id = `slot${slots.length + 1}`;
				const slot = new class extends mock<INewSessionDraftSlot & { readonly newSession: ISettableObservable<ISession | undefined>; dispose(): void }>() {
					override readonly id = id;
					override readonly newSession = observableValue<ISession | undefined>(this, undefined);
					override dispose() { events.push(`dispose ${id}`); }
				}();
				slots.push({ slot, options });
				return slot;
			}
		}();
		instantiationService.stub(ISessionsManagementService, sessionsManagementService);
		const backgroundSends = store.add(instantiationService.createInstance(ChatWindowComposerBackgroundSends));
		const createComposer = (target = { folderUri: URI.file('/repo'), providerId: 'provider', sessionTypeId: 'type' }) => instantiationService.createInstance(ChatWindowComposerModel, URI.parse('vscode-agents-composer:/1'), { target, groupId: 'group' }, backgroundSends, async () => { });
		return { events, actions, onDidAccept, onDidEnd, onDidReplace, slots, sessionsManagementService, backgroundSends, createComposer, sessionsProvidersService: instantiationService.get(ISessionsProvidersService), instantiationService, storageService };
	}

	test('a composer starts its session as the chat it opened from: the session\'s folder, provider and agent where they serve the folder, and the chat\'s model and mode; a Dev Container it runs in; a quick chat\'s provider and agent with no workspace; nothing without a session or a workspace', () => {
		const store = disposables.add(new DisposableStore());
		const { sessionsManagementService, sessionsProvidersService } = createServices(store);
		const target = (session: ISession | undefined) => getChatWindowComposerTarget(sessionsManagementService, sessionsProvidersService, session, session?.mainChat.get());

		assert.deepStrictEqual({
			workspace: target(createSession('workspace', { folder: '/repo' })),
			unavailable: target(createSession('unavailable', { folder: '/repo', providerId: 'unavailable' })),
			devContainer: target(createSession('container', { folder: '/repo', providerId: 'local-agent-host' })),
			quickChat: target(createSession('quick', { quickChat: true })),
			noWorkspace: target(createSession('none')),
			noSession: target(undefined),
		}, {
			workspace: { folderUri: URI.file('/repo'), providerId: 'provider', sessionTypeId: 'type', modelId: 'model', modeId: 'agent' },
			unavailable: { folderUri: URI.file('/repo'), modelId: 'model', modeId: 'agent' },
			devContainer: { folderUri: URI.file('/repo'), providerId: 'local-agent-host', sessionTypeId: 'type', requireDevContainer: true, modelId: 'model', modeId: 'agent' },
			quickChat: { providerId: 'provider', sessionTypeId: 'type', modelId: 'model', modeId: 'agent' },
			noWorkspace: undefined,
			noSession: undefined,
		});
	});

	test('a composer holds its drafts in a slot of its own, whose sends join its group; it shows the session of a foreground send until it ends, retries a failed draft only while what it aims for did not change since it sent it, also a draft of the folder without its URI, and closing it discards only its slot', () => {
		const store = disposables.add(new DisposableStore());
		const { events, onDidAccept, onDidEnd, onDidReplace, slots, createComposer } = createServices(store);
		const composer = createComposer();
		const { slot, options } = slots[0];
		const draft = createSession('draft', { folder: '/repo' });
		slot.newSession.set(draft, undefined);
		const shown = () => composer.session.get()?.sessionId;

		const showsDraft = shown();
		onDidAccept.fire({ session: draft, owner: slot, background: true });
		slot.newSession.set(undefined, undefined);
		const afterBackground = shown();
		slot.newSession.set(draft, undefined);
		onDidAccept.fire({ session: draft, owner: slot, background: false });
		slot.newSession.set(undefined, undefined);
		const sending = shown();
		const prepared = createSession('prepared', { folder: '/repo' });
		onDidReplace.fire({ from: draft, to: prepared });
		const afterReplace = shown();
		onDidEnd.fire({ session: prepared, owner: slot, started: false, readopted: false });
		const afterFailure = shown();
		// A cloud agent's draft of the folder is of its GitHub repository, not of the folder's URI.
		const unchanged = options?.readoptOnFailure?.(createSession('cloud', { folder: '/owner/repo/HEAD', providerId: 'cloud' }));
		composer.setRequestedTarget({ folderUri: URI.file('/other'), providerId: 'provider', sessionTypeId: 'type' });
		const readopt = { unchanged, afterAnotherTarget: options?.readoptOnFailure?.(prepared) };
		composer.dispose();

		assert.deepStrictEqual({ showsDraft, afterBackground, sending, afterReplace, afterFailure, readopt, events }, {
			showsDraft: 'draft',
			afterBackground: undefined,
			sending: 'draft',
			afterReplace: 'prepared',
			afterFailure: undefined,
			readopt: { unchanged: true, afterAnotherTarget: false },
			events: ['group slot1 group', 'dispose slot1', 'ungroup slot1'],
		});
	});

	test('a foreground send that starts its session fires once, with the started session, which the composer shows until its chat takes over', () => {
		const store = disposables.add(new DisposableStore());
		const { onDidAccept, onDidEnd, onDidReplace, slots, createComposer } = createServices(store);
		const composer = store.add(createComposer());
		const { slot } = slots[0];
		const draft = createSession('draft', { folder: '/repo' });
		const started: string[] = [];
		store.add(composer.onDidStart(session => started.push(session.sessionId)));
		onDidAccept.fire({ session: draft, owner: slot, background: false });
		onDidEnd.fire({ session: createSession('other'), owner: slot, started: true, readopted: false });
		const startedSession = createSession('started', { folder: '/repo' });
		onDidReplace.fire({ from: draft, to: startedSession });
		onDidEnd.fire({ session: startedSession, owner: slot, started: true, readopted: false });
		onDidEnd.fire({ session: startedSession, owner: slot, started: true, readopted: false });

		assert.deepStrictEqual({ started, shown: composer.session.get()?.sessionId }, { started: ['started'], shown: 'started' });
	});

	test('a failed background send is reported once, also after its composer is gone, following the draft\'s replacements; not when it started, was cancelled, or was not dispatched', () => {
		const store = disposables.add(new DisposableStore());
		const { events, onDidEnd, onDidReplace, slots, createComposer } = createServices(store);
		const composer = createComposer();
		const { slot } = slots[0];
		const send = (sessionId: string) => {
			const session = createSession(sessionId, { folder: '/repo' });
			return { session, tracked: composer.trackBackgroundSend({ session, query: 'hello', attachedContext: undefined, requestedInBackground: true, isLatest: () => true }) };
		};
		const failed = send('failed');
		const replaced = send('replaced');
		const startedSend = send('started');
		const cancelled = send('cancelled');
		const notDispatched = send('notDispatched');
		notDispatched.tracked.dispose();
		composer.dispose();
		events.length = 0;

		const to = createSession('replacement');
		onDidReplace.fire({ from: replaced.session, to });
		onDidEnd.fire({ session: failed.session, owner: slot, started: false, readopted: false, error: new Error('no agent') });
		onDidEnd.fire({ session: failed.session, owner: slot, started: false, readopted: false, error: new Error('again') });
		onDidEnd.fire({ session: to, owner: slot, started: false, readopted: false, error: new Error('replaced failed') });
		onDidEnd.fire({ session: startedSend.session, owner: slot, started: true, readopted: false });
		onDidEnd.fire({ session: cancelled.session, owner: slot, started: false, readopted: false, error: new CancellationError() });
		onDidEnd.fire({ session: notDispatched.session, owner: slot, started: false, readopted: false, error: new Error('not dispatched') });

		assert.deepStrictEqual(events, ['notify: Couldn\'t start the session in repo with type: no agent [Copy Prompt]', 'notify: Couldn\'t start the session in No Workspace with type: replaced failed [Copy Prompt]']);
	});

	test('a failed background send gives its prompt back to its composer when nothing changed there, announcing it; once the user typed, picked another target or sent again, it offers Restore Prompt, which keeps the current target, and Copy Prompt; only Copy Prompt once the composer is gone; Restore Prompt never replaces what the user wrote since, copying the prompt instead', async () => {
		const store = disposables.add(new DisposableStore());
		const { events, actions, onDidEnd, slots, createComposer } = createServices(store);
		const composer = store.add(createComposer());
		const { slot } = slots[0];
		events.length = 0;
		const written = { inputText: '#attachment:index.ts fix it', attachments: [], references: [{ id: 'a', range: new Range(1, 1, 1, 21), data: URI.file('/repo/index.ts') }] };
		const restored: string[] = [];
		store.add(composer.input.registerRestorer(draft => { restored.push(draft.inputText); return true; }));
		let latest = true;
		// As the composer sends in the background: it records what was written, clears its input, and sends.
		const send = (name: string) => {
			const attempt = composer.input.beginSendAttempt(written);
			composer.input.set({ inputText: '', attachments: [] });
			const session = createSession(name, { folder: '/repo' });
			composer.trackBackgroundSend({ session, query: 'fix it', attachedContext: undefined, requestedInBackground: true, isLatest: () => latest });
			composer.input.endSendAttempt(attempt);
			return session;
		};
		const fail = (session: ISession) => onDidEnd.fire({ session, owner: slot, started: false, readopted: false, error: new Error('no agent') });

		fail(send('idle'));
		const silently = { input: composer.input.get().input, restored: [...restored], events: events.splice(0) };
		composer.input.set({ inputText: '', attachments: [] });
		const retargeted = send('retargeted');
		composer.setRequestedTarget({ folderUri: URI.file('/other') });
		fail(retargeted);
		const afterRetarget = { input: composer.input.get().input.inputText, events: events.splice(0) };
		await actions[0].run();
		await actions[1].run();
		const afterActions = { input: composer.input.get().input.inputText, target: composer.requestedTarget.get()?.folderUri?.path, events: events.splice(0) };
		composer.input.set({ inputText: '', attachments: [] });
		const typedOver = send('typed');
		composer.input.set({ inputText: 'next', attachments: [] });
		fail(typedOver);
		// Restore Prompt never replaces what the user wrote since.
		await actions[0].run();
		const typedKept = composer.input.get().input.inputText;
		composer.input.set({ inputText: '', attachments: [] });
		const superseded = send('superseded');
		latest = false;
		fail(superseded);
		latest = true;
		const gone = send('gone');
		composer.dispose();
		fail(gone);

		assert.deepStrictEqual({ silently, afterRetarget, afterActions, typedKept, rest: events, restored }, {
			silently: { input: written, restored: ['#attachment:index.ts fix it'], events: ['error: Couldn\'t start the session: no agent', 'status: The prompt of the session that couldn\'t start is back in the composer.'] },
			afterRetarget: { input: '', events: ['notify: Couldn\'t start the session in repo with type: no agent [Restore Prompt, Copy Prompt]'] },
			afterActions: { input: '#attachment:index.ts fix it', target: '/other', events: ['copied: #attachment:index.ts fix it'] },
			typedKept: 'next',
			rest: [
				'notify: Couldn\'t start the session in repo with type: no agent [Restore Prompt, Copy Prompt]',
				'copied: #attachment:index.ts fix it',
				'info: The composer can\'t take the prompt back now, so it was copied to the clipboard instead.',
				'notify: Couldn\'t start the session in repo with type: no agent [Restore Prompt, Copy Prompt]',
				'dispose slot1',
				'ungroup slot1',
				'notify: Couldn\'t start the session in repo with type: no agent [Copy Prompt]',
			],
			restored: ['#attachment:index.ts fix it', '#attachment:index.ts fix it'],
		});
	});

	test('an ordinary send that the composer sent in the background and the user did not start, by declining to trust its workspace or cancelling it, gives its prompt back without an error, with its inline references; once the user typed, it offers Restore Prompt and Copy Prompt; one the user sent in the background gives nothing back', async () => {
		const store = disposables.add(new DisposableStore());
		const { events, actions, onDidEnd, slots, createComposer } = createServices(store);
		const composer = store.add(createComposer());
		const { slot } = slots[0];
		events.length = 0;
		const written = { inputText: '#attachment:index.ts fix it', attachments: [], references: [{ id: 'a', range: new Range(1, 1, 1, 21), data: URI.file('/repo/index.ts') }] };
		store.add(composer.input.registerRestorer(() => true));
		// As the composer sends in the background: it records what was written, clears its input, and sends.
		const send = (name: string, requestedInBackground: boolean) => {
			const attempt = composer.input.beginSendAttempt(written);
			composer.input.set({ inputText: '', attachments: [] });
			const session = createSession(name, { folder: '/repo' });
			composer.trackBackgroundSend({ session, query: 'fix it', attachedContext: undefined, requestedInBackground, isLatest: () => true });
			composer.input.endSendAttempt(attempt);
			return session;
		};
		const end = (session: ISession, error: unknown) => onDidEnd.fire({ session, owner: slot, started: false, readopted: false, error });

		end(send('untrusted', false), new WorkspaceNotTrustedError());
		const untrusted = { input: composer.input.get().input, events: events.splice(0) };
		composer.input.set({ inputText: '', attachments: [] });
		end(send('cancelled', false), new CancellationError());
		const cancelled = { input: composer.input.get().input.inputText, events: events.splice(0) };
		composer.input.set({ inputText: '', attachments: [] });
		const typedOver = send('typed', false);
		composer.input.set({ inputText: 'next', attachments: [] });
		end(typedOver, new CancellationError());
		const typed = { input: composer.input.get().input.inputText, events: events.splice(0) };
		await actions[1].run();
		const copied = events.splice(0);
		composer.input.set({ inputText: '', attachments: [] });
		end(send('requested', true), new WorkspaceNotTrustedError());
		const requested = { input: composer.input.get().input.inputText, events: events.splice(0) };

		assert.deepStrictEqual({ untrusted, cancelled, typed, copied, requested }, {
			untrusted: { input: written, events: ['status: The prompt of the session that wasn\'t started is back in the composer.'] },
			cancelled: { input: '#attachment:index.ts fix it', events: ['status: The prompt of the session that wasn\'t started is back in the composer.'] },
			typed: { input: 'next', events: ['notify: The session in repo with type wasn\'t started. [Restore Prompt, Copy Prompt]'] },
			copied: ['copied: #attachment:index.ts fix it'],
			requested: { input: '', events: [] },
		});
	});

	test('a background send that fails while the composer\'s input still sends, such as while it reseeds after the send was accepted, is not reported as given back: its prompt stays in the notification, which restores it once the input shows it, and copies it while the input cannot; one that fails once the input is idle shows in the input', async () => {
		const store = disposables.add(new DisposableStore());
		const { events, actions, onDidAccept, onDidEnd, slots, createComposer } = createServices(store);
		const composer = store.add(createComposer());
		const { slot } = slots[0];
		events.length = 0;

		// The composer's shared input, tracking the host's snapshot as it does once rendered, over a widget that keeps its state.
		const changed = store.add(new Emitter<void>());
		const state: { text: string; attachments: IChatRequestVariableEntry[]; references: IDynamicVariable[] } = { text: '', attachments: [], references: [] };
		const widget = {
			getInput: () => state.text,
			setInput: (value: string) => { state.text = value; changed.fire(); },
			inputEditor: { onDidChangeModelContent: changed.event, getModel: () => undefined },
			attachmentModel: {
				get attachments() { return state.attachments; },
				onDidChange: changed.event,
				addContext: (...entries: IChatRequestVariableEntry[]) => { state.attachments = [...state.attachments, ...entries]; changed.fire(); },
				clearAndSetContext: (...entries: IChatRequestVariableEntry[]) => { state.attachments = entries; changed.fire(); },
			},
			getContrib: () => ({
				get variables() { return state.references; },
				onDidChangeReferences: changed.event,
				setInputState: (inputState: Record<string, unknown>) => { state.references = inputState[ChatDynamicVariableModel.ID] as IDynamicVariable[]; changed.fire(); },
			}),
			input: { get attachmentModel() { return widget.attachmentModel; }, inlineAttachments: undefined },
		};
		const sending = observableValue('sending', false);
		const input = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_widget: widget, _sending: sending, _pendingAttachments: [], options: { session: constObservable(undefined), inputSnapshot: composer.input },
		}) as SharedChatInputComposer;
		store.add(Reflect.get(SharedChatInputComposer.prototype, '_trackInputSnapshot').call(input, widget) as IDisposable);

		const attachment = upcastPartial<IChatRequestVariableEntry>({ id: 'file', name: 'index.ts', kind: 'file', value: URI.file('/repo/index.ts') });
		const reference: IDynamicVariable = { id: 'a', range: new Range(1, 1, 1, 21), data: URI.file('/repo/index.ts') };
		const shown = () => ({ text: state.text, attachments: state.attachments.map(entry => entry.id), references: state.references.map(entry => entry.id), snapshot: composer.input.get().input.inputText, attempt: !!composer.input.get().attempt });
		// As the input sends in the background: it records what was written, clears itself, and sends; its send is accepted, which
		// ends the attempt, while the input still sends until it reseeds.
		const send = (name: string) => {
			state.text = '#attachment:index.ts fix it'; state.attachments = [attachment]; state.references = [reference]; changed.fire();
			sending.set(true, undefined);
			composer.input.beginSendAttempt({ inputText: state.text, attachments: [...state.attachments], references: [...state.references] });
			state.text = ''; state.attachments = []; state.references = []; changed.fire();
			const session = createSession(name, { folder: '/repo' });
			composer.trackBackgroundSend({ session, query: 'fix it', attachedContext: undefined, requestedInBackground: true, isLatest: () => true });
			onDidAccept.fire({ session, owner: slot, background: true });
			return session;
		};
		const fail = (session: ISession) => onDidEnd.fire({ session, owner: slot, started: false, readopted: false, error: new Error('no agent') });

		fail(send('while reseeding'));
		const whileSending = { input: shown(), events: events.splice(0) };
		// Restore Prompt while the input still sends: copied, never lost in an input that does not show it.
		await actions[0].run();
		const restoreWhileSending = { input: shown(), events: events.splice(0) };
		// The reseed ends: nothing shows by itself, the notification still has it.
		sending.set(false, undefined);
		const reseeded = shown();
		await actions[0].run();
		const restoreOnceIdle = { input: shown(), events: events.splice(0) };

		// A send that fails once the input is idle: given back, and the input shows it.
		state.text = ''; state.attachments = []; state.references = []; changed.fire();
		const idle = send('idle');
		sending.set(false, undefined);
		fail(idle);
		const givenBack = { input: shown(), events: events.splice(0) };

		const prompt = { text: '#attachment:index.ts fix it', attachments: ['file'], references: ['a'], snapshot: '#attachment:index.ts fix it', attempt: false };
		const empty = { text: '', attachments: [], references: [], snapshot: '', attempt: false };
		assert.deepStrictEqual({ whileSending, restoreWhileSending, reseeded, restoreOnceIdle, givenBack }, {
			whileSending: { input: empty, events: ['notify: Couldn\'t start the session in repo with type: no agent [Restore Prompt, Copy Prompt]'] },
			restoreWhileSending: { input: empty, events: ['copied: #attachment:index.ts fix it', 'info: The composer can\'t take the prompt back now, so it was copied to the clipboard instead.'] },
			reseeded: empty,
			restoreOnceIdle: { input: prompt, events: [] },
			givenBack: { input: prompt, events: ['error: Couldn\'t start the session: no agent', 'status: The prompt of the session that couldn\'t start is back in the composer.'] },
		});
	});

	test('a background send that fails while no input of the composer shows, such as before its input renders or once it went, is not reported as given back: the snapshot does not take its prompt, which the notification offers to restore once an input shows and copies until then', async () => {
		const store = disposables.add(new DisposableStore());
		const { events, actions, onDidEnd, slots, createComposer } = createServices(store);
		const composer = store.add(createComposer());
		const { slot } = slots[0];
		events.length = 0;
		const written = { inputText: 'fix it', attachments: [] };
		const send = (name: string) => {
			const attempt = composer.input.beginSendAttempt(written);
			composer.input.set({ inputText: '', attachments: [] });
			const session = createSession(name, { folder: '/repo' });
			composer.trackBackgroundSend({ session, query: 'fix it', attachedContext: undefined, requestedInBackground: true, isLatest: () => true });
			composer.input.endSendAttempt(attempt);
			return session;
		};
		const fail = (session: ISession) => onDidEnd.fire({ session, owner: slot, started: false, readopted: false, error: new Error('no agent') });

		// Before an input registers.
		fail(send('unrendered'));
		const unrendered = { snapshot: composer.input.get().input.inputText, events: events.splice(0) };
		await actions[0].run();
		const restoreUnrendered = { snapshot: composer.input.get().input.inputText, events: events.splice(0) };
		// Once its input went: its registration is disposed.
		const shownBy: string[] = [];
		store.add(composer.input.registerRestorer(() => true)).dispose();
		fail(send('gone input'));
		const goneInput = { snapshot: composer.input.get().input.inputText, events: events.splice(0) };
		// An input shows again: Restore Prompt gives it back there.
		store.add(composer.input.registerRestorer(draft => { shownBy.push(draft.inputText); return true; }));
		await actions[0].run();
		const restoreShown = { snapshot: composer.input.get().input.inputText, events: events.splice(0), shownBy };

		const offered = ['notify: Couldn\'t start the session in repo with type: no agent [Restore Prompt, Copy Prompt]'];
		assert.deepStrictEqual({ unrendered, restoreUnrendered, goneInput, restoreShown }, {
			unrendered: { snapshot: '', events: offered },
			restoreUnrendered: { snapshot: '', events: ['copied: fix it', 'info: The composer can\'t take the prompt back now, so it was copied to the clipboard instead.'] },
			goneInput: { snapshot: '', events: offered },
			restoreShown: { snapshot: 'fix it', events: [], shownBy: ['fix it'] },
		});
	});

	test('the composers of chat windows are stored as the state is saved, not as their input changes, with what they aim for, their group, their input and a send that did not end; they restore as a composer with that input or with what the send sent, or as the session a send started; a discarded composer and a malformed entry are not stored', async () => {
		const store = disposables.add(new DisposableStore());
		const started = createSession('started', { folder: '/repo', status: constObservable(SessionStatus.Completed) });
		const { instantiationService, storageService } = createServices(store, [started]);
		const read = () => storageService.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
		const resource = (name: string) => URI.parse(`vscode-agents-composer:/${name}`);
		const open = async () => { };
		const file = { kind: 'file' as const, id: 'a', name: 'index.ts', value: URI.file('/repo/index.ts') };
		const reference = { id: 'a', range: new Range(1, 1, 1, 21), data: file.value, isFile: true, isAttachmentReference: true };

		const waitForSession = async (resource: URI) => resource.toString() === started.resource.toString() ? started : undefined;
		const composers = instantiationService.createInstance(ChatWindowComposers, waitForSession);
		const typed = composers.create(resource('typed'), { target: { folderUri: URI.file('/repo'), providerId: 'provider', sessionTypeId: 'type', modelId: 'model', requireDevContainer: true }, groupId: 'group' }, open);
		typed.input.set({ inputText: '#attachment:index.ts fix it', attachments: [file], references: [reference] });
		const sending = composers.create(resource('sending'), {}, open);
		sending.input.beginSendAttempt({ inputText: 'in flight', attachments: [] });
		const sent = composers.create(resource('sent'), {}, open);
		sent.input.beginSendAttempt({ inputText: 'started it', attachments: [] });
		sent.input.setSendAttemptSession(started.resource);
		composers.create(resource('discarded'), {}, open).dispose();
		const beforeSave = read();
		storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
		// The window closes, with a malformed entry stored beside its composers.
		storageService.store(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, stringify([...parse(read()!), { resource: 'not a composer', input: { inputText: 'x', attachments: [] } }]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		composers.dispose();
		[typed, sending, sent].forEach(composer => composer.dispose());

		const reloaded = store.add(instantiationService.createInstance(ChatWindowComposers, waitForSession));
		const stored = ['typed', 'sending', 'sent', 'discarded'].map(name => reloaded.hasStored(resource(name)));
		const restoredTyped = await reloaded.restore(resource('typed'), open);
		const restoredSending = await reloaded.restore(resource('sending'), open);
		const restoredSent = await reloaded.restore(resource('sent'), open);
		const composerOf = (restored: typeof restoredTyped) => restored?.kind === 'composer' ? store.add(restored.composer) : undefined;
		const typedComposer = composerOf(restoredTyped);
		const sendingComposer = composerOf(restoredSending);
		const typedInput = typedComposer?.input.get();

		assert.deepStrictEqual({
			beforeSave,
			stored,
			typed: typedComposer && { target: { ...typedComposer.requestedTarget.get(), folderUri: typedComposer.requestedTarget.get()?.folderUri?.toString() }, groupId: typedComposer.groupId, text: typedInput?.input.inputText, attachments: typedInput?.input.attachments.map(attachment => URI.isUri(attachment.value) ? attachment.value.path : undefined), references: typedInput?.input.references?.map(ref => ref.id) },
			sending: sendingComposer?.input.get(),
			sent: restoredSent?.kind === 'session' ? restoredSent.session.sessionId : undefined,
		}, {
			beforeSave: undefined,
			stored: [true, true, true, false],
			typed: { target: { folderUri: URI.file('/repo').toString(), providerId: 'provider', sessionTypeId: 'type', modelId: 'model', requireDevContainer: true }, groupId: 'group', text: '#attachment:index.ts fix it', attachments: ['/repo/index.ts'], references: ['a'] },
			sending: { input: { inputText: 'in flight', attachments: [], references: undefined } },
			sent: 'started',
		});
	});

	test('the stored composers the restoration of the chat windows did not claim are forgotten, while open ones and claimed ones are stored again', () => {
		const store = disposables.add(new DisposableStore());
		const { instantiationService, storageService } = createServices(store);
		const resource = (name: string) => URI.parse(`vscode-agents-composer:/${name}`);
		const open = async () => { };
		const composers = instantiationService.createInstance(ChatWindowComposers, async () => undefined);
		const all = ['claimed', 'unclaimed', 'open'].map(name => composers.create(resource(name), {}, open));
		storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
		composers.dispose();
		all.forEach(composer => composer.dispose());

		const reloaded = store.add(instantiationService.createInstance(ChatWindowComposers, async () => undefined));
		const open2 = store.add(reloaded.create(resource('opened'), {}, open));
		reloaded.didFinishRestore([resource('claimed')]);
		storageService.testEmitWillSaveState(WillSaveStateReason.NONE);

		assert.deepStrictEqual({ stored: (parse(storageService.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE)!) as { resource: URI }[]).map(entry => entry.resource.path), opened: open2.resource.path }, {
			stored: ['/opened', '/claimed'],
			opened: '/opened',
		});
	});

	test('a stored composer stays stored while it restores, until the chat it restores as opens in a window: one whose window fails to open restores again with what it had; once open, what it has now is stored, and nothing once it is closed', async () => {
		const store = disposables.add(new DisposableStore());
		const { instantiationService, storageService } = createServices(store);
		const resource = URI.parse('vscode-agents-composer:/typed');
		const open = async () => { };
		const save = () => {
			storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
			const raw = storageService.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
			return raw ? (parse(raw) as { input: { inputText: string } }[]).map(entry => entry.input.inputText) : [];
		};
		const composers = instantiationService.createInstance(ChatWindowComposers, async () => undefined);
		const original = composers.create(resource, {}, open);
		original.input.set({ inputText: 'unsent', attachments: [] });
		save();
		composers.dispose();
		original.dispose();

		const reloaded = store.add(instantiationService.createInstance(ChatWindowComposers, async () => undefined));
		const first = await reloaded.restore(resource, open);
		const whileRestored = { again: await reloaded.restore(resource, open), stored: reloaded.hasStored(resource) };
		// Its window fails to open: the composer goes with it.
		if (first?.kind === 'composer') {
			first.composer.dispose();
		}
		const afterFailure = { stored: reloaded.hasStored(resource), saved: save() };
		const second = await reloaded.restore(resource, open);
		const composer = second?.kind === 'composer' ? second.composer : undefined;
		const restoredInput = composer?.input.get().input.inputText;
		reloaded.didOpen([resource]);
		composer?.input.set({ inputText: 'edited', attachments: [] });
		const whileOpen = { stored: reloaded.hasStored(resource), saved: save() };
		composer?.dispose();

		assert.deepStrictEqual({ whileRestored, afterFailure, restoredInput, whileOpen, afterClose: save() }, {
			whileRestored: { again: undefined, stored: true },
			afterFailure: { stored: true, saved: ['unsent'] },
			restoredInput: 'unsent',
			whileOpen: { stored: false, saved: ['edited'] },
			afterClose: [],
		});
	});

	test('a stored composer whose foreground send had gone out restores as its session once that is known, waiting for it, and as a composer with what was sent when it does not become known; one whose send was not accepted restores at once with what was sent', async () => {
		const store = disposables.add(new DisposableStore());
		const started = createSession('started', { folder: '/repo', status: constObservable(SessionStatus.Completed) });
		const { instantiationService, storageService } = createServices(store);
		const resource = (name: string) => URI.parse(`vscode-agents-composer:/${name}`);
		const open = async () => { };
		const waits: string[] = [];
		const late = new DeferredPromise<ISession | undefined>();
		const never = new DeferredPromise<ISession | undefined>();
		const waitForSession = (session: URI) => {
			waits.push(session.path);
			return session.path === '/late' ? late.p : never.p;
		};
		const composers = instantiationService.createInstance(ChatWindowComposers, waitForSession);
		const originals: IDisposable[] = [];
		for (const [name, session] of [['late', 'test:/late'], ['unknown', 'test:/unknown'], ['unaccepted', undefined]] as const) {
			const composer = composers.create(resource(name), {}, open);
			originals.push(composer);
			composer.input.beginSendAttempt({ inputText: `sent ${name}`, attachments: [] });
			if (session) {
				composer.input.setSendAttemptSession(URI.parse(session));
			}
		}
		storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
		composers.dispose();
		originals.forEach(composer => composer.dispose());

		const reloaded = store.add(instantiationService.createInstance(ChatWindowComposers, waitForSession));
		const restoring = ['late', 'unknown'].map(name => reloaded.restore(resource(name), open));
		const unaccepted = await reloaded.restore(resource('unaccepted'), open);
		late.complete(started);
		never.complete(undefined);
		const [lateRestored, unknownRestored] = await Promise.all(restoring);
		const inputOf = (restored: typeof unaccepted) => restored?.kind === 'composer' ? store.add(restored.composer).input.get() : undefined;

		assert.deepStrictEqual({
			waits,
			late: lateRestored?.kind === 'session' ? lateRestored.session.sessionId : undefined,
			unknown: inputOf(unknownRestored),
			unaccepted: inputOf(unaccepted),
		}, {
			waits: ['/late', '/unknown'],
			late: 'started',
			unknown: { input: { inputText: 'sent unknown', attachments: [], references: undefined } },
			unaccepted: { input: { inputText: 'sent unaccepted', attachments: [], references: undefined } },
		});
	});

	test('a background send that went out ends its send attempt, so a reload while the next draft is created restores neither; a send not accepted keeps it, so a reload restores what was sent', () => {
		const store = disposables.add(new DisposableStore());
		const { onDidAccept, slots, createComposer } = createServices(store);
		const sentInBackground = store.add(createComposer());
		const declined = store.add(createComposer());
		for (const composer of [sentInBackground, declined]) {
			composer.input.beginSendAttempt({ inputText: 'sent', attachments: [] });
			composer.input.set({ inputText: '', attachments: [] });
		}
		onDidAccept.fire({ session: createSession('draft', { folder: '/repo' }), owner: slots[0].slot, background: true });

		assert.deepStrictEqual({ sentInBackground: sentInBackground.toStored().attempt, declined: declined.toStored().attempt?.input.inputText }, {
			sentInBackground: undefined,
			declined: 'sent',
		});
	});
});
