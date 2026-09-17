/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { WorkflowProgress } from '../../../workflow/common/workflow.js';
import { getAgentHostExtensionInitializeResultMeta } from '../../common/agentHostExtensionProtocol.js';
import { isWorkflowMessage, readAgentWorkflowProgress, readAgentWorkflowRunChange, readWorkflowMessagePresentation, supportsAgentHostWorkflows, toAgentWorkflowCapabilityMeta, toWorkflowMessageMeta, withAgentWorkflowProgress } from '../../common/meta/agentWorkflowMeta.js';

suite('Agent workflow metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const progress: WorkflowProgress = {
		runId: 'run', label: 'Workflow', checkpointId: 'plan', checkpointLabel: 'Plan', position: 1, total: 2, completed: 0,
		status: 'waiting', needsAttention: false, activityAt: 123, revision: 2,
	};

	test('reads validated display metadata without narrowing the admission marker', () => {
		const presentation = { kind: 'workflow', workflowLabel: 'Feature', checkpointLabel: 'Plan', reason: 'start' } as const;
		const invocation = { runId: 'run', assignmentId: 'assignment', turnId: 'turn' };
		const sources = [
			{ _meta: toWorkflowMessageMeta(invocation, presentation) },
			{ _meta: toWorkflowMessageMeta(undefined, presentation) },
			{ _meta: toWorkflowMessageMeta(invocation) },
			{ _meta: { 'vscode.chat.workflow': null } },
			{ _meta: { 'vscode.chat.workflow': { presentation: { ...presentation, extra: 'ignored' } } } },
			{},
		];
		assert.deepStrictEqual(sources.map(source => ({
			marker: isWorkflowMessage(source), presentation: readWorkflowMessagePresentation(source),
		})), [
			{ marker: true, presentation },
			{ marker: true, presentation },
			{ marker: true, presentation: undefined },
			{ marker: true, presentation: undefined },
			{ marker: true, presentation },
			{ marker: false, presentation: undefined },
		]);
	});

	test('rejects malformed workflow display data', () => {
		const presentation = { kind: 'workflow', workflowLabel: 'Feature', checkpointLabel: 'Plan' };
		const invalid = [
			null, [], true, {},
			{ ...presentation, kind: 'agentMerge' },
			{ ...presentation, workflowLabel: ' ' },
			{ ...presentation, workflowLabel: 1 },
			{ ...presentation, checkpointLabel: '' },
			{ ...presentation, checkpointLabel: [] },
			{ ...presentation, reason: 'future-reason' },
			{ ...presentation, reason: false },
		];
		assert.deepStrictEqual(invalid.map(presentation =>
			readWorkflowMessagePresentation({ _meta: { 'vscode.chat.workflow': { presentation } } }),
		), invalid.map(() => undefined));
	});

	test('old hosts and malformed capability values fail closed', () => {
		assert.deepStrictEqual([
			supportsAgentHostWorkflows(undefined),
			supportsAgentHostWorkflows({ _meta: getAgentHostExtensionInitializeResultMeta() }),
			supportsAgentHostWorkflows({ _meta: { 'vscode.workflows': 'true' } }),
			supportsAgentHostWorkflows({ _meta: getAgentHostExtensionInitializeResultMeta(true, true) }),
			supportsAgentHostWorkflows({ _meta: toAgentWorkflowCapabilityMeta(false) }),
			supportsAgentHostWorkflows({ _meta: toAgentWorkflowCapabilityMeta(undefined) }),
			supportsAgentHostWorkflows({ _meta: toAgentWorkflowCapabilityMeta(true) }),
		], [false, false, false, true, false, false, true]);
	});

	test('rejects missing or invalid activity timestamps', () => {
		assert.deepStrictEqual([undefined, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(activityAt =>
			readAgentWorkflowProgress({ _meta: { 'vscode.workflow': { ...progress, activityAt } } }),
		), [undefined, undefined, undefined, undefined, undefined, undefined]);
	});

	test('round-trips the last dispatched caption and rejects malformed values', () => {
		const dispatched = { ...progress, lastDispatchedCheckpointLabel: 'Plan' };
		const invalid = ['', ' \n ', false, 42, [], {}];
		assert.deepStrictEqual({
			restored: readAgentWorkflowProgress({ _meta: withAgentWorkflowProgress(undefined, dispatched) }),
			legacy: readAgentWorkflowProgress({ _meta: withAgentWorkflowProgress(undefined, progress) }),
			invalid: invalid.map(lastDispatchedCheckpointLabel =>
				readAgentWorkflowProgress({ _meta: { 'vscode.workflow': { ...progress, lastDispatchedCheckpointLabel } } })),
		}, { restored: dispatched, legacy: progress, invalid: invalid.map(() => undefined) });
	});

	test('returns only validated progress and preserves unrelated metadata', () => {
		const meta = withAgentWorkflowProgress({ other: true }, progress);
		assert.deepStrictEqual({
			progress: readAgentWorkflowProgress({ _meta: meta }),
			invalidStatus: readAgentWorkflowProgress({ _meta: { ...meta, 'vscode.workflow': { ...progress, status: 'unknown' } } }),
			invalidCount: readAgentWorkflowProgress({ _meta: { ...meta, 'vscode.workflow': { ...progress, total: NaN } } }),
			cleared: withAgentWorkflowProgress(meta, undefined),
			deleted: readAgentWorkflowRunChange({ session: 'copilot:/session' }),
			invalidNotification: readAgentWorkflowRunChange({ session: 'copilot:/session', progress: {} }),
		}, { progress, invalidStatus: undefined, invalidCount: undefined, cleared: { other: true }, deleted: { session: 'copilot:/session', progress: undefined }, invalidNotification: undefined });
	});
});
