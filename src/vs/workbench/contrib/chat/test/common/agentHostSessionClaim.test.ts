/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuId, MenuRegistry, type IMenuItem, type ISubmenuItem } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import {
	AGENT_SESSION_CLAIM_COMMAND_ID,
	agentSessionClaimTargets,
	computeAgentSessionClaimCommitment,
	equalsConstantTime,
	isCanonicalAgentSessionUri,
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

		test('comparison is exact and length independent', () => {
			const digest = 'a'.repeat(64);
			assert.strictEqual(equalsConstantTime(digest, digest), true);
			assert.strictEqual(equalsConstantTime(digest, `${digest}a`), false);
			assert.strictEqual(equalsConstantTime(digest, digest.slice(0, -1)), false);
			assert.strictEqual(equalsConstantTime(digest, ''), false);
			assert.strictEqual(equalsConstantTime('', ''), true);
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

		test('rejects a non-canonical session URI', () => {
			for (const sessionUri of [
				'copilot:/session-abc#chat',
				'copilot:/session-abc?x=1',
				'copilot:/',
				'COPILOT:/session-abc',
				'copilot:/a/../b',
				'/session-abc',
				'not a uri',
			]) {
				assert.strictEqual(parseAgentSessionClaimRequest({ ...REQUEST, sessionUri }), undefined, sessionUri);
			}
		});

		test('accepts canonical backend session URIs', () => {
			assert.strictEqual(isCanonicalAgentSessionUri('copilot:/abc'), true);
			assert.strictEqual(isCanonicalAgentSessionUri('ahp-session:/abc-123'), true);
		});
	});

	suite('claim targets', () => {

		test('resolves a target by exact session type', async () => {
			const target = async (_backendSession: URI) => toDisposable(() => { });
			const registration = agentSessionClaimTargets.register('remote-test-copilot', target);
			assert.strictEqual(agentSessionClaimTargets.get('remote-test-copilot'), target);
			assert.strictEqual(agentSessionClaimTargets.get('remote-test-claude'), undefined);
			registration.dispose();
			assert.strictEqual(agentSessionClaimTargets.get('remote-test-copilot'), undefined);
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
