/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { formatStatusOutput, IFileStatusInfo, IPathInfo, ITypeStatusInfo } from '../../../browser/actions/chatConfigInfoSlashCommand.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

suite('formatStatusOutput', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const emptySpecialFiles = {
		agentsMd: { enabled: false, files: [] },
		copilotInstructions: { enabled: false, files: [] }
	};

	function createPath(displayPath: string, exists: boolean, storage: PromptsStorage = PromptsStorage.local, isDefault = true): IPathInfo {
		return {
			uri: URI.file(`/workspace/${displayPath.replace(/^~\//, 'home/')}`),
			exists,
			storage,
			scanOrder: 1,
			displayPath,
			isDefault
		};
	}

	function createFile(name: string, status: 'loaded' | 'skipped' | 'overwritten', parentPath: string, storage: PromptsStorage = PromptsStorage.local, options?: { reason?: string; extensionId?: string; overwrittenBy?: string }): IFileStatusInfo {
		return {
			uri: URI.file(`/workspace/${parentPath}/${name}`),
			status,
			name,
			storage,
			reason: options?.reason,
			extensionId: options?.extensionId,
			overwrittenBy: options?.overwrittenBy
		};
	}

	/**
	 * Strips the timestamp line from output to make assertions stable.
	 */
	function stripTimestamp(output: string): string {
		return output.replace(/\*Generated at [^*]+\*\n/, '*Generated at <timestamp>*\n');
	}

	/**
	 * Builds expected output from lines array to avoid hygiene issues with template literal indentation.
	 */
	function lines(...parts: string[]): string {
		return parts.join('\n');
	}

	// Tree prefixes
	// allow-any-unicode-next-line
	const TREE_BRANCH = '  ├─';
	// allow-any-unicode-next-line
	const TREE_END = '  └─';
	// allow-any-unicode-next-line
	const ICON_ERROR = '❌';
	// allow-any-unicode-next-line
	const ICON_WARN = '⚠️';

	test('agents with loaded files', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.agent,
			paths: [createPath('.github/agents', true)],
			files: [
				createFile('code-reviewer.agent.md', 'loaded', '.github/agents'),
				createFile('test-helper.agent.md', 'loaded', '.github/agents')
			],
			enabled: true
		}];

		const output = stripTimestamp(formatStatusOutput(statusInfos, emptySpecialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Custom Agents**',
			'*2 files loaded*',
			'',
			'- .github/agents',
			`${TREE_BRANCH} [\`code-reviewer.agent.md\`](file:///workspace/.github/agents/code-reviewer.agent.md)`,
			`${TREE_END} [\`test-helper.agent.md\`](file:///workspace/.github/agents/test-helper.agent.md)`,
			'- AGENTS.md -',
			''
		));
	});

	test('agents with loaded and skipped files', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.agent,
			paths: [createPath('.github/agents', true)],
			files: [
				createFile('good-agent.agent.md', 'loaded', '.github/agents'),
				createFile('broken-agent.agent.md', 'skipped', '.github/agents', PromptsStorage.local, { reason: 'Missing name attribute' })
			],
			enabled: true
		}];

		const output = stripTimestamp(formatStatusOutput(statusInfos, emptySpecialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Custom Agents**',
			'*1 files loaded, 1 skipped*',
			'',
			'- .github/agents',
			`${TREE_BRANCH} [\`good-agent.agent.md\`](file:///workspace/.github/agents/good-agent.agent.md)`,
			`${TREE_END} ${ICON_ERROR} [\`broken-agent.agent.md\`](file:///workspace/.github/agents/broken-agent.agent.md) - *Missing name attribute*`,
			'- AGENTS.md -',
			''
		));
	});

	test('agents with overwritten files', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.agent,
			paths: [
				createPath('.github/agents', true),
				createPath('~/.copilot/agents', true, PromptsStorage.user)
			],
			files: [
				createFile('my-agent.agent.md', 'loaded', '.github/agents'),
				createFile('my-agent.agent.md', 'overwritten', 'home/.copilot/agents', PromptsStorage.user, { overwrittenBy: 'my-agent.agent.md' })
			],
			enabled: true
		}];

		const output = stripTimestamp(formatStatusOutput(statusInfos, emptySpecialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Custom Agents**',
			'*1 files loaded, 1 skipped*',
			'',
			'- .github/agents',
			`${TREE_END} [\`my-agent.agent.md\`](file:///workspace/.github/agents/my-agent.agent.md)`,
			'- ~/.copilot/agents',
			`${TREE_END} ${ICON_WARN} [\`my-agent.agent.md\`](file:///workspace/home/.copilot/agents/my-agent.agent.md) - *Overwritten by higher priority file*`,
			'- AGENTS.md -',
			''
		));
	});

	test('disabled skills shows setting hint', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.skill,
			paths: [],
			files: [],
			enabled: false
		}];

		const output = stripTimestamp(formatStatusOutput(statusInfos, emptySpecialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Skills**',
			'*Skills are disabled. Enable them by setting `chat.useAgentSkills` to `true` in your settings.*',
			''
		));
	});

	test('skills with loaded files uses "skills loaded"', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.skill,
			paths: [createPath('.github/skills', true)],
			files: [
				createFile('search', 'loaded', '.github/skills'),
				createFile('refactor', 'loaded', '.github/skills')
			],
			enabled: true
		}];

		const output = stripTimestamp(formatStatusOutput(statusInfos, emptySpecialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Skills**',
			'*2 skills loaded*',
			'',
			'- .github/skills',
			`${TREE_BRANCH} [\`search\`](file:///workspace/.github/skills/search)`,
			`${TREE_END} [\`refactor\`](file:///workspace/.github/skills/refactor)`,
			''
		));
	});

	test('instructions with copilot-instructions.md enabled', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.instructions,
			paths: [createPath('.github/instructions', true)],
			files: [
				createFile('testing.instructions.md', 'loaded', '.github/instructions')
			],
			enabled: true
		}];

		const specialFiles = {
			agentsMd: { enabled: false, files: [] },
			copilotInstructions: { enabled: true, files: [URI.file('/workspace/.github/copilot-instructions.md')] }
		};

		const output = stripTimestamp(formatStatusOutput(statusInfos, specialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Instructions**',
			'*2 files loaded*',
			'',
			'- .github/instructions',
			`${TREE_END} [\`testing.instructions.md\`](file:///workspace/.github/instructions/testing.instructions.md)`,
			'- copilot-instructions.md',
			`${TREE_END} [\`copilot-instructions.md\`](file:///workspace/.github/copilot-instructions.md)`,
			''
		));
	});

	test('agents with AGENTS.md enabled', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.agent,
			paths: [createPath('.github/agents', true)],
			files: [],
			enabled: true
		}];

		const specialFiles = {
			agentsMd: { enabled: true, files: [URI.file('/workspace/AGENTS.md'), URI.file('/workspace/docs/AGENTS.md')] },
			copilotInstructions: { enabled: false, files: [] }
		};

		const output = stripTimestamp(formatStatusOutput(statusInfos, specialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Custom Agents**',
			'*2 files loaded*',
			'',
			'- .github/agents',
			'- AGENTS.md',
			`${TREE_BRANCH} [\`AGENTS.md\`](file:///workspace/AGENTS.md)`,
			`${TREE_END} [\`AGENTS.md\`](file:///workspace/docs/AGENTS.md)`,
			''
		));
	});

	test('custom folder that does not exist shows error', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.agent,
			paths: [
				createPath('.github/agents', true),
				createPath('custom/agents', false, PromptsStorage.local, false)
			],
			files: [],
			enabled: true
		}];

		const output = stripTimestamp(formatStatusOutput(statusInfos, emptySpecialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Custom Agents**',
			'',
			'- .github/agents',
			`- ${ICON_ERROR} custom/agents - *Folder does not exist*`,
			'- AGENTS.md -',
			''
		));
	});

	test('default folder that does not exist shows no error', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.agent,
			paths: [
				createPath('.github/agents', false, PromptsStorage.local, true)
			],
			files: [],
			enabled: true
		}];

		const output = stripTimestamp(formatStatusOutput(statusInfos, emptySpecialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Custom Agents**',
			'',
			'- .github/agents',
			'- AGENTS.md -',
			''
		));
	});

	test('extension files grouped separately', () => {
		const extFile = createFile('ext-agent.agent.md', 'loaded', 'extensions/my-publisher.my-extension/agents', PromptsStorage.extension, { extensionId: 'my-publisher.my-extension' });

		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.agent,
			paths: [createPath('.github/agents', true)],
			files: [
				createFile('local-agent.agent.md', 'loaded', '.github/agents'),
				extFile
			],
			enabled: true
		}];

		const output = stripTimestamp(formatStatusOutput(statusInfos, emptySpecialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Custom Agents**',
			'*2 files loaded*',
			'',
			'- .github/agents',
			`${TREE_END} [\`local-agent.agent.md\`](file:///workspace/.github/agents/local-agent.agent.md)`,
			'- Extension: my-publisher.my-extension',
			`${TREE_END} [\`ext-agent.agent.md\`](file:///workspace/extensions/my-publisher.my-extension/agents/ext-agent.agent.md)`,
			'- AGENTS.md -',
			''
		));
	});

	test('prompts with no files shows message', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.prompt,
			paths: [],
			files: [],
			enabled: true
		}];

		const output = stripTimestamp(formatStatusOutput(statusInfos, emptySpecialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Prompt Files**',
			'',
			'*No files loaded*',
			''
		));
	});

	test('full output with all four types', () => {
		const statusInfos: ITypeStatusInfo[] = [
			{
				type: PromptsType.agent,
				paths: [createPath('.github/agents', true)],
				files: [createFile('helper.agent.md', 'loaded', '.github/agents')],
				enabled: true
			},
			{
				type: PromptsType.instructions,
				paths: [createPath('.github/instructions', true)],
				files: [createFile('code-style.instructions.md', 'loaded', '.github/instructions')],
				enabled: true
			},
			{
				type: PromptsType.prompt,
				paths: [createPath('.github/prompts', true)],
				files: [createFile('fix-bug.prompt.md', 'loaded', '.github/prompts')],
				enabled: true
			},
			{
				type: PromptsType.skill,
				paths: [createPath('.github/skills', true)],
				files: [createFile('search', 'loaded', '.github/skills')],
				enabled: true
			}
		];

		const output = stripTimestamp(formatStatusOutput(statusInfos, emptySpecialFiles));

		assert.strictEqual(output, lines(
			'## Chat Configuration',
			'*Generated at <timestamp>*',
			'',
			'**Custom Agents**',
			'*1 files loaded*',
			'',
			'- .github/agents',
			`${TREE_END} [\`helper.agent.md\`](file:///workspace/.github/agents/helper.agent.md)`,
			'- AGENTS.md -',
			'',
			'**Instructions**',
			'*1 files loaded*',
			'',
			'- .github/instructions',
			`${TREE_END} [\`code-style.instructions.md\`](file:///workspace/.github/instructions/code-style.instructions.md)`,
			'- copilot-instructions.md -',
			'',
			'**Prompt Files**',
			'*1 files loaded*',
			'',
			'- .github/prompts',
			`${TREE_END} [\`fix-bug.prompt.md\`](file:///workspace/.github/prompts/fix-bug.prompt.md)`,
			'',
			'**Skills**',
			'*1 skills loaded*',
			'',
			'- .github/skills',
			`${TREE_END} [\`search\`](file:///workspace/.github/skills/search)`,
			''
		));
	});
});
