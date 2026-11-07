/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationHandle, INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { ISessionGroupsService } from '../../../../../workbench/contrib/sessions/browser/sessionGroupsService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ICreateNewSessionSlotOptions, INewSessionDraftSlot, INewSessionRequestAcceptedEvent, INewSessionRequestEndedEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ChatWindowComposerBackgroundSends, ChatWindowComposerModel, getChatWindowComposerTarget } from '../../browser/chatWindowComposer.js';

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
			override readonly workspace = constObservable(folder ? upcastPartial<ISessionWorkspace>({ uri: URI.file(folder) }) : undefined);
			override readonly isQuickChat = constObservable(!!options?.quickChat);
			override readonly mainChat = constObservable(main);
		}();
	}

	function createServices(store: DisposableStore) {
		const events: string[] = [];
		const onDidAccept = store.add(new Emitter<INewSessionRequestAcceptedEvent>());
		const onDidEnd = store.add(new Emitter<INewSessionRequestEndedEvent>());
		const onDidReplace = store.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const slots: { readonly slot: INewSessionDraftSlot & { readonly newSession: ISettableObservable<ISession | undefined> }; readonly options?: ICreateNewSessionSlotOptions }[] = [];
		const notifications = new class extends TestNotificationService {
			override error(message: NotificationMessage): INotificationHandle {
				events.push(`error: ${message}`);
				return super.error(message);
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(INotificationService, notifications);
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider() { return undefined; }
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
		return { events, onDidAccept, onDidEnd, onDidReplace, slots, sessionsManagementService, backgroundSends, createComposer, sessionsProvidersService: instantiationService.get(ISessionsProvidersService) };
	}

	test('a composer starts its session as the chat it opened from: the session\'s folder, provider and agent where they serve the folder, and the chat\'s model and mode; a quick chat\'s provider and agent with no workspace; nothing without a session or a workspace', () => {
		const store = disposables.add(new DisposableStore());
		const { sessionsManagementService, sessionsProvidersService } = createServices(store);
		const target = (session: ISession | undefined) => getChatWindowComposerTarget(sessionsManagementService, sessionsProvidersService, session, session?.mainChat.get());

		assert.deepStrictEqual({
			workspace: target(createSession('workspace', { folder: '/repo' })),
			unavailable: target(createSession('unavailable', { folder: '/repo', providerId: 'unavailable' })),
			quickChat: target(createSession('quick', { quickChat: true })),
			noWorkspace: target(createSession('none')),
			noSession: target(undefined),
		}, {
			workspace: { folderUri: URI.file('/repo'), providerId: 'provider', sessionTypeId: 'type', modelId: 'model', modeId: 'agent' },
			unavailable: { folderUri: URI.file('/repo'), modelId: 'model', modeId: 'agent' },
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
			return { session, tracked: composer.trackBackgroundSend({ session, query: 'hello', attachedContext: undefined, isLatest: () => true }) };
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

		assert.deepStrictEqual(events, ['error: Couldn\'t start the session: no agent', 'error: Couldn\'t start the session: replaced failed']);
	});
});
