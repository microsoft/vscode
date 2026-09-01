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
import { getEvaluationSessionConfig, parseEvaluationSessionRequest, waitForEvaluationTarget } from '../../../browser/agentSessions/evaluation/evaluationSessionRequest.js';

suite('EvaluationSessionRequest', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('parses the two surfaces and approval modes', () => {
		assert.deepStrictEqual(parseEvaluationSessionRequest(JSON.stringify({
			version: 1,
			surface: 'agents',
			agent: 'copilotcli',
			approvals: 'yolo',
			prompt: 'Fix the issue.',
			backendScheme: 'ahp-session',
			folder: 'vscode-agent-host://example/workspace',
			remoteHost: { address: '127.0.0.1:1234', connectionToken: 'token' },
		})), {
			version: 1,
			surface: 'agents',
			agent: 'copilotcli',
			approvals: 'yolo',
			prompt: 'Fix the issue.',
			backendScheme: 'ahp-session',
			folder: 'vscode-agent-host://example/workspace',
			remoteHost: { address: '127.0.0.1:1234', connectionToken: 'token' },
		});

		assert.deepStrictEqual(parseEvaluationSessionRequest(JSON.stringify({
			version: 1,
			surface: 'editor',
			agent: 'claude',
			approvals: 'assisted',
			prompt: 'Review the code.',
			backendScheme: 'claude',
		})).surface, 'editor');
	});

	test('rejects unsupported or incomplete requests', () => {
		for (const request of [
			{},
			{ version: 1, surface: 'headless', agent: 'copilotcli', approvals: 'yolo', prompt: 'x', backendScheme: 'ahp-session' },
			{ version: 1, surface: 'editor', agent: 'other', approvals: 'yolo', prompt: 'x', backendScheme: 'other' },
			{ version: 1, surface: 'editor', agent: 'codex', approvals: 'default', prompt: 'x', backendScheme: 'codex' },
			{ version: 1, surface: 'agents', agent: 'copilotcli', approvals: 'yolo', prompt: 'x', backendScheme: 'ahp-session' },
			{ version: 1, surface: 'editor', agent: 'codex', approvals: 'yolo', prompt: 'x' },
			{ version: 1, surface: 'agents', agent: 'codex', approvals: 'yolo', prompt: 'x', backendScheme: 'ahp-session', folder: 'file:///workspace', remoteHost: { address: 1, connectionToken: 'x' } },
		]) {
			assert.throws(() => parseEvaluationSessionRequest(JSON.stringify(request)));
		}
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
	});

	test('waits for a target advertisement', async () => {
		const emitter = disposables.add(new Emitter<void>());
		let available = false;
		const waiting = waitForEvaluationTarget(() => available, emitter.event, CancellationToken.None);
		available = true;
		emitter.fire();
		await waiting;
	});
});
