/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { SESSIONS_LAYOUT_SCOPE_SETTING, ChatLayoutContext, ChatLayoutPresentation, getChatLayoutOwnerAfterReplacement } from '../../common/chatLayout.js';
import { IChat, ISession } from '../../services/sessions/common/session.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';

suite('Chat layout contract', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function chat(resource: string): IChat {
		return upcastPartial<IChat>({ resource: URI.parse(resource) });
	}

	function session(resource: string, mainChat: IChat): IActiveSession {
		return upcastPartial<IActiveSession>({
			resource: URI.parse(resource),
			mainChat: constObservable(mainChat),
			activeChat: observableValue('activeChat', mainChat),
		});
	}

	test('string mode is frozen until reconstruction and defaults to session', async () => {
		const configuration = new TestConfigurationService();
		const phone = observableValue('phone', false);
		const initial = store.add(new ChatLayoutPresentation(configuration, true, phone));
		await configuration.setUserConfiguration(SESSIONS_LAYOUT_SCOPE_SETTING, 'chat');
		const enabled = store.add(new ChatLayoutPresentation(configuration, true, phone));
		await configuration.setUserConfiguration(SESSIONS_LAYOUT_SCOPE_SETTING, 'chat-shared');
		const shared = store.add(new ChatLayoutPresentation(configuration, true, phone));
		await configuration.setUserConfiguration(SESSIONS_LAYOUT_SCOPE_SETTING, 'session-shared');
		const disabled = store.add(new ChatLayoutPresentation(configuration, true, phone));
		assert.deepStrictEqual([initial, enabled, shared, disabled].map(presentation => ({
			mode: presentation.state.get().mode, active: presentation.state.get().active, frozen: Object.isFrozen(presentation.state.get()),
		})), [
			{ mode: 'session-shared', active: false, frozen: true },
			{ mode: 'chat', active: true, frozen: true },
			{ mode: 'chat-shared', active: true, frozen: true },
			{ mode: 'session-shared', active: false, frozen: true },
		]);
	});

	test('booleans, former modes and invalid enum values never enable ownership', () => {
		const values = [true, false, 'session', 'disabled', 'shared', 'per-chat', 'enabled', null];
		assert.deepStrictEqual(values.map(value => {
			const presentation = store.add(new ChatLayoutPresentation(new TestConfigurationService({ [SESSIONS_LAYOUT_SCOPE_SETTING]: value }), true, constObservable(false)));
			return { mode: presentation.state.get().mode, enabled: presentation.enabled };
		}), values.map(() => ({ mode: 'session-shared', enabled: false })));
	});

	test('the unreleased former settings do not enable ownership', () => {
		const configuration = new TestConfigurationService({
			'sessions.experimental.chatSpecificLayout': 'per-chat',
			'sessions.layout.mode': 'chat',
		});
		const presentation = store.add(new ChatLayoutPresentation(configuration, true, constObservable(false)));
		assert.deepStrictEqual({ mode: presentation.configured, enabled: presentation.enabled }, {
			mode: 'session-shared', enabled: false,
		});
	});

	test('phone startup remains legacy even after returning to desktop', () => {
		const configuration = new TestConfigurationService({ [SESSIONS_LAYOUT_SCOPE_SETTING]: 'chat' });
		const phone = observableValue('phone', true);
		const presentation = store.add(new ChatLayoutPresentation(configuration, false, phone));
		phone.set(false, undefined);
		assert.deepStrictEqual({ configured: presentation.configured, enabled: presentation.enabled, active: presentation.state.get().active }, {
			configured: 'chat', enabled: false, active: false,
		});
	});

	test('runtime suspension invalidates queued work and resumes the focused owner without changing captured ownership', () => {
		const phone = observableValue('phone', false);
		const presentation = store.add(new ChatLayoutPresentation(new TestConfigurationService({ [SESSIONS_LAYOUT_SCOPE_SETTING]: 'chat' }), true, phone));
		const main = chat('opaque-main:/one');
		const peer = chat('different-peer:/two');
		const activeChat = observableValue('activeChat', main);
		const active = observableValue<IActiveSession | undefined>('active', { ...session('opaque-session:/one', main), activeChat });
		const layout = store.add(new ChatLayoutContext(presentation, active));
		const queued = layout.state.get();
		const origin = queued.owner;
		phone.set(true, undefined);
		activeChat.set(peer, undefined);
		const suspended = layout.state.get();
		phone.set(false, undefined);
		assert.deepStrictEqual({
			queuedCurrent: layout.isCurrent(queued),
			presentationCurrent: presentation.isCurrent(queued.presentation),
			suspendedCurrent: layout.isCurrent(suspended),
			resumedCurrent: layout.isCurrent(layout.state.get()),
			origin: origin?.chatResource,
			resumed: layout.state.get().owner?.chatResource,
		}, {
			queuedCurrent: false, presentationCurrent: false, suspendedCurrent: false, resumedCurrent: true,
			origin: main.resource, resumed: peer.resource,
		});
	});

	test('same-session, cross-session, and A/B/A focus changes invalidate snapshots; no session has no owner', () => {
		const localPhone = observableValue('phone', false);
		const presentation = store.add(new ChatLayoutPresentation(new TestConfigurationService({ [SESSIONS_LAYOUT_SCOPE_SETTING]: 'chat' }), true, localPhone));
		const main = chat('chat:/main');
		const peer = chat('chat:/peer');
		const activeChat = observableValue('activeChat', main);
		const first = { ...session('session:/first', main), activeChat };
		const active = observableValue<IActiveSession | undefined>('active', first);
		const layout = store.add(new ChatLayoutContext(presentation, active));
		const queued = layout.state.get();
		activeChat.set(peer, undefined);
		const peerOwner = layout.state.get().owner;
		activeChat.set(main, undefined);
		const returned = layout.state.get();
		const second = session('session:/second', main);
		active.set(second, undefined);
		const secondOwner = layout.state.get().owner;
		active.set(undefined, undefined);
		assert.deepStrictEqual({
			queuedCurrent: layout.isCurrent(queued),
			returnedCurrent: layout.isCurrent(returned),
			peerOwner, secondOwner, empty: layout.state.get().owner,
			frozen: Object.isFrozen(queued) && Object.isFrozen(queued.owner),
		}, {
			queuedCurrent: false, returnedCurrent: false,
			peerOwner: { sessionResource: first.resource, chatResource: peer.resource },
			secondOwner: { sessionResource: second.resource, chatResource: main.resource },
			empty: undefined, frozen: true,
		});
	});

	test('promotion maps supplied main resources, retains opaque peers, and supports same-resource graduation', () => {
		const main = chat('draft-chat:/main');
		const committed = chat('committed-chat:/main');
		const peer = chat('unrelated-scheme:/peer');
		const from = session('session:/draft', main);
		const to = session('session:/created', committed);
		const owner = { sessionResource: from.resource, chatResource: main.resource };
		const peerOwner = { sessionResource: from.resource, chatResource: peer.resource };
		const sameResource: ISession = { ...to, resource: from.resource };
		assert.deepStrictEqual([
			getChatLayoutOwnerAfterReplacement(owner, { from, to }),
			getChatLayoutOwnerAfterReplacement(peerOwner, { from, to }),
			getChatLayoutOwnerAfterReplacement(owner, { from, to: sameResource }),
			getChatLayoutOwnerAfterReplacement(owner, { from, to: from }),
		], [
			{ sessionResource: to.resource, chatResource: committed.resource },
			{ sessionResource: to.resource, chatResource: peer.resource },
			{ sessionResource: from.resource, chatResource: committed.resource },
			owner,
		]);
	});
});
