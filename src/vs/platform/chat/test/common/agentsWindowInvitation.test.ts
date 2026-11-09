/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../storage/common/storage.js';
import { AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, AgentsWindowInvitationState, getAgentHostEditorActivity, hasAgentsWindowInvitationSessionCooldownElapsed } from '../../common/agentsWindowInvitation.js';

suite('AgentsWindowInvitationState', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const day = 24 * 60 * 60 * 1000;
	const resource = URI.from({ scheme: 'agent-host-copilot', path: '/session' });

	function createHarness() {
		let now = day;
		const storage = store.add(new InMemoryStorageService());
		const state = store.add(new AgentsWindowInvitationState(() => now, storage));
		state.initialize(10);
		const submit = (windowId: number, session = resource, isNewSession = true) => {
			state.update(windowId, { kind: 'request', resource: session, isNewSession });
			state.update(windowId, { kind: 'sessions', sessions: [{ resource: session, inProgress: true, needsInput: false }] });
		};
		return { state, storage, submit, set now(value: number) { now = value; } };
	}

	test('seeds once, counts new sessions once, and transfers request ownership without duplication', () => {
		const h = createHarness();
		h.submit(1);
		h.submit(1, resource, true);
		h.submit(2, resource, false);
		h.state.update(1, { kind: 'sessions', sessions: [{ resource, inProgress: false, needsInput: true }] });
		h.state.initialize(1000);
		assert.deepStrictEqual({
			count: h.state.getState().editorSessionCount,
			sessions: h.state.getState().sessions,
			originalWindow: getAgentHostEditorActivity(h.state.getState(), 1, resource),
			currentWindow: getAgentHostEditorActivity(h.state.getState(), 2, resource),
		}, {
			count: 11,
			sessions: [{ resource, windowId: 2, inProgress: true, needsInput: false }],
			originalWindow: undefined,
			currentWindow: { sameWindow: 1, acrossWindows: false },
		});
	});

	test('a late materialization cannot take ownership from a newer request in another window', () => {
		const h = createHarness();
		const committed = resource.with({ path: '/committed' });
		h.submit(1);
		h.submit(2, committed, false);
		h.state.update(1, { kind: 'commit', original: resource, committed });
		assert.deepStrictEqual({ count: h.state.getState().editorSessionCount, sessions: h.state.getState().sessions }, {
			count: 11, sessions: [{ resource: committed, windowId: 2, inProgress: true, needsInput: false }],
		});
	});

	test('an Agents Window follow-up revokes editor ownership and ignores stale catalog updates', () => {
		const h = createHarness();
		const second = resource.with({ path: '/second' });
		h.submit(1);
		h.submit(1, second);
		h.state.update(1, { kind: 'sessions', sessions: [{ resource: second, inProgress: false, needsInput: false }] });
		h.state.update(undefined, { kind: 'request', resource: second, isNewSession: false });
		h.state.update(1, { kind: 'sessions', sessions: [{ resource: second, inProgress: true, needsInput: false }] });
		h.state.update(undefined, { kind: 'request', resource: resource.with({ path: '/agents-created' }), isNewSession: true });
		assert.deepStrictEqual({
			count: h.state.getState().editorSessionCount,
			activity: getAgentHostEditorActivity(h.state.getState(), 1, resource),
			followUp: getAgentHostEditorActivity(h.state.getState(), 1, second),
			claim: h.state.claim(1, second, true),
		}, { count: 12, activity: { sameWindow: 1, acrossWindows: false }, followUp: undefined, claim: undefined });
	});

	test('materializing an invited resource releases a stale action target', () => {
		const h = createHarness();
		h.submit(1);
		h.state.claim(1, resource, false);
		h.state.update(1, { kind: 'commit', original: resource, committed: resource.with({ path: '/committed' }) });
		assert.strictEqual(h.state.getState().invitation, undefined);
	});

	test('separates same-window and cross-window activity and excludes input-required sessions', () => {
		const h = createHarness();
		const second = resource.with({ path: '/second' });
		const third = resource.with({ path: '/third' });
		h.submit(1);
		h.submit(1, second);
		const same = getAgentHostEditorActivity(h.state.getState(), 1, resource);
		h.submit(2, third);
		const across = getAgentHostEditorActivity(h.state.getState(), 1, resource);
		h.state.update(2, { kind: 'sessions', sessions: [{ resource: third, inProgress: false, needsInput: true }] });
		assert.deepStrictEqual({ same, across, needsInput: getAgentHostEditorActivity(h.state.getState(), 1, resource) }, {
			same: { sameWindow: 2, acrossWindows: false },
			across: { sameWindow: 2, acrossWindows: true },
			needsInput: { sameWindow: 2, acrossWindows: false },
		});
	});

	test('permits only one outstanding claim across windows, including before it renders', async () => {
		const h = createHarness();
		const second = resource.with({ path: '/second' });
		h.submit(1);
		h.submit(2, second);
		const claims = await Promise.all([1, 2].map(async windowId => h.state.claim(windowId, windowId === 1 ? resource : second, false)));
		const claim = claims.find(claim => !!claim)!;
		h.state.release(2, claim.id);
		assert.deepStrictEqual({
			claims: claims.map(claim => claim?.windowId),
			owner: h.state.getState().invitation?.windowId,
			impression: h.state.getState().lastShown,
		}, { claims: [1, undefined], owner: 1, impression: undefined });
	});

	test('records the first real impression, not the claim or a restored presentation', () => {
		const h = createHarness();
		h.submit(1);
		const claim = h.state.claim(1, resource, false)!;
		const before = h.state.getState().lastShown;
		h.now = day + 10;
		h.submit(2, resource.with({ path: '/second' }));
		h.state.markShown(1, claim.id);
		h.now = day + 100;
		h.state.markShown(1, claim.id);
		assert.deepStrictEqual({ before, after: h.state.getState().lastShown }, {
			before: undefined, after: { timestamp: day + 10, editorSessionCount: 12 },
		});
	});

	for (const [additionalSessions, elapsed, allowed] of [[4, day, false], [5, day - 1, false], [5, day, true], [6, day + 1, true]] as const) {
		test(`requires both cooldown thresholds: ${additionalSessions} sessions, ${elapsed}ms`, () => {
			const h = createHarness();
			h.submit(1);
			const claim = h.state.claim(1, resource, false)!;
			h.state.markShown(1, claim.id);
			h.state.release(1, claim.id);
			for (let i = 0; i < additionalSessions; i++) {
				h.submit(1, resource.with({ path: `/additional-${i}` }));
			}
			h.now = day + elapsed;
			assert.strictEqual(!!h.state.claim(1, resource, false), allowed);
		});
	}

	test('persists the harness introduction session ordinal across window and application restarts', () => {
		const h = createHarness();
		h.submit(1);
		h.state.update(1, { kind: 'copilotHarnessIntroductionShown' });
		h.state.resetWindow(1, false);
		const restored = store.add(new AgentsWindowInvitationState(() => 10 * day, h.storage));
		restored.initialize(1000);
		restored.update(2, { kind: 'request', resource, isNewSession: false });
		restored.update(2, { kind: 'sessions', sessions: [{ resource, inProgress: true, needsInput: false }] });
		assert.deepStrictEqual({
			count: restored.getState().editorSessionCount,
			harnessLastShown: restored.getState().lastCopilotHarnessIntroductionSessionCount,
			invitationLastShown: restored.getState().lastShown,
			claim: restored.claim(2, resource, false),
		}, { count: 11, harnessLastShown: 11, invitationLastShown: undefined, claim: undefined });
	});

	test('records a harness introduction before the first session without treating zero as missing history', () => {
		const storage = store.add(new InMemoryStorageService());
		const state = store.add(new AgentsWindowInvitationState(() => day, storage));
		state.initialize(0);
		state.update(1, { kind: 'copilotHarnessIntroductionShown' });
		assert.deepStrictEqual({
			count: state.getState().lastCopilotHarnessIntroductionSessionCount,
			cooldownElapsed: hasAgentsWindowInvitationSessionCooldownElapsed(state.getState()),
		}, { count: 0, cooldownElapsed: false });
	});

	for (const [additionalSessions, allowed] of [[0, false], [4, false], [5, true], [6, true]] as const) {
		test(`requires five new sessions after the harness introduction across windows: ${additionalSessions} sessions`, () => {
			const h = createHarness();
			h.submit(1);
			h.state.update(2, { kind: 'copilotHarnessIntroductionShown' });
			for (let i = 0; i < additionalSessions; i++) {
				h.submit(i % 2 + 1, resource.with({ path: `/additional-${i}` }));
			}
			for (let i = 0; i < 5; i++) {
				h.submit(1, resource, false);
			}
			assert.deepStrictEqual({
				cooldownElapsed: hasAgentsWindowInvitationSessionCooldownElapsed(h.state.getState()),
				allowed: !!h.state.claim(1, resource, false),
				harnessLastShown: h.state.getState().lastCopilotHarnessIntroductionSessionCount,
			}, { cooldownElapsed: allowed, allowed, harnessLastShown: 11 });
		});
	}

	test('a later harness impression restarts session spacing independently of invitation history', () => {
		const h = createHarness();
		h.submit(1);
		h.state.update(1, { kind: 'copilotHarnessIntroductionShown' });
		for (let i = 0; i < 5; i++) {
			h.submit(2, resource.with({ path: `/additional-${i}` }));
		}
		const before = hasAgentsWindowInvitationSessionCooldownElapsed(h.state.getState());
		h.state.update(2, { kind: 'copilotHarnessIntroductionShown' });
		assert.deepStrictEqual({
			before,
			after: hasAgentsWindowInvitationSessionCooldownElapsed(h.state.getState()),
			harnessLastShown: h.state.getState().lastCopilotHarnessIntroductionSessionCount,
			invitationLastShown: h.state.getState().lastShown,
		}, { before: true, after: false, harnessLastShown: 16, invitationLastShown: undefined });
	});

	test('a harness impression invalidates an unrendered invitation without recording an invitation impression', () => {
		const h = createHarness();
		h.submit(1);
		const claim = h.state.claim(1, resource, false)!;
		h.state.update(2, { kind: 'copilotHarnessIntroductionShown' });
		h.state.markShown(1, claim.id);
		assert.deepStrictEqual({ invitation: h.state.getState().invitation, lastShown: h.state.getState().lastShown }, {
			invitation: undefined, lastShown: undefined,
		});
	});

	for (const developerMode of [false, true]) {
		test(`a harness impression clears a visible invitation unless it is a developer preview (${developerMode})`, () => {
			const h = createHarness();
			h.submit(1);
			const claim = h.state.claim(1, resource, developerMode)!;
			h.state.markShown(1, claim.id);
			const lastShown = h.state.getState().lastShown;
			h.state.update(2, { kind: 'copilotHarnessIntroductionShown' });
			assert.deepStrictEqual({
				invitation: h.state.getState().invitation?.id,
				lastShown: h.state.getState().lastShown,
			}, { invitation: developerMode ? claim.id : undefined, lastShown });
		});
	}

	for (const [count, elapsed, allowed] of [
		[2, 0, true],
		[3, 0, false],
		[4, day, false],
		[3, 30 * day - 1, false],
		[3, 30 * day, true],
		[4, 30 * day + 1, true],
		[2, undefined, true],
		[3, undefined, false],
		[4, undefined, false],
		[3, -day, false],
	] as const) {
		test(`Agents Window usage boundary: ${count} sessions, last created ${elapsed ?? 'unknown'}ms ago`, () => {
			const h = createHarness();
			h.now = 60 * day;
			h.storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, count, StorageScope.APPLICATION, StorageTarget.MACHINE);
			if (elapsed !== undefined) {
				h.storage.store(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, 60 * day - elapsed, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
			h.submit(1);
			assert.strictEqual(!!h.state.claim(1, resource, false), allowed);
		});
	}

	test('completion retains the claim until a user action or window close', () => {
		const h = createHarness();
		h.submit(1);
		const claim = h.state.claim(1, resource, false)!;
		h.state.markShown(1, claim.id);
		h.state.update(1, { kind: 'sessions', sessions: [{ resource, inProgress: false, needsInput: false }] });
		const completed = h.state.getState().invitation?.id;
		h.state.resetWindow(1, false);
		assert.deepStrictEqual({ completed, invitation: h.state.getState().invitation, sessions: h.state.getState().sessions }, {
			completed: claim.id, invitation: undefined, sessions: [],
		});
	});

	test('a developer preview bypasses limits once per reload without modifying real impression history', () => {
		const h = createHarness();
		h.submit(1);
		const real = h.state.claim(1, resource, false)!;
		h.state.markShown(1, real.id);
		h.state.release(1, real.id);
		const history = h.state.getState().lastShown;
		h.state.update(2, { kind: 'copilotHarnessIntroductionShown' });
		h.storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 20, StorageScope.APPLICATION, StorageTarget.MACHINE);
		h.storage.store(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, day, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const preview = h.state.claim(1, resource, true)!;
		h.state.markShown(1, preview.id);
		h.state.release(1, preview.id);
		const again = h.state.claim(1, resource, true);
		h.state.resetWindow(1, true);
		assert.deepStrictEqual({ again, afterReload: !!h.state.claim(1, resource, true), history: h.state.getState().lastShown, harnessLastShown: h.state.getState().lastCopilotHarnessIntroductionSessionCount }, {
			again: undefined, afterReload: true, history, harnessLastShown: 11,
		});
	});

	test('materialization preserves ownership and deletion releases an outstanding invitation', () => {
		const h = createHarness();
		const committed = resource.with({ path: '/committed' });
		h.submit(1);
		h.state.update(1, { kind: 'commit', original: resource, committed });
		const claim = h.state.claim(1, committed, false);
		h.state.update(1, { kind: 'delete', resources: [committed] });
		assert.deepStrictEqual({ claimed: !!claim, count: h.state.getState().editorSessionCount, sessions: h.state.getState().sessions, invitation: h.state.getState().invitation }, {
			claimed: true, count: 11, sessions: [], invitation: undefined,
		});
	});
});
