/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deterministic Agent Host end-to-end tests for the bundled Codex provider.
 */

import assert from 'assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { AgentHostCodexMultiRootEnabledConfigKey } from '../../../../common/agentHostSchema.js';
import { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import { AgentHostE2EServerLease, dispatchTurn, removeTempDirs, resolveGitHubToken, startBackgroundApprovalLoop } from '../harness/agentHostE2ETestHarness.js';
import { defineAgentHostE2ETests } from '../suites/agentHostE2ESuites.js';
import { getActionEnvelope, isActionNotification, TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { CODEX_CONFIG } from './codexTestConfiguration.js';

const RECORD = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1';
const portableShellToolReplayEnabled = RECORD || process.platform !== 'linux' || !CODEX_CONFIG.shellToolReplayUnstableOnLinux;

defineAgentHostE2ETests(CODEX_CONFIG);

(CODEX_CONFIG.enabled ? suite : suite.skip)('Agent Host E2E — Codex (Codex-specific)', function () {

	let client: TestProtocolClient;
	let lease: AgentHostE2EServerLease | undefined;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	suiteSetup(function () {
		lease = new AgentHostE2EServerLease(CODEX_CONFIG, { codexSdkRoot: CODEX_CONFIG.codexSdkRoot });
	});

	setup(async function () {
		this.timeout(60_000);
		if (!lease) {
			throw new Error('Agent Host E2E server lease was not initialized.');
		}
		({ client } = await lease.acquire(this.currentTest?.title ?? 'unknown'));
	});

	teardown(async function () {
		this.timeout(120_000);
		if (!lease) {
			throw new Error('Agent Host E2E server lease was not initialized.');
		}
		const failed = this.currentTest?.state === 'failed';
		const errors: Error[] = [];
		try {
			await lease.release(createdSessions, failed);
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
		try {
			await removeTempDirs(tempDirs);
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
		if (errors.length > 0) {
			throw new AggregateError(errors, `Failed to dispose Codex-specific E2E test resources: ${errors.map(error => error.message).join('; ')}`);
		}
	});

	(portableShellToolReplayEnabled ? test : test.skip)('secondary workspace skill reaches the Codex model request', async function () {
		this.timeout(120_000);

		const parent = mkdtempSync(join(tmpdir(), 'ahp-codex-multiroot-'));
		tempDirs.push(parent);
		const rootA = join(parent, 'a');
		const rootB = join(parent, 'b');
		const skillName = 'secondary-root-marker';
		const marker = 'CODEX_SECONDARY_ROOT_SKILL_MARKER_73';
		const skillDirectory = join(rootB, '.agents', 'skills', skillName);
		const readSkillCommand = `node -e "process.stdout.write(require('fs').readFileSync('../b/.agents/skills/${skillName}/SKILL.md', 'utf8'))"`;
		mkdirSync(rootA, { recursive: true });
		mkdirSync(skillDirectory, { recursive: true });
		writeFileSync(join(skillDirectory, 'SKILL.md'), [
			'---',
			`name: ${skillName}`,
			'description: Confirms that Codex loaded a skill from a secondary workspace root.',
			'---',
			'',
			`When invoked, follow this marker instruction: ${marker}`,
		].join('\n'));

		client.setWorkingDirectory(parent);
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'codex-multiroot-skill' }, 30_000);
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);
		await client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		let multiRootEnabled = false;

		try {
			client.dispatch({
				channel: ROOT_STATE_URI,
				clientSeq: 0,
				action: { type: ActionType.RootConfigChanged, config: { [AgentHostCodexMultiRootEnabledConfigKey]: true } },
			});
			await client.waitForNotification(n => {
				if (!isActionNotification(n, ActionType.RootConfigChanged)) {
					return false;
				}
				const action = getActionEnvelope(n).action as { readonly config?: Readonly<Record<string, boolean>> };
				return action.config?.[AgentHostCodexMultiRootEnabledConfigKey] === true;
			}, 30_000);
			multiRootEnabled = true;

			const sessionUri = URI.from({ scheme: CODEX_CONFIG.scheme, path: `/${generateUuid()}` }).toString();
			await client.call('createSession', {
				channel: sessionUri,
				provider: CODEX_CONFIG.provider,
				workingDirectories: [URI.file(rootA).toString(), URI.file(rootB).toString()],
				config: { isolation: 'folder' },
			}, 30_000);
			createdSessions.push(sessionUri);
			await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			await client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
			client.dispatch({
				channel: sessionUri,
				clientSeq: 1,
				action: { type: ActionType.SessionTitleChanged, title: 'Secondary workspace skill test' },
			});
			await client.waitForNotification(n => isActionNotification(n, ActionType.SessionTitleChanged), 30_000);
			client.clearReceived();

			const prompt = `Use the ${skillName} skill. Read its SKILL.md by running exactly this shell command, with no modifications: \`${readSkillCommand}\`. Then reply with exactly done.`;
			const approvalLoop = startBackgroundApprovalLoop(client, {
				approvalSeqStart: 100,
				allow: [{ toolName: CODEX_CONFIG.shellToolName }],
			});
			try {
				dispatchTurn(client, sessionUri, 'turn-secondary-skill', prompt, 2);
				await client.waitForNotification(
					n => isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error'),
					90_000,
				);
			} finally {
				await approvalLoop.stop();
			}

			const errors = client.receivedNotifications(n => isActionNotification(n, 'chat/error'));
			assert.deepStrictEqual({
				approvalErrors: approvalLoop.errors,
				errorCount: errors.length,
				modelRequestIncludesMarker: lease!.observedModelRequestBodies.some(body => body.includes(marker)),
			}, {
				approvalErrors: [],
				errorCount: 0,
				modelRequestIncludesMarker: true,
			});
		} finally {
			if (multiRootEnabled) {
				client.dispatch({
					channel: ROOT_STATE_URI,
					clientSeq: 3,
					action: { type: ActionType.RootConfigChanged, config: { [AgentHostCodexMultiRootEnabledConfigKey]: false } },
				});
				await client.waitForNotification(n => {
					if (!isActionNotification(n, ActionType.RootConfigChanged)) {
						return false;
					}
					const action = getActionEnvelope(n).action as { readonly config?: Readonly<Record<string, boolean>> };
					return action.config?.[AgentHostCodexMultiRootEnabledConfigKey] === false;
				}, 30_000);
			}
		}
	});

	suiteTeardown(async function () {
		this.timeout(120_000);
		await lease?.dispose();
	});
});
