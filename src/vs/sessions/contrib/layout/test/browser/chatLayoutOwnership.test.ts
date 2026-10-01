/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IActiveSession, IChatDeletedEvent } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { DesktopLayoutController } from '../../browser/desktopLayoutController.js';
import { addPeerChat, createTestHarness, ICreateOptions, ITestLayoutHarness, makeSession, setActiveChat } from './layoutControllerTestUtils.js';

suite('Chat-owned layout (R1/R5/R8/R13)', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	class TestDesktopController extends DesktopLayoutController {
		ownerKeyFor(session: IActiveSession): URI {
			return this._ownerKeyFor(session);
		}
		composition(ownerKey: URI) {
			return this._compositionStore?.get(ownerKey);
		}
	}

	function createDesktopController(options: ICreateOptions = {}): TestDesktopController {
		harness = createTestHarness(store, { desktopLayout: true, workspaceFolders: [{ uri: URI.file('/repo') }], ...options });
		return store.add(harness.instaService.createInstance(TestDesktopController));
	}

	async function settle(): Promise<void> {
		for (let i = 0; i < 6; i++) {
			await timeout(0);
		}
	}

	function visible(): { readonly editor: boolean; readonly auxiliaryBar: boolean } {
		return {
			editor: harness.layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
			auxiliaryBar: harness.layoutService.isVisible(Parts.AUXILIARYBAR_PART),
		};
	}

	function setVisible(editor: boolean, auxiliaryBar: boolean): void {
		harness.layoutService.setPartHidden(!editor, Parts.EDITOR_PART);
		harness.layoutService.setPartHidden(!auxiliaryBar, Parts.AUXILIARYBAR_PART);
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('[R1] disabled: a same-session chat switch never affects the shared composition', async () => {
		createDesktopController({ chatLayoutEnabled: false });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		setVisible(true, false);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false });

		setActiveChat(session, peer);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false }, 'disabled mode ignores the active chat identity');

		setActiveChat(session, session.mainChat.get());
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false });
	});

	test('[R-seed] enabling chat layout for the first time inherits the existing per-session state from the disabled key, and leaves it intact', async () => {
		const layoutState = [{
			sessionResource: 'session:a',
			editorWorkingSet: { id: 'ws-1', name: 'ws-1' },
		}];
		createDesktopController({ chatLayoutEnabled: true, layoutState });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		assert.deepStrictEqual(
			harness.applyWorkingSetCalls,
			[{ id: 'ws-1', name: 'ws-1' }],
			'the main chat (session-keyed owner) must inherit the working set seeded under the disabled-mode key'
		);

		// Never removed — switching chat-specific layout back off must still find
		// the original snapshot under its own (disabled-mode) key untouched.
		const legacyRaw = harness.storageService.get('sessions.singlePane.layoutState', StorageScope.WORKSPACE);
		assert.notStrictEqual(legacyRaw, undefined, 'the legacy disabled-mode key must survive the one-time copy-forward read');
		assert.deepStrictEqual(JSON.parse(legacyRaw!), layoutState, 'the legacy key\'s content must be unchanged by the read');
	});

	test('[R5] enabled: same-session A/B/A keeps each chat\'s own composition distinct', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const main = session.mainChat.get();
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		// A (main chat): the initial restore already seeds editor-only (the legacy
		// default), so open the auxiliary bar too to capture a composition that
		// genuinely differs from it.
		setVisible(true, true);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: true });
		assert.deepStrictEqual(controller.composition(controller.ownerKeyFor(session)), { editor: true, auxiliaryBar: true });

		// B (peer, first visit): hidden/hidden, never copies A's composition.
		setActiveChat(session, peer);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: false }, 'a peer chat never inherits the main chat\'s composition on first visit');

		// B: capture auxiliary-bar-only.
		setVisible(false, true);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true });
		assert.deepStrictEqual(controller.composition(controller.ownerKeyFor(session)), { editor: false, auxiliaryBar: true });

		// Back to A: restores A's own remembered composition, not B's.
		setActiveChat(session, main);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: true });

		// Back to B: restores B's own remembered composition, not A's.
		setActiveChat(session, peer);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true });

	});

	test('[R5] enabled: all four Editor/Details compositions round-trip per owner', async () => {
		createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const both = addPeerChat(session, URI.parse('chat:both'));
		const editorOnly = addPeerChat(session, URI.parse('chat:editorOnly'));
		const auxOnly = addPeerChat(session, URI.parse('chat:auxOnly'));
		const neither = addPeerChat(session, URI.parse('chat:neither'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		const cases: readonly { readonly chat: IChat; readonly editor: boolean; readonly auxiliaryBar: boolean }[] = [
			{ chat: both, editor: true, auxiliaryBar: true },
			{ chat: editorOnly, editor: true, auxiliaryBar: false },
			{ chat: auxOnly, editor: false, auxiliaryBar: true },
			{ chat: neither, editor: false, auxiliaryBar: false },
		];

		for (const c of cases) {
			setActiveChat(session, c.chat);
			await settle();
			setVisible(c.editor, c.auxiliaryBar);
			await settle();
		}

		for (const c of cases) {
			setActiveChat(session, c.chat);
			await settle();
			assert.deepStrictEqual(visible(), { editor: c.editor, auxiliaryBar: c.auxiliaryBar }, `composition for ${c.chat.resource.toString()} did not round-trip`);
		}
	});

	test('[R8] a confirmed peer-chat deletion clears only that owner\'s composition', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		// The initial restore already seeds editor-only, so open the auxiliary bar
		// too to capture a composition that genuinely differs from it.
		setVisible(true, true);
		await settle();
		const mainKey = controller.ownerKeyFor(session);
		assert.notStrictEqual(controller.composition(mainKey), undefined, 'the main chat\'s composition must be captured before the peer deletion');

		setActiveChat(session, peer);
		await settle();
		setVisible(false, true);
		await settle();
		const peerKey = controller.ownerKeyFor(session);
		assert.notStrictEqual(controller.composition(peerKey), undefined, 'the peer chat\'s composition must be captured before deletion');

		const event: IChatDeletedEvent = { session, sessionResource: session.resource, chatResource: peer.resource };
		harness.onDidDeleteChat.fire(event);
		await settle();

		assert.strictEqual(controller.composition(peerKey), undefined, 'a confirmed chat deletion clears its owner composition');
		assert.notStrictEqual(controller.composition(mainKey), undefined, 'the main chat\'s composition is unaffected by a peer deletion');
	});

	test('[R8] a draft promotion carries a peer chat\'s composition to its new owner key', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Completed });
		const draftPeer = addPeerChat(draft, URI.parse('chat:draftPeer'));
		harness.activeSessionObs.set(draft, undefined);
		await settle();

		setActiveChat(draft, draftPeer);
		await settle();
		setVisible(true, true);
		await settle();
		const oldKey = controller.ownerKeyFor(draft);
		assert.notStrictEqual(controller.composition(oldKey), undefined);

		const committed = makeSession(URI.parse('session:committed'));
		const committedPeer = addPeerChat(committed, draftPeer.resource);
		harness.onDidReplaceSession.fire({ from: draft, to: committed });
		harness.activeSessionObs.set(committed, undefined);
		await settle();
		setActiveChat(committed, committedPeer);
		await settle();

		const newKey = controller.ownerKeyFor(committed);
		assert.notStrictEqual(newKey.toString(), oldKey.toString());
		assert.deepStrictEqual(controller.composition(newKey), { editor: true, auxiliaryBar: true }, 'the promoted peer chat keeps its pre-commit composition under its new owner key');
		assert.strictEqual(controller.composition(oldKey), undefined, 'the stale draft owner key is forgotten');
	});

	test('[R13] a phone transition suspends chat-owned composition and resumes the focused chat on exit', async () => {
		createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const main = session.mainChat.get();
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		// A: editor-only. B: capture auxiliary-only.
		setVisible(true, false);
		await settle();
		setActiveChat(session, peer);
		await settle();
		setVisible(false, true);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true });

		// Enter a phone layout while on the peer chat: collapses to the plain
		// session-wide composition (the disabled baseline), not the peer's own.
		harness.chatLayoutIsPhoneObs.set(true, undefined);
		await settle();
		setActiveChat(session, main);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false }, 'phone-suspended layout falls back to the shared session composition');

		// Still suspended: a toggle must not write into the peer's remembered state.
		setVisible(false, true);
		await settle();
		setActiveChat(session, peer);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true }, 'suspended toggles are shared-session state, not a newly adopted peer composition');

		// Leaving the phone layout resumes the focused (peer) chat's own
		// composition exactly as it was before suspension, not the transient
		// shared-session state written while suspended.
		harness.chatLayoutIsPhoneObs.set(false, undefined);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true }, 'the peer chat composition is retained and resumed once suspension ends');
	});
});
