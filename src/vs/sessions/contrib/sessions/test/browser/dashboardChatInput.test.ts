/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $ } from '../../../../../base/browser/dom.js';
import { IAction } from '../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { toFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { INewChatInputDraft, NewChatInputWidget } from '../../../chat/browser/newChatInput.js';
import { NewChatWidget } from '../../../chat/browser/newChatWidget.js';
import { IDashboardWorkService } from '../../../intent/common/dashboardWork.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { DashboardChatInput } from '../../browser/views/dashboardChatInput.js';
import { SessionWorkCardContent } from '../../browser/views/sessionWorkCardContent.js';

suite('Dashboard agent conversation input', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());
	const blankResource = URI.from({ scheme: Schemas.vscodeChatInput, path: '/sessions/dashboard-agent-input' });

	function setup() {
		const instantiation = store.add(new TestInstantiationService());
		const calls = sinon.spy(TestInstantiationService.prototype, 'createInstance');
		const regular = makeSession(URI.parse('test:/regular-cloud-draft'), { status: SessionStatus.Untitled });
		const original = makeSession(URI.parse('test:/dashboard-input'), { isQuickChat: true, status: SessionStatus.Untitled });
		const state = observableValue('state', SessionStatus.Untitled);
		const chat = { ...original.mainChat.get(), status: state };
		const session: ISession = { ...original, status: state, workspace: constObservable(undefined), mainChat: constObservable(chat), chats: constObservable([chat]) };
		const draft = observableValue<ISession | undefined>('ownedDraft', undefined);
		const owned = observableValue<readonly ISession[]>('owned', []);
		const pending = observableValue<ISession | undefined>('regular', regular);
		const replaced = store.add(new Emitter<{ from: ISession; to: ISession }>());
		const errors: string[] = [];
		const sent: { query: string; attachments: ISessionInputDraft['attachments'] }[] = [];
		const grouped: string[] = [];
		const reviews: { session: ISession; section: SessionReviewSection | undefined }[] = [];
		let failure: Error | undefined;
		let openFailure: Error | undefined;
		let sendGate = Promise.resolve();
		let headerActions: readonly IAction[] = [];
		const drafts = new ResourceMap<ISettableObservable<ISessionInputDraft>>();
		const getDraft = (resource: URI) => {
			let value = drafts.get(resource);
			if (!value) {
				value = observableValue<ISessionInputDraft>('draft', { inputText: '', attachments: [] });
				drafts.set(resource, value);
			}
			return value;
		};
		getDraft(regular.resource).set({ inputText: 'Keep my cloud work', attachments: [] }, undefined);
		instantiation.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiation.stub(ISessionChangesStatsCache, { get: () => undefined });
		instantiation.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiation.stub(INotificationService, { error: error => errors.push(String(error)) });
		instantiation.stub(ISessionsService, {
			canOpenSession: async () => true,
			openSessionReview: async (session, section) => {
				reviews.push({ session, section });
				if (openFailure) { throw openFailure; }
			},
		});
		instantiation.stub(ISessionGroupsService, {
			getGroup: id => ({ id, name: id, createdAt: 0 }),
			addToGroup: (_session, group) => { grouped.push(group); },
		});
		instantiation.stub(ISessionInputDraftService, { getDraft, setDraft: (resource, value) => getDraft(resource).set(value, undefined) });
		instantiation.stub(ISessionsManagementService, { newSession: pending, onDidReplaceSession: replaced.event, getSession: () => session });
		instantiation.stub(IDashboardWorkService, {
			sessions: owned, draft, executions: constObservable([]),
			start: async () => {
				draft.set(session, undefined);
				owned.set([session], undefined);
				return session;
			},
			getSessionForChat: () => session,
			send: async (_session, query, attachments) => {
				await sendGate;
				if (failure) { throw failure; }
				sent.push({ query, attachments });
				state.set(SessionStatus.Completed, undefined);
				draft.set(undefined, undefined);
				return session;
			},
		});
		let activeDraft: INewChatInputDraft | undefined;
		const editor = $('textarea');
		const inputOptions = () => {
			const call = calls.getCalls().findLast(call => call.args[0] === NewChatInputWidget);
			assert.ok(call);
			return call.args[1] as ConstructorParameters<typeof NewChatInputWidget>[0];
		};
		instantiation.stubInstance(NewChatInputWidget, {
			render: container => { activeDraft = undefined; container.appendChild(editor); },
			layout: () => { }, focus: () => editor.focus(), saveState: () => { },
			getInputDraft: () => (activeDraft ?? inputOptions().draft)!.state.get(),
			setDraft: next => { activeDraft = next; },
			dispose: () => editor.remove(),
		});
		instantiation.stubInstance(WorkbenchToolBar, { setActions: actions => { headerActions = actions; }, dispose: () => { } });
		const createInput = () => {
			const input = store.add(instantiation.createInstance(DashboardChatInput));
			document.body.appendChild(input.element);
			store.add(toDisposable(() => input.element.remove()));
			input.element.style.height = '400px';
			input.layout(1100);
			return input;
		};
		const input = createInput();
		return {
			input, createInput, inputOptions, session, regular, pending, getDraft, sent, grouped, errors, state, reviews,
			fail: (error: Error) => { failure = error; },
			failOpen: (error: Error) => { openFailure = error; },
			setSendGate: (gate: Promise<void>) => { sendGate = gate; },
			headerActions: () => headerActions,
			counts: () => ({
				regularViews: calls.getCalls().filter(call => call.args[0] === NewChatWidget).length,
				transcripts: calls.getCalls().filter(call => call.args[0] === SessionWorkCardContent).length,
			}),
		};
	}

	test('opens an empty agent-led input without adopting a regular draft or loading a transcript', async () => {
		const h = setup();
		await h.input.open();
		assert.deepStrictEqual({
			draft: h.getDraft(blankResource).get().inputText, session: h.input.session.get()?.resource,
			regular: h.pending.get()?.resource, regularText: h.getDraft(h.regular.resource).get().inputText,
			repositoryControls: h.inputOptions().renderRepositoryControls, counts: h.counts(),
		}, {
			draft: '', session: h.session.resource, regular: h.regular.resource, regularText: 'Keep my cloud work',
			repositoryControls: false, counts: { regularViews: 0, transcripts: 0 },
		});
	});

	test('preserves unsent input, evidence and collection across remount, then clears only the accepted draft', async () => {
		const h = setup();
		const attachments = [toFileVariableEntry(URI.file('/evidence/example.png'))];
		h.getDraft(blankResource).set({ inputText: 'Add a hello world extension', attachments }, undefined);
		await h.input.open('extensions');
		h.input.close();
		h.input.dispose();
		h.input.element.remove();
		const reopened = h.createInput();
		await reopened.open();
		const retained = h.getDraft(blankResource).get();
		const accepted = await h.inputOptions().sendRequest({ query: retained.inputText, attachments: [...retained.attachments] });
		assert.deepStrictEqual({
			accepted, retained, sent: h.sent, grouped: h.grouped, blank: h.getDraft(blankResource).get(),
			regular: h.getDraft(h.regular.resource).get().inputText, errors: h.errors,
		}, {
			accepted: true, retained: { inputText: 'Add a hello world extension', attachments },
			sent: [{ query: 'Add a hello world extension', attachments }], grouped: ['extensions'],
			blank: { inputText: '', attachments: [] }, regular: 'Keep my cloud work', errors: [],
		});
	});

	test('first send opens the shared review view instead of a second conversation panel', async () => {
		const h = setup();
		await h.input.open();
		await h.inputOptions().sendRequest({ query: 'Add a hello world extension' });
		assert.deepStrictEqual({ visible: h.input.isVisible, counts: h.counts(), reviews: h.reviews }, {
			visible: false, counts: { regularViews: 0, transcripts: 0 },
			reviews: [{ session: h.session, section: SessionReviewSection.Conversation }],
		});
	});

	test('the draft has an accessible close codicon rather than execution or back buttons', async () => {
		const h = setup();
		await h.input.open();
		const actions = h.headerActions();
		assert.deepStrictEqual(actions.map(action => ({ label: action.label, icon: action.class })), [{ label: 'Close New Work', icon: 'codicon codicon-close' }]);
		await actions[0].run();
		assert.strictEqual(h.input.isVisible, false);
	});

	test('closing during submission does not reopen a conversation or lose the submitted work', async () => {
		const h = setup();
		const gate = new DeferredPromise<void>();
		h.setSendGate(gate.p);
		await h.input.open();
		const sent = h.inputOptions().sendRequest({ query: 'Run in the background' });
		h.input.close();
		await gate.complete();
		assert.deepStrictEqual({ accepted: await sent, visible: h.input.isVisible, sends: h.sent.length, reviews: h.reviews },
			{ accepted: true, visible: false, sends: 1, reviews: [] });
	});

	test('a review-opening failure does not report an accepted request as unsent', async () => {
		const h = setup();
		await h.input.open();
		h.failOpen(new Error('Review unavailable'));
		const accepted = await h.inputOptions().sendRequest({ query: 'Create the extension' });
		assert.deepStrictEqual({ accepted, sends: h.sent.length, visible: h.input.isVisible, errors: h.errors },
			{ accepted: true, sends: 1, visible: false, errors: ['Error: Review unavailable'] });
	});

	test('sending preserves newer draft contents rather than clearing them during review navigation', async () => {
		const h = setup();
		const gate = new DeferredPromise<void>();
		h.setSendGate(gate.p);
		h.getDraft(blankResource).set({ inputText: 'First request', attachments: [] }, undefined);
		await h.input.open();
		const sent = h.inputOptions().sendRequest({ query: 'First request' });
		h.getDraft(blankResource).set({ inputText: 'A different request', attachments: [] }, undefined);
		await gate.complete();
		assert.deepStrictEqual({ accepted: await sent, draft: h.getDraft(blankResource).get().inputText },
			{ accepted: true, draft: 'A different request' });
	});

	test('a rejected send keeps the draft and reports the failure', async () => {
		const h = setup();
		h.getDraft(blankResource).set({ inputText: 'Keep this request', attachments: [] }, undefined);
		await h.input.open();
		h.fail(new Error('Agent unavailable'));
		const accepted = await h.inputOptions().sendRequest({ query: 'Keep this request' });
		assert.deepStrictEqual({ accepted, text: h.getDraft(blankResource).get().inputText, errors: h.errors },
			{ accepted: false, text: 'Keep this request', errors: ['Error: Agent unavailable'] });
	});
});
