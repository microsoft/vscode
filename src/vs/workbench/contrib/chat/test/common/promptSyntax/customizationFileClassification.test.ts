/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUri, extUriIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { classifyCustomizationFile, getCustomizationFileScope } from '../../../common/promptSyntax/customizationFileClassification.js';

suite('customizationFileClassification', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies AI customization files by name and folder', () => {
		const paths = [
			'/repo/AGENTS.md',
			'/repo/packages/api/agents.md',
			'/home/me/.codex/AGENTS.md',
			'/repo/CLAUDE.md',
			'/repo/CLAUDE.local.md',
			'/repo/claude.md',
			'/repo/GEMINI.md',
			'/repo/.cursorrules',
			'/repo/.github/copilot-instructions.md',
			'/repo/.github/instructions/ts.instructions.md',
			'/repo/.claude/rules/testing.md',
			'/repo/.github/prompts/review.prompt.md',
			'/home/me/.codex/prompts/fix.md',
			'/repo/.github/agents/reviewer.md',
			'/repo/.claude/agents/reviewer.md',
			'/repo/.github/skills/pdf/SKILL.md',
			'/home/me/.copilot/skills/pdf/SKILL.md',
			'/home/me/.agents/skills/pdf/SKILL.md',
			'/repo/.claude/skills/pdf/SKILL.md',
			'/repo/.claude/commands/git/commit.md',
			'/repo/.cursor/rules/style.mdc',
			'/repo/.github/hooks/format.json',
			'/repo/.claude/settings.json',
			'/home/me/.codex/config.toml',
			'/repo/.vscode/mcp.json',
			'/repo/.mcp.json',
			'/repo/README.md',
			'/repo/docs/plan.md',
			'/repo/.claude/agents/README.md',
			'/repo/.github/workflows/ci.json',
			'/repo/package.json',
		];

		assert.deepStrictEqual(paths.map(path => [path, classifyCustomizationFile(URI.file(path))]), [
			['/repo/AGENTS.md', { kind: 'agentsMd', ecosystem: 'agents' }],
			['/repo/packages/api/agents.md', { kind: 'agentsMd', ecosystem: 'agents' }],
			['/home/me/.codex/AGENTS.md', { kind: 'agentsMd', ecosystem: 'codex' }],
			['/repo/CLAUDE.md', { kind: 'claudeMd', ecosystem: 'claude' }],
			['/repo/CLAUDE.local.md', { kind: 'claudeMd', ecosystem: 'claude' }],
			['/repo/claude.md', undefined],
			['/repo/GEMINI.md', { kind: 'geminiMd', ecosystem: 'gemini' }],
			['/repo/.cursorrules', { kind: 'rule', ecosystem: 'cursor' }],
			['/repo/.github/copilot-instructions.md', { kind: 'instructions', ecosystem: 'github' }],
			['/repo/.github/instructions/ts.instructions.md', { kind: 'instructions', ecosystem: 'github' }],
			['/repo/.claude/rules/testing.md', { kind: 'instructions', ecosystem: 'claude' }],
			['/repo/.github/prompts/review.prompt.md', { kind: 'prompt', ecosystem: 'github' }],
			['/home/me/.codex/prompts/fix.md', { kind: 'prompt', ecosystem: 'codex' }],
			['/repo/.github/agents/reviewer.md', { kind: 'agent', ecosystem: 'github' }],
			['/repo/.claude/agents/reviewer.md', { kind: 'agent', ecosystem: 'claude' }],
			['/repo/.github/skills/pdf/SKILL.md', { kind: 'skill', ecosystem: 'github' }],
			['/home/me/.copilot/skills/pdf/SKILL.md', { kind: 'skill', ecosystem: 'copilot' }],
			['/home/me/.agents/skills/pdf/SKILL.md', { kind: 'skill', ecosystem: 'agents' }],
			['/repo/.claude/skills/pdf/SKILL.md', { kind: 'skill', ecosystem: 'claude' }],
			['/repo/.claude/commands/git/commit.md', { kind: 'command', ecosystem: 'claude' }],
			['/repo/.cursor/rules/style.mdc', { kind: 'rule', ecosystem: 'cursor' }],
			['/repo/.github/hooks/format.json', { kind: 'hook', ecosystem: 'github' }],
			['/repo/.claude/settings.json', { kind: 'agentSettings', ecosystem: 'claude' }],
			['/home/me/.codex/config.toml', { kind: 'agentSettings', ecosystem: 'codex' }],
			['/repo/.vscode/mcp.json', { kind: 'mcpConfig', ecosystem: 'vscode' }],
			['/repo/.mcp.json', { kind: 'mcpConfig', ecosystem: 'other' }],
			['/repo/README.md', undefined],
			['/repo/docs/plan.md', undefined],
			['/repo/.claude/agents/README.md', undefined],
			['/repo/.github/workflows/ci.json', undefined],
			['/repo/package.json', undefined],
		]);
	});

	test('reports workspace, user or other scope', () => {
		const userHome = URI.file('/Users/Alice');
		assert.deepStrictEqual([
			getCustomizationFileScope(URI.file('/Users/Alice/repo/AGENTS.md'), true, userHome, extUri),
			getCustomizationFileScope(URI.file('/Users/Alice/.claude/CLAUDE.md'), false, userHome, extUri),
			getCustomizationFileScope(URI.file('/Users/alice/.claude/CLAUDE.md'), false, userHome, extUriIgnorePathCase),
			getCustomizationFileScope(URI.from({ scheme: 'vscode-userdata', path: '/User/prompts/a.prompt.md' }), false, userHome, extUri),
			getCustomizationFileScope(URI.file('/tmp/AGENTS.md'), false, userHome, extUri),
		], ['workspace', 'user', 'user', 'user', 'other']);
	});
});
