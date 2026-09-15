/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, IDimension } from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatRequestVariableEntry, toFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewSelection, ISessionReviewService } from '../../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat } from '../../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { ISessionReviewState, SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { NewChatInputWidget } from '../../../chat/browser/newChatInput.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { SessionReviewComposer } from '../../browser/sessionReviewComposer.js';

suite('SessionReviewComposer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function setup() {
		const instantiation = store.add(new TestInstantiationService());
		const createInstance = sinon.spy(TestInstantiationService.prototype, 'createInstance');
		const container = document.body.appendChild($('div'));
		store.add(toDisposable(() => container.remove()));
		const original = makeSession(URI.parse('test:/session'));
		const main = { ...original.mainChat.get(), title: observableValue('title', 'Main chat') };
		const peer = { ...main, resource: URI.parse('test:/peer'), title: observableValue('title', 'Peer chat') };
		const activeChat = observableValue<IChat>('activeChat', main);
		const session = { ...original, mainChat: constObservable(main), activeChat, chats: constObservable([main, peer]) };
		const review = observableValue<ISessionReviewState | undefined>('review', { sessionResource: session.resource, section: SessionReviewSection.Conversation });
		const selection = observableValue<ISessionReviewSelection | undefined>('selection', undefined);
		const drafts = new ResourceMap<ISettableObservable<ISessionInputDraft>>();
		const getDraft = (resource: URI) => {
			let draft = drafts.get(resource);
			if (!draft) {
				draft = observableValue<ISessionInputDraft>('draft', { inputText: '', attachments: [] });
				drafts.set(resource, draft);
			}
			return draft;
		};
		const replies: { chat: IChat; query: string; attachments: readonly IChatRequestVariableEntry[] }[] = [];
		let renders = 0;
		let disposals = 0;
		let inputElement: HTMLTextAreaElement | undefined;
		instantiation.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiation.stub(ISessionsService, { sessionReview: review });
		instantiation.stub(ISessionReviewService, {
			selection,
			send: async (_session, chat, query, attachments) => { replies.push({ chat, query, attachments }); return true; },
		});
		instantiation.stub(ISessionInputDraftService, { getDraft, setDraft: (resource, value) => getDraft(resource).set(value, undefined) });
		instantiation.stub(ISessionChangesStatsCache, { get: () => undefined });
		instantiation.stub(IHoverService, { setupDelayedHover: () => Disposable.None });
		instantiation.stub(INotificationService, { error: error => { throw error; } });
		instantiation.stubInstance(MenuWorkbenchToolBar, { dispose: () => { } });
		instantiation.stubInstance(NewChatInputWidget, {
			render: parent => {
				renders++;
				inputElement = parent.appendChild($('textarea'));
			},
			layout: () => { },
			focus: () => inputElement?.focus(),
			dispose: () => { disposals++; inputElement?.remove(); },
		});
		const layout = store.add(new Emitter<IDimension>());
		const composer = store.add(instantiation.createInstance(SessionReviewComposer, container, layout.event, session));
		const inputOptions = () => {
			const call = createInstance.getCalls().findLast(call => call.args[0] === NewChatInputWidget);
			assert.ok(call);
			return call.args[1] as ConstructorParameters<typeof NewChatInputWidget>[0];
		};
		return { container, composer, layout, activeChat, main, peer, review, selection, replies, inputOptions, getDraft, counts: () => ({ renders, disposals }) };
	}

	test('keeps one embedded input and its draft when resizing or inspecting another result', () => {
		const h = setup();
		const options = h.inputOptions();
		const attachment = toFileVariableEntry(URI.file('/project/result.md'));
		options.draft!.save({ inputText: 'Keep this draft', attachments: [attachment] });
		for (const section of [SessionReviewSection.Artifacts, SessionReviewSection.Changes, SessionReviewSection.PullRequest]) {
			h.review.set({ sessionResource: URI.parse('test:/session'), section }, undefined);
			h.selection.set({ resource: URI.file(`/project/${section}.md`), label: section }, undefined);
			h.layout.fire({ width: 200, height: 100 });
			h.layout.fire({ width: 700, height: 220 });
		}
		assert.deepStrictEqual({
			sameInput: h.inputOptions() === options, counts: h.counts(),
			layoutMode: options.layoutMode, target: h.container.querySelector('.session-review-reply-title')?.textContent,
			draft: options.draft!.state.get(), inputCount: h.container.querySelectorAll('textarea').length,
		}, {
			sameInput: true, counts: { renders: 1, disposals: 0 }, layoutMode: 'embedded', target: 'Reply to Main chat',
			draft: { inputText: 'Keep this draft', attachments: [attachment] }, inputCount: 1,
		});
	});

	test('uses separate chat drafts and restores the original text and references on return', () => {
		const h = setup();
		const mainOptions = h.inputOptions();
		const attachment = toFileVariableEntry(URI.file('/project/result.md'));
		mainOptions.draft!.save({ inputText: 'Main reply', attachments: [attachment] });
		h.activeChat.set(h.peer, undefined);
		const peerOptions = h.inputOptions();
		const peerInitialDraft = peerOptions.draft!.state.get();
		peerOptions.draft!.save({ inputText: 'Peer reply', attachments: [] });
		const peerTarget = h.container.querySelector('.session-review-reply-title')?.textContent;
		h.activeChat.set(h.main, undefined);
		const restored = h.inputOptions();
		const counts = h.counts();
		h.composer.dispose();

		assert.deepStrictEqual({
			peerInitialDraft, peerTarget, restoredDraft: restored.draft!.state.get(),
			sameDraftHandle: restored.draft!.state === mainOptions.draft!.state,
			peerDraft: h.getDraft(h.peer.resource).get(), counts, afterDispose: h.counts(),
		}, {
			peerInitialDraft: { inputText: '', attachments: [] }, peerTarget: 'Reply to Peer chat',
			restoredDraft: { inputText: 'Main reply', attachments: [attachment] }, sameDraftHandle: true,
			peerDraft: { inputText: 'Peer reply', attachments: [] }, counts: { renders: 3, disposals: 2 }, afterDispose: { renders: 3, disposals: 3 },
		});
	});

	test('captures the input chat for sending and disables replies to a read-only target', async () => {
		const h = setup();
		const mainOptions = h.inputOptions();
		h.activeChat.set({ ...h.peer, interactivity: constObservable(ChatInteractivity.ReadOnly) }, undefined);
		const peerOptions = h.inputOptions();
		await mainOptions.sendRequest({ query: 'Send to the original chat' });
		assert.deepStrictEqual({
			replies: h.replies, canSend: peerOptions.canSendRequest?.get(),
			hint: h.container.querySelector('.session-review-reply-hint')?.textContent,
		}, {
			replies: [{ chat: h.main, query: 'Send to the original chat', attachments: [] }],
			canSend: false, hint: 'This conversation is read-only.',
		});
	});
});
