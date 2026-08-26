/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toDisposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import type { RecordedTimerEvent } from '../../../../../base/test/common/virtualScheduling/index.js';
import { MenuId, MenuRegistry, type IMenuItem, type ISubmenuItem } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import {
	AGENT_SESSION_CLAIM_COMMAND_ID,
	AgentSessionClaimReadiness,
	agentSessionClaimTargets,
	computeAgentSessionClaimCommitment,
	parseAgentSessionClaimCommitment,
	parseAgentSessionClaimRequest,
	type IAgentSessionClaimRequest,
} from '../../common/agentHostSessionClaim.js';

const REQUEST: IAgentSessionClaimRequest = {
	nonce: 'FhV8bR2mQ1sX7dK0pT4uZg',
	sessionType: 'remote-127-0-0-1-9001-copilot',
	sessionUri: 'copilot:/session-abc',
	bridgeExtensionId: 'vscode.agent-host-eval-bridge',
	bridgeExtensionVersion: '0.0.1',
};

function request(overrides: Partial<IAgentSessionClaimRequest> = {}): IAgentSessionClaimRequest {
	return { ...REQUEST, ...overrides };
}

suite('agentHostSessionClaim', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('commitment', () => {

		test('is a stable hex SHA-256 of the exact claim', async () => {
			const commitment = await computeAgentSessionClaimCommitment(REQUEST);
			assert.match(commitment, /^[0-9a-f]{64}$/);
			assert.strictEqual(commitment, await computeAgentSessionClaimCommitment(request()));
		});

		test('changes when any single field changes', async () => {
			const base = await computeAgentSessionClaimCommitment(REQUEST);
			const variants = await Promise.all([
				computeAgentSessionClaimCommitment(request({ nonce: 'FhV8bR2mQ1sX7dK0pT4uZh' })),
				computeAgentSessionClaimCommitment(request({ sessionType: 'remote-127-0-0-1-9001-claude' })),
				computeAgentSessionClaimCommitment(request({ sessionUri: 'copilot:/session-abd' })),
				computeAgentSessionClaimCommitment(request({ bridgeExtensionId: 'other.bridge' })),
				computeAgentSessionClaimCommitment(request({ bridgeExtensionVersion: '0.0.2' })),
			]);
			assert.strictEqual(new Set([base, ...variants]).size, 6, 'every field must be covered by the commitment');
		});

		test('the encoding is unambiguous across field boundaries', async () => {
			// Without length prefixes these two claims would canonicalize to the
			// same bytes: content is shifted from one field into the next.
			const shifted = await computeAgentSessionClaimCommitment(request({
				nonce: 'FhV8bR2mQ1sX7dK0pT4uZgremote',
				sessionType: '-127-0-0-1-9001-copilot',
			}));
			assert.notStrictEqual(shifted, await computeAgentSessionClaimCommitment(REQUEST));
		});

		test('accepts only a hex digest as the launch commitment', () => {
			const digest = 'a'.repeat(64);
			assert.strictEqual(parseAgentSessionClaimCommitment(digest), digest);
			assert.strictEqual(parseAgentSessionClaimCommitment('A'.repeat(64)), undefined, 'uppercase is not canonical');
			assert.strictEqual(parseAgentSessionClaimCommitment('a'.repeat(63)), undefined);
			assert.strictEqual(parseAgentSessionClaimCommitment('a'.repeat(65)), undefined);
			assert.strictEqual(parseAgentSessionClaimCommitment('zz'), undefined);
			assert.strictEqual(parseAgentSessionClaimCommitment(''), undefined);
			assert.strictEqual(parseAgentSessionClaimCommitment(undefined), undefined);
		});

	});

	suite('request validation', () => {

		test('accepts the exact set of fields', () => {
			assert.deepStrictEqual(parseAgentSessionClaimRequest({ ...REQUEST }), REQUEST);
		});

		test('rejects unknown fields rather than ignoring them', () => {
			assert.strictEqual(parseAgentSessionClaimRequest({ ...REQUEST, prompt: 'go' }), undefined);
			assert.strictEqual(parseAgentSessionClaimRequest({ ...REQUEST, attachedContext: [] }), undefined);
		});

		test('rejects a missing, empty, or non-string field', () => {
			for (const key of Object.keys(REQUEST) as (keyof IAgentSessionClaimRequest)[]) {
				const missing: Record<string, unknown> = { ...REQUEST };
				delete missing[key];
				assert.strictEqual(parseAgentSessionClaimRequest(missing), undefined, `${key} must be required`);
				assert.strictEqual(parseAgentSessionClaimRequest({ ...REQUEST, [key]: '' }), undefined, `${key} must be non-empty`);
				assert.strictEqual(parseAgentSessionClaimRequest({ ...REQUEST, [key]: 42 }), undefined, `${key} must be a string`);
			}
		});

		test('rejects non-object payloads', () => {
			assert.strictEqual(parseAgentSessionClaimRequest(undefined), undefined);
			assert.strictEqual(parseAgentSessionClaimRequest(null), undefined);
			assert.strictEqual(parseAgentSessionClaimRequest('nope'), undefined);
			assert.strictEqual(parseAgentSessionClaimRequest([REQUEST]), undefined);
		});

		test('rejects a non-ASCII field so the length prefix is byte-exact', () => {
			// A controller computing the same commitment in Python prefixes UTF-8
			// byte lengths; restricting fields to ASCII makes that identical to
			// JavaScript's UTF-16 `length`.
			for (const key of Object.keys(REQUEST) as (keyof IAgentSessionClaimRequest)[]) {
				assert.strictEqual(parseAgentSessionClaimRequest({ ...REQUEST, [key]: 'caf\u00e9' }), undefined, key);
				assert.strictEqual(parseAgentSessionClaimRequest({ ...REQUEST, [key]: '\u{1F600}' }), undefined, key);
			}
			assert.strictEqual(parseAgentSessionClaimRequest({ ...REQUEST, nonce: 'has\ttab' }), undefined);
		});

		test('rejects a session URI that is not its own canonical form', () => {
			for (const sessionUri of [
				'copilot:/session-abc?x=1',
				'COPILOT:/session-abc',
				'/session-abc',
				'not a uri',
			]) {
				assert.strictEqual(parseAgentSessionClaimRequest({ ...REQUEST, sessionUri }), undefined, sessionUri);
			}
		});

		test('accepts canonical backend session URIs', () => {
			for (const sessionUri of ['copilot:/abc', 'ahp-session:/abc-123']) {
				assert.ok(parseAgentSessionClaimRequest({ ...REQUEST, sessionUri }), sessionUri);
			}
		});
	});

	suite('target readiness', () => {

		const target = async (_backendSession: URI) => toDisposable(() => { });

		/** Runs `body` and reports every timer handler that actually fired. */
		async function recordTimers(body: () => Promise<void>): Promise<readonly RecordedTimerEvent[]> {
			let history: readonly RecordedTimerEvent[] = [];
			await runWithFakedTimers({ useFakeTimers: false, onHistory: recorded => { history = recorded; } }, body);
			return history;
		}

		test('resolves a target by exact session type', () => {
			const registration = agentSessionClaimTargets.register('remote-test-copilot', target);
			assert.strictEqual(agentSessionClaimTargets.getTarget('remote-test-copilot'), target);
			assert.strictEqual(agentSessionClaimTargets.getTarget('remote-test-claude'), undefined);
			registration.dispose();
			assert.strictEqual(agentSessionClaimTargets.getTarget('remote-test-copilot'), undefined);
		});

		test('an already-registered target is ready with no timer involved', async () => {
			const registration = agentSessionClaimTargets.register('remote-early-copilot', target);
			const fired = await recordTimers(async () => {
				const readiness = await agentSessionClaimTargets.whenTargetReady('remote-early-copilot', CancellationToken.None);
				assert.strictEqual(readiness.outcome, AgentSessionClaimReadiness.Ready);
				assert.strictEqual(readiness.outcome === AgentSessionClaimReadiness.Ready && readiness.target, target);
			});
			assert.deepStrictEqual(fired, [], 'readiness must not depend on any timer');
			registration.dispose();
		});

		test('a target registered after the request is delivered by the event, with no timer involved', async () => {
			let registration: IDisposable | undefined;
			const fired = await recordTimers(async () => {
				const pending = agentSessionClaimTargets.whenTargetReady('remote-late-copilot', CancellationToken.None);
				// Registration is the only thing that can settle this wait.
				registration = agentSessionClaimTargets.register('remote-late-copilot', target);
				const readiness = await pending;
				assert.strictEqual(readiness.outcome, AgentSessionClaimReadiness.Ready);
				assert.strictEqual(readiness.outcome === AgentSessionClaimReadiness.Ready && readiness.target, target);
			});
			assert.deepStrictEqual(fired, [], 'readiness must not depend on any timer');
			registration?.dispose();
		});

		test('fires the registration event with the exact session type', () => {
			const seen: string[] = [];
			const listener = agentSessionClaimTargets.onDidRegisterTarget(type => seen.push(type));
			const registration = agentSessionClaimTargets.register('remote-observed-copilot', target);
			assert.deepStrictEqual(seen, ['remote-observed-copilot']);
			registration.dispose();
			listener.dispose();
		});

		test('an unrelated registration does not settle the wait', async () => {
			const cts = new CancellationTokenSource();
			const pending = agentSessionClaimTargets.whenTargetReady('remote-wanted-copilot', cts.token);
			const other = agentSessionClaimTargets.register('remote-unwanted-copilot', target);

			// Only cancellation can end it, which is what proves the unrelated
			// registration was ignored rather than merely slow.
			cts.cancel();
			assert.strictEqual((await pending).outcome, AgentSessionClaimReadiness.Cancelled);
			other.dispose();
			cts.dispose();
		});

		test('an unregistered target stays pending until cancelled', async () => {
			const cts = new CancellationTokenSource();
			const pending = agentSessionClaimTargets.whenTargetReady('remote-absent-copilot', cts.token);
			cts.cancel();
			assert.strictEqual((await pending).outcome, AgentSessionClaimReadiness.Cancelled);
			cts.dispose();
		});

		test('an already-cancelled token resolves without waiting', async () => {
			const cts = new CancellationTokenSource();
			cts.cancel();
			assert.strictEqual(
				(await agentSessionClaimTargets.whenTargetReady('remote-absent-copilot', cts.token)).outcome,
				AgentSessionClaimReadiness.Cancelled);
			cts.dispose();
		});
	});

	suite('command surface', () => {

		function isMenuItemAction(item: IMenuItem | ISubmenuItem): item is IMenuItem {
			return (item as IMenuItem).command !== undefined;
		}

		test('the claim command does not exist unless the dedicated launch registers it', () => {
			assert.strictEqual(CommandsRegistry.getCommand(AGENT_SESSION_CLAIM_COMMAND_ID), undefined);
		});

		test('the claim command is never contributed to a menu or the Command Palette', () => {
			for (const menu of [MenuId.CommandPalette, MenuId.ChatContext, MenuId.GlobalActivity]) {
				const found = MenuRegistry.getMenuItems(menu)
					.some(item => isMenuItemAction(item) && item.command.id === AGENT_SESSION_CLAIM_COMMAND_ID);
				assert.strictEqual(found, false, `claim command must not appear in ${String(menu.id)}`);
			}
		});
	});
});
