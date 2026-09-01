/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ClaudeSessionConfigKey } from '../../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { CodexSessionConfigKey } from '../../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { getEvaluationSessionConfig, parseEvaluationSessionRequest, preserveEvaluationRemoteHostAuthentication, shouldPreserveEvaluationRemoteHostAuthentication, waitForEvaluationTarget } from '../../../browser/agentSessions/evaluation/evaluationSessionRequest.js';

suite('EvaluationSessionRequest', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('parses the two surfaces and approval modes', () => {
		assert.deepStrictEqual(parseEvaluationSessionRequest(JSON.stringify({
			version: 1,
			surface: 'agents',
			agent: 'copilotcli',
			approvals: 'yolo',
			prompt: 'Fix the issue.',
			folder: 'vscode-agent-host://example/workspace',
			remoteHost: { address: '127.0.0.1:1234', connectionToken: 'token' },
		})), {
			version: 1,
			surface: 'agents',
			agent: 'copilotcli',
			approvals: 'yolo',
			prompt: 'Fix the issue.',
			folder: 'vscode-agent-host://example/workspace',
			remoteHost: { address: '127.0.0.1:1234', connectionToken: 'token' },
		});

		assert.deepStrictEqual(parseEvaluationSessionRequest(JSON.stringify({
			version: 1,
			surface: 'editor',
			agent: 'claude',
			approvals: 'assisted',
			prompt: 'Review the code.',
		})).surface, 'editor');
	});

	test('rejects unsupported or incomplete requests', () => {
		for (const request of [
			{},
			{ version: 1, surface: 'headless', agent: 'copilotcli', approvals: 'yolo', prompt: 'x' },
			{ version: 1, surface: 'editor', agent: 'other', approvals: 'yolo', prompt: 'x' },
			{ version: 1, surface: 'editor', agent: 'codex', approvals: 'default', prompt: 'x' },
			{ version: 1, surface: 'agents', agent: 'copilotcli', approvals: 'yolo', prompt: 'x' },
			{ version: 1, surface: 'agents', agent: 'codex', approvals: 'yolo', prompt: 'x', folder: 'file:///workspace', remoteHost: { address: 1, connectionToken: 'x' } },
		]) {
			assert.throws(() => parseEvaluationSessionRequest(JSON.stringify(request)));
		}
	});

	test('preserves controller authentication only for the marked remote host', () => {
		assert.strictEqual(shouldPreserveEvaluationRemoteHostAuthentication('ws://127.0.0.1:1234'), false);
		preserveEvaluationRemoteHostAuthentication('ws://127.0.0.1:1234');
		assert.strictEqual(shouldPreserveEvaluationRemoteHostAuthentication('127.0.0.1:1234'), true);
		assert.strictEqual(shouldPreserveEvaluationRemoteHostAuthentication('127.0.0.1:5678'), false);
	});

	test('maps YOLO and Assisted to provider-native autonomous configuration', () => {
		assert.deepStrictEqual(getEvaluationSessionConfig('copilotcli', 'yolo'), {
			[SessionConfigKey.Mode]: 'autopilot',
			[SessionConfigKey.AutoApprove]: 'autoApprove',
		});
		assert.deepStrictEqual(getEvaluationSessionConfig('copilotcli', 'assisted'), {
			[SessionConfigKey.Mode]: 'autopilot',
			[SessionConfigKey.AutoApprove]: 'assisted',
		});
		assert.deepStrictEqual(getEvaluationSessionConfig('claude', 'yolo'), {
			[ClaudeSessionConfigKey.PermissionMode]: 'bypassPermissions',
		});
		assert.deepStrictEqual(getEvaluationSessionConfig('claude', 'assisted'), {
			[ClaudeSessionConfigKey.PermissionMode]: 'auto',
		});
		assert.deepStrictEqual(getEvaluationSessionConfig('codex', 'yolo'), {
			[CodexSessionConfigKey.PermissionsPreset]: 'full-access',
		});
		assert.deepStrictEqual(getEvaluationSessionConfig('codex', 'assisted'), {
			[CodexSessionConfigKey.PermissionsPreset]: 'auto-review',
		});
		assert.deepStrictEqual(getEvaluationSessionConfig('copilotcli', 'yolo', true), {
			[SessionConfigKey.Mode]: 'autopilot',
		});
		assert.deepStrictEqual(getEvaluationSessionConfig('claude', 'yolo', true), {});
		assert.deepStrictEqual(getEvaluationSessionConfig('codex', 'yolo', true), {});
	});

	test('waits for a target advertisement', async () => {
		const emitter = disposables.add(new Emitter<void>());
		let available = false;
		const waiting = waitForEvaluationTarget(() => available, emitter.event, CancellationToken.None);
		available = true;
		emitter.fire();
		await waiting;
	});

	test('fails when a target is not advertised within the timeout', async () => {
		const emitter = disposables.add(new Emitter<void>());
		await assert.rejects(
			waitForEvaluationTarget(() => false, emitter.event, CancellationToken.None, 1),
			/not available within 1ms/,
		);
	});
});
