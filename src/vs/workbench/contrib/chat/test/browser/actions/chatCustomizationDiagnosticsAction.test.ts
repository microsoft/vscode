/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { formatStatusOutput, IFileStatusInfo, IPathInfo, ITypeStatusInfo } from '../../../browser/actions/chatCustomizationDiagnosticsAction.js';
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
	 * Returns the fsPath of a file URI for use in test expectations.
	 * Normalizes to forward slashes for cross-platform consistency in markdown links.
	 */
	function filePath(relativePath: string): string {
		return URI.file(`/workspace/${relativePath}`).fsPath.replace(/\\/g, '/');
	}

	/**
	 * Builds expected output from lines array to avoid hygiene issues with template literal indentation.
	 */
	function lines(...parts: string[]): string {
		return parts.join('\n');
	}

	// Tree prefixes
	// allow-any-unicode-next-line
	const TREE_BRANCH = '├─';
	// allow-any-unicode-next-line
	const TREE_END = '└─';
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

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Custom Agents**<br>',
			'*2 files loaded*',
			'',
			'.github/agents<br>',
			`${TREE_BRANCH} [\`code-reviewer.agent.md\`](${filePath('.github/agents/code-reviewer.agent.md')})<br>`,
			`${TREE_END} [\`test-helper.agent.md\`](${filePath('.github/agents/test-helper.agent.md')})<br>`,
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

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Custom Agents**<br>',
			'*1 file loaded, 1 skipped*',
			'',
			'.github/agents<br>',
			`${TREE_BRANCH} [\`good-agent.agent.md\`](${filePath('.github/agents/good-agent.agent.md')})<br>`,
			`${TREE_END} ${ICON_ERROR} [\`broken-agent.agent.md\`](${filePath('.github/agents/broken-agent.agent.md')}) - *Missing name attribute*<br>`,
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

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Custom Agents**<br>',
			'*1 file loaded, 1 skipped*',
			'',
			'.github/agents<br>',
			`${TREE_END} [\`my-agent.agent.md\`](${filePath('.github/agents/my-agent.agent.md')})<br>`,
			'~/.copilot/agents<br>',
			`${TREE_END} ${ICON_WARN} [\`my-agent.agent.md\`](${filePath('home/.copilot/agents/my-agent.agent.md')}) - *Overwritten by higher priority file*<br>`,
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

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
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

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Skills**<br>',
			'*2 skills loaded*',
			'',
			'.github/skills<br>',
			`${TREE_BRANCH} [\`search\`](${filePath('.github/skills/search')})<br>`,
			`${TREE_END} [\`refactor\`](${filePath('.github/skills/refactor')})<br>`,
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

		const output = formatStatusOutput(statusInfos, specialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Instructions**<br>',
			'*2 files loaded*',
			'',
			'.github/instructions<br>',
			`${TREE_END} [\`testing.instructions.md\`](${filePath('.github/instructions/testing.instructions.md')})<br>`,
			'AGENTS.md -<br>',
			'copilot-instructions.md<br>',
			`${TREE_END} [\`copilot-instructions.md\`](${filePath('.github/copilot-instructions.md')})<br>`,
			''
		));
	});

	test('instructions with AGENTS.md enabled', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.instructions,
			paths: [createPath('.github/instructions', true)],
			files: [],
			enabled: true
		}];

		const specialFiles = {
			agentsMd: { enabled: true, files: [URI.file('/workspace/AGENTS.md'), URI.file('/workspace/docs/AGENTS.md')] },
			copilotInstructions: { enabled: false, files: [] }
		};

		const output = formatStatusOutput(statusInfos, specialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Instructions**<br>',
			'*2 files loaded*',
			'',
			'.github/instructions<br>',
			'AGENTS.md<br>',
			`${TREE_BRANCH} [\`AGENTS.md\`](${filePath('AGENTS.md')})<br>`,
			`${TREE_END} [\`AGENTS.md\`](${filePath('docs/AGENTS.md')})<br>`,
			'copilot-instructions.md -<br>',
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

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Custom Agents**<br>',
			'',
			'.github/agents<br>',
			`${ICON_ERROR} custom/agents - *Folder does not exist*<br>`,
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

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Custom Agents**<br>',
			'',
			'.github/agents<br>',
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

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Custom Agents**<br>',
			'*2 files loaded*',
			'',
			'.github/agents<br>',
			`${TREE_END} [\`local-agent.agent.md\`](${filePath('.github/agents/local-agent.agent.md')})<br>`,
			'Extension: my-publisher.my-extension<br>',
			`${TREE_END} [\`ext-agent.agent.md\`](${filePath('extensions/my-publisher.my-extension/agents/ext-agent.agent.md')})<br>`,
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

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Prompt Files**<br>',
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

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		assert.strictEqual(output, lines(
			'## Chat Customization Diagnostics',
			'*WARNING: This file may contain sensitive information.*',
			'',
			'**Custom Agents**<br>',
			'*1 file loaded*',
			'',
			'.github/agents<br>',
			`${TREE_END} [\`helper.agent.md\`](${filePath('.github/agents/helper.agent.md')})<br>`,
			'',
			'**Instructions**<br>',
			'*1 file loaded*',
			'',
			'.github/instructions<br>',
			`${TREE_END} [\`code-style.instructions.md\`](${filePath('.github/instructions/code-style.instructions.md')})<br>`,
			'AGENTS.md -<br>',
			'copilot-instructions.md -<br>',
			'',
			'**Prompt Files**<br>',
			'*1 file loaded*',
			'',
			'.github/prompts<br>',
			`${TREE_END} [\`fix-bug.prompt.md\`](${filePath('.github/prompts/fix-bug.prompt.md')})<br>`,
			'',
			'**Skills**<br>',
			'*1 skill loaded*',
			'',
			'.github/skills<br>',
			`${TREE_END} [\`search\`](${filePath('.github/skills/search')})<br>`,
			''
		));
	});

	test('paths with spaces are URL encoded in markdown links', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.agent,
			paths: [{
				uri: URI.file('/workspace/my folder/agents'),
				exists: true,
				storage: PromptsStorage.local,
				scanOrder: 1,
				displayPath: 'my folder/agents',
				isDefault: false
			}],
			files: [{
				uri: URI.file('/workspace/my folder/agents/my agent.agent.md'),
				status: 'loaded',
				name: 'my agent.agent.md',
				storage: PromptsStorage.local
			}],
			enabled: true
		}];

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		// Verify that spaces in paths are URL encoded (%20)
		assert.ok(output.includes('my%20folder/agents/my%20agent.agent.md'), 'Path should have URL-encoded spaces');
		assert.ok(output.includes('[`my agent.agent.md`]'), 'Display name should not be encoded');
	});

	test('paths with special characters are URL encoded in markdown links', () => {
		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.prompt,
			paths: [{
				uri: URI.file('/workspace/docs & notes/prompts'),
				exists: true,
				storage: PromptsStorage.local,
				scanOrder: 1,
				displayPath: 'docs & notes/prompts',
				isDefault: false
			}],
			files: [{
				uri: URI.file('/workspace/docs & notes/prompts/test[1].prompt.md'),
				status: 'loaded',
				name: 'test[1].prompt.md',
				storage: PromptsStorage.local
			}],
			enabled: true
		}];

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, []);

		// Verify that special characters in paths are URL encoded
		assert.ok(output.includes('docs%20%26%20notes'), 'Ampersand should be URL-encoded');
		assert.ok(output.includes('test%5B1%5D.prompt.md'), 'Brackets should be URL-encoded');
	});

	test('vscode-userdata scheme URIs are converted to file scheme for relative paths', () => {
		// Create a workspace folder
		const workspaceFolderUri = URI.file('/Users/test/workspace');
		const workspaceFolder = {
			uri: workspaceFolderUri,
			name: 'workspace',
			index: 0,
			toResource: (relativePath: string) => URI.joinPath(workspaceFolderUri, relativePath)
		};

		// Create a vscode-userdata URI that maps to a path under the workspace
		const userDataUri = URI.file('/Users/test/workspace/.github/agents/my-agent.agent.md').with({ scheme: Schemas.vscodeUserData });

		const statusInfos: ITypeStatusInfo[] = [{
			type: PromptsType.agent,
			paths: [{
				uri: URI.file('/Users/test/workspace/.github/agents'),
				exists: true,
				storage: PromptsStorage.local,
				scanOrder: 1,
				displayPath: '.github/agents',
				isDefault: true
			}],
			files: [{
				uri: userDataUri,
				status: 'loaded',
				name: 'my-agent.agent.md',
				storage: PromptsStorage.local
			}],
			enabled: true
		}];

		const output = formatStatusOutput(statusInfos, emptySpecialFiles, [workspaceFolder]);

		// The vscode-userdata URI should be converted to file scheme internally,
		// allowing relative path computation against workspace folders
		assert.ok(output.includes('.github/agents/my-agent.agent.md'), 'Should use relative path from workspace folder');
		// Should not contain the full absolute path
		assert.ok(!output.includes('/Users/test/workspace/.github'), 'Should not contain absolute path when relative path is available');
	});
});
