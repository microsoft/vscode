/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotSkillTelemetry } from '../../node/copilot/copilotSkillTelemetry.js';

suite('Copilot skill telemetry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const appRoot = URI.file('/Applications/Code.app/Contents/Resources/app');
	const runtimePlugin = URI.joinPath(appRoot, 'node_modules.asar.unpacked/@github/copilot-sdk-darwin-arm64/plugins/browser-use');
	const syncedPlugin = URI.file('/Users/me/Library/Application Support/Code/agentPlugins/synced/1');
	const classify = (name: string, path: string | undefined, source: string | undefined) => getCopilotSkillTelemetry({ name, path, source }, [runtimePlugin]);

	test('names only skills the bundled runtime or the host ship', () => {
		assert.deepStrictEqual([
			classify('pr-stack', '/runtime/builtin/pr-stack/SKILL.md', 'builtin'),
			classify('doctor', URI.joinPath(runtimePlugin, 'skills/doctor/SKILL.md').fsPath, 'plugin'),
			classify('troubleshoot', 'troubleshoot', 'sdk'),
		], [
			{ skillSource: 'builtin', skillOrigin: 'runtime', skillName: 'pr-stack' },
			{ skillSource: 'plugin', skillOrigin: 'runtime', skillName: 'doctor' },
			{ skillSource: 'sdk', skillOrigin: 'vscode', skillName: 'troubleshoot' },
		]);
	});

	test('does not name any other skill, even when it shares a built-in name or sits in the product', () => {
		assert.deepStrictEqual([
			classify('commit', '/Users/me/.copilot/skills/commit/SKILL.md', 'personal-copilot'),
			classify('my-skill', '/repo/.github/skills/my-skill/SKILL.md', 'project'),
			classify('other-sdk-skill', 'other-sdk-skill', 'sdk'),
			classify('relative', 'skills/relative/SKILL.md', 'custom'),
			classify('commit', URI.joinPath(syncedPlugin, 'skills/commit/SKILL.md').fsPath, 'plugin'),
			classify('create-pr', URI.joinPath(appRoot, 'out/vs/sessions/skills/create-pr/SKILL.md').fsPath, 'custom'),
			classify('private-project', URI.joinPath(runtimePlugin, '.github/skills/private-project/SKILL.md').fsPath, 'project'),
			classify('mcp-skill', '', 'mcp'),
		], [
			{ skillSource: 'personal-copilot', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'project', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'sdk', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'custom', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'plugin', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'custom', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'project', skillOrigin: 'other', skillName: undefined },
			{ skillSource: 'mcp', skillOrigin: 'other', skillName: undefined },
		]);
	});

	test('bounds the reported source', () => {
		assert.deepStrictEqual([
			classify('a', undefined, undefined).skillSource,
			classify('b', undefined, 'something-new').skillSource,
		], ['unknown', 'other']);
	});
});
