/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ToolCallStatus, type ToolCallPendingConfirmationState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ToolRiskLevel, type IToolRiskAssessment } from '../../../browser/tools/chatToolRiskAssessmentService.js';
import { buildAssistedRiskParameters, resolveAssistedRiskKind, shouldAssistedAutoApprove } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';

function pendingConfirmation(overrides?: Partial<ToolCallPendingConfirmationState>): ToolCallPendingConfirmationState {
	return {
		status: ToolCallStatus.PendingConfirmation,
		toolCallId: 'tc-1',
		toolName: 'test_tool',
		displayName: 'Test Tool',
		invocationMessage: 'Running test tool...',
		...overrides,
	};
}

function assessment(risk: ToolRiskLevel): IToolRiskAssessment {
	return { risk, explanation: 'because' };
}

suite('AgentHost Assisted Approvals', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('resolveAssistedRiskKind', () => {

		test('terminal tool kind is assessed under the terminal rubric even when the command is a raw string', () => {
			// A shell command frequently arrives as a plain `toolInput` string,
			// so `parseToolInputParameters` produces `{ input: ... }` rather than
			// `{ command: ... }`. The `terminal` tool kind must still win so the
			// command is assessed under the terminal rubric and not misclassified.
			const tc = pendingConfirmation({ toolName: 'shell', toolInput: 'rm -rf /', _meta: { toolKind: 'terminal' } });
			assert.strictEqual(resolveAssistedRiskKind(tc, { input: 'rm -rf /' }), 'terminal');
		});

		test('falls back to the terminal rubric when parameters carry a command field', () => {
			const tc = pendingConfirmation({ toolName: 'runCommand', toolInput: '{"command":"ls"}' });
			assert.strictEqual(resolveAssistedRiskKind(tc, { command: 'ls' }), 'terminal');
		});

		test('uses the generic rubric for non-terminal tools', () => {
			const tc = pendingConfirmation({ toolName: 'write', toolInput: '{"path":"a.txt"}' });
			assert.strictEqual(resolveAssistedRiskKind(tc, { path: 'a.txt' }), 'generic');
		});
	});

	suite('buildAssistedRiskParameters', () => {

		test('wraps a raw shell command string into a command field for the terminal rubric', () => {
			const tc = pendingConfirmation({ toolName: 'shell', toolInput: 'rm -rf /', _meta: { toolKind: 'terminal' } });
			assert.deepStrictEqual(buildAssistedRiskParameters(tc, 'terminal', { input: 'rm -rf /' }), { command: 'rm -rf /' });
		});

		test('keeps existing command parameters untouched', () => {
			const tc = pendingConfirmation({ toolName: 'shell', toolInput: '{"command":"ls"}', _meta: { toolKind: 'terminal' } });
			assert.deepStrictEqual(buildAssistedRiskParameters(tc, 'terminal', { command: 'ls' }), { command: 'ls' });
		});

		test('leaves generic parameters unchanged', () => {
			const tc = pendingConfirmation({ toolName: 'write', toolInput: '{"path":"a.txt"}' });
			assert.deepStrictEqual(buildAssistedRiskParameters(tc, 'generic', { path: 'a.txt' }), { path: 'a.txt' });
		});
	});

	suite('shouldAssistedAutoApprove (fail-closed decision)', () => {

		test('auto-approves a low-risk (green) assessment', () => {
			assert.strictEqual(shouldAssistedAutoApprove(assessment(ToolRiskLevel.Green), false), true);
		});

		test('auto-approves a medium-risk (orange) assessment', () => {
			assert.strictEqual(shouldAssistedAutoApprove(assessment(ToolRiskLevel.Orange), false), true);
		});

		test('surfaces the prompt for a high-risk (red) assessment', () => {
			assert.strictEqual(shouldAssistedAutoApprove(assessment(ToolRiskLevel.Red), false), false);
		});

		test('surfaces the prompt when no assessment is available (fails closed)', () => {
			assert.strictEqual(shouldAssistedAutoApprove(undefined, false), false);
		});

		test('surfaces the prompt when cancelled, even for a low-risk assessment (fails closed)', () => {
			assert.strictEqual(shouldAssistedAutoApprove(assessment(ToolRiskLevel.Green), true), false);
		});
	});
});
