/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { contextPromptTokens, toClaudeContextAttribution, type ClaudeContextUsageReport } from '../../node/claude/claudeContextUsage.js';
import { makeContextUsageResponse } from './claudeContextUsageTestUtils.js';

suite('claudeContextUsage', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined when the report has no usable total', () => {
		assert.deepStrictEqual(
			{
				zero: toClaudeContextAttribution(makeContextUsageResponse({ totalTokens: 0 })),
				nan: toClaudeContextAttribution(makeContextUsageResponse({ totalTokens: NaN })),
			},
			{ zero: undefined, nan: undefined },
		);
	});

	test('maps every structured section onto the adapter kinds, leaving the remainder for Messages', () => {
		const attribution = toClaudeContextAttribution(makeContextUsageResponse({
			totalTokens: 10_000,
			systemPromptSections: [{ name: 'Identity', tokens: 1_000 }, { name: 'Environment', tokens: 500 }],
			memoryFiles: [{ path: '/repo/CLAUDE.md', type: 'Project', tokens: 300 }],
			slashCommands: { totalCommands: 4, includedCommands: 4, tokens: 200 },
			systemTools: [{ name: 'Read', tokens: 400 }, { name: 'Edit', tokens: 600 }],
			deferredBuiltinTools: [
				{ name: 'NotebookEdit', tokens: 250, isLoaded: true },
				{ name: 'WebSearch', tokens: 999, isLoaded: false },
			],
			mcpTools: [
				{ name: 'mcp__linear__create_issue', serverName: 'linear', tokens: 150 },
				{ name: 'mcp__github__search', serverName: 'github', tokens: 100, isLoaded: false },
			],
			agents: [{ agentType: 'reviewer', source: 'projectSettings', tokens: 120 }],
			skills: { totalSkills: 3, includedSkills: 3, tokens: 350, skillFrontmatter: [] },
			messageBreakdown: {
				toolCallTokens: 800,
				toolResultTokens: 2_000,
				attachmentTokens: 0,
				assistantMessageTokens: 1_500,
				userMessageTokens: 700,
				redirectedContextTokens: 0,
				unattributedTokens: 0,
				toolCallsByType: [],
				attachmentsByType: [],
			},
		}));

		assert.deepStrictEqual(attribution, {
			totalTokens: 10_000,
			compactions: { count: 0 },
			entries: [
				{ kind: 'system', id: 'system-prompt', label: 'System Prompt', tokens: 1_500 },
				{ kind: 'system', id: 'memory-files', label: 'Memory Files', tokens: 300 },
				{ kind: 'system', id: 'slash-commands', label: 'Slash Commands', tokens: 200 },
				{ kind: 'toolDefinition', id: 'tool:Read', label: 'Read', tokens: 400 },
				{ kind: 'toolDefinition', id: 'tool:Edit', label: 'Edit', tokens: 600 },
				{ kind: 'toolDefinition', id: 'tool:deferred:NotebookEdit', label: 'NotebookEdit', tokens: 250 },
				{ kind: 'mcpServer', id: 'mcp:linear:mcp__linear__create_issue', label: 'mcp__linear__create_issue', tokens: 150, attributes: { serverName: 'linear' } },
				{ kind: 'subagent', id: 'agent:projectSettings:reviewer', label: 'reviewer', tokens: 120, attributes: { source: 'projectSettings' } },
				{ kind: 'skill', id: 'skills', label: 'Skills', tokens: 350 },
				{ kind: 'tool', id: 'tool-results', label: 'Tool Results', tokens: 2_000 },
			],
		});
		// Deferred (out-of-window) tools never count against the window.
		const accounted = attribution!.entries.reduce((sum, e) => sum + e.tokens, 0);
		assert.ok(accounted < attribution!.totalTokens, 'entries leave room for the Messages remainder');
	});

	test('omits zero-token sections and copes with a minimal report', () => {
		const attribution = toClaudeContextAttribution(makeContextUsageResponse({
			totalTokens: 42,
			systemPromptSections: [{ name: 'Identity', tokens: 0 }],
			skills: { totalSkills: 0, includedSkills: 0, tokens: 0, skillFrontmatter: [] },
		}));
		assert.deepStrictEqual(attribution, { totalTokens: 42, entries: [], compactions: { count: 0 } });
	});

	test('a report missing mcpTools/agents (detail: summary skips per-category calls) still maps without throwing', () => {
		// The `.d.ts` types `mcpTools`/`agents` as required, but the SDK's own
		// `detail: 'summary'` JSDoc says it skips per-category calls, so the
		// runtime report can omit them. `ClaudeContextUsageReport` makes the two
		// lists optional, so the fixture needs no cast.
		const report: ClaudeContextUsageReport = { ...makeContextUsageResponse({ totalTokens: 12, systemTools: [{ name: 'Read', tokens: 4 }] }) };
		delete report.mcpTools;
		delete report.agents;
		const attribution = toClaudeContextAttribution(report);
		assert.deepStrictEqual(attribution, {
			totalTokens: 12,
			compactions: { count: 0 },
			entries: [{ kind: 'toolDefinition', id: 'tool:Read', label: 'Read', tokens: 4 }],
		});
	});

	suite('contextPromptTokens', () => {

		test('null, non-finite, and valid apiUsage', () => {
			const withApiUsage = (apiUsage: SDKControlGetContextUsageResponse['apiUsage']) => contextPromptTokens(makeContextUsageResponse({ apiUsage }));
			assert.deepStrictEqual(
				{
					nullApiUsage: withApiUsage(null),
					nonFiniteField: withApiUsage({ input_tokens: NaN, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 }),
					zeroSum: withApiUsage({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 }),
					valid: withApiUsage({ input_tokens: 4_000, cache_creation_input_tokens: 500, cache_read_input_tokens: 300, output_tokens: 200 }),
				},
				{ nullApiUsage: undefined, nonFiniteField: undefined, zeroSum: undefined, valid: 4_800 },
			);
		});
	});
});
