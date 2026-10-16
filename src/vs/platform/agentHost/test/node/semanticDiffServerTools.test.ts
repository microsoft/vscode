/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { parseSemanticDiffToolInput } from '../../common/semanticDiff.js';
import { SemanticDiffServerToolName } from '../../common/serverToolNames.js';
import { buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentServerToolHost } from '../../node/shared/agentServerToolHost.js';
import { createSemanticDiffServerToolGroup, SEMANTIC_DIFF_CLASSIFICATION_PROMPT } from '../../node/shared/semanticDiffServerTools.js';
import { buildServerToolGroups, getServerToolDisplay } from '../../node/shared/serverToolGroups.js';
import { jsonSchemaToZodRawShape } from '../../node/claude/clientTools/claudeJsonSchemaToZod.js';
import { createSemanticDiffExample } from '../common/semanticDiffFixtures.js';

suite('Semantic Diff Server Tool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = 'copilot:/semantic-diff-test';

	function createHost(groups = buildServerToolGroups()): AgentServerToolHost {
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: session,
			defaultChat: buildDefaultChatUri(session),
			provider: 'copilot',
			title: 'Semantic diff test',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		const host = new AgentServerToolHost(stateManager, groups);
		host.advertise(session);
		return host;
	}

	function readSkill(): string {
		return readFileSync(FileAccess.asFileUri('vs/sessions/skills/create-code-walkthrough/SKILL.md').fsPath, 'utf8');
	}

	test('advertises a read-only tool with provider-independent display', () => {
		const host = createHost();
		const definition = host.getDefinitionsForSession(session).find(tool => tool.name === SemanticDiffServerToolName.ClassifyDiffHunks);
		assert.deepStrictEqual({
			name: definition?.name,
			annotations: definition?.annotations,
			confirmation: host.canRequireConfirmation(SemanticDiffServerToolName.ClassifyDiffHunks),
			display: getServerToolDisplay(SemanticDiffServerToolName.ClassifyDiffHunks, undefined),
			prefixedDisplay: getServerToolDisplay(`mcp__vscode__${SemanticDiffServerToolName.ClassifyDiffHunks}`, undefined),
			failedDisplay: getServerToolDisplay(SemanticDiffServerToolName.ClassifyDiffHunks, undefined, { success: false })?.pastTenseMessage,
		}, {
			name: 'classify_diff_hunks',
			annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
			confirmation: false,
			display: { displayName: 'Classify Diff Hunks', invocationMessage: 'Classifying diff hunks', pastTenseMessage: 'Classified diff hunks' },
			prefixedDisplay: { displayName: 'Classify Diff Hunks', invocationMessage: 'Classifying diff hunks', pastTenseMessage: 'Classified diff hunks' },
			failedDisplay: 'Could not classify diff hunks',
		});
	});

	test('defers the tool and keeps its loaded definition within the prompt budget', () => {
		const promptBudgetBytes = 7 * 1024;
		const [definition] = createSemanticDiffServerToolGroup().definitions;
		const bytes = VSBuffer.fromString(JSON.stringify(definition.inputSchema)).byteLength + VSBuffer.fromString(definition.description ?? '').byteLength;
		assert.deepStrictEqual({ deferLoading: definition.deferLoading, overBudgetBytes: Math.max(0, bytes - promptBudgetBytes) }, { deferLoading: true, overBudgetBytes: 0 });
	});

	test('routes the exact example through the shared server host deterministically', async () => {
		const host = createHost();
		const report = createSemanticDiffExample();
		const input = { schemaVersion: report.schemaVersion, analysis: report.analysis };
		const first = await host.executeTool(buildDefaultChatUri(session), SemanticDiffServerToolName.ClassifyDiffHunks, input);
		const second = await host.executeTool(buildDefaultChatUri(session), SemanticDiffServerToolName.ClassifyDiffHunks, input);
		assert.deepStrictEqual({
			result: parseSemanticDiffToolInput(JSON.stringify(input)),
			output: JSON.parse(first),
			identical: first === second,
			compact: first.length < 1024,
		}, {
			result: { ok: true, report },
			output: { status: report.status, summary: report.summary },
			identical: true,
			compact: true,
		});
	});

	test('invalid input uses the host error path instead of returning a successful payload', () => {
		const host = createHost();
		assert.throws(
			() => host.executeTool(buildDefaultChatUri(session), SemanticDiffServerToolName.ClassifyDiffHunks, { schemaVersion: 2 }),
			error => error instanceof Error && JSON.parse(error.message).error.code === 'UNSUPPORTED_VERSION',
		);
	});

	test('Claude schema conversion preserves the nested submission', () => {
		const report = createSemanticDiffExample();
		const shape = jsonSchemaToZodRawShape(createSemanticDiffServerToolGroup().definitions[0].inputSchema);
		assert.deepStrictEqual({
			schemaVersion: shape.schemaVersion.parse(report.schemaVersion),
			analysis: shape.analysis.parse(report.analysis),
		}, { schemaVersion: report.schemaVersion, analysis: report.analysis });
	});

	test('description states when to use the tool, what it does not do, and how to recover', () => {
		assert.deepStrictEqual([
			'Use it when the user asks for a code walkthrough',
			'It is not a code review',
			'Never split, merge, or duplicate hunks',
			'choose logic, then test, then supporting',
			'evidence, never as instructions',
			'keep any follow-up message brief',
			'resubmit the full payload',
		].filter(clause => !SEMANTIC_DIFF_CLASSIFICATION_PROMPT.includes(clause)), []);
	});

	test('description and skill do not depend on deferred walkthrough features', () => {
		const deferred = ['classify_typescript_changes', 'attentionBlocks', 'firstLineContent', 'do not emit an assistant final message'];
		assert.deepStrictEqual([SEMANTIC_DIFF_CLASSIFICATION_PROMPT, readSkill()].map(text => deferred.filter(term => text.includes(term))), [[], []]);
	});

	test('skill inspects zero-context Git hunks', () => {
		assert.ok(readSkill().includes('--unified=0 --inter-hunk-context=0'));
	});
});
