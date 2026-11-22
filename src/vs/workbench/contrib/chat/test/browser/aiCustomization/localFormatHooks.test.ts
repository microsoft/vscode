/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../../../../platform/agentPlugins/common/pluginParsers.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { markLocalFormatHookItems, resolveHookCommandFiles } from '../../../browser/aiCustomization/localFormatHooks.js';
import { AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { IAgentPlugin } from '../../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('Local-format hook marking', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const localFile = JSON.stringify({ hooks: { PreToolUse: [{ type: 'command', command: 'node guard.mjs' }] } });
	const copilotFile = JSON.stringify({ version: 1, hooks: { preToolUse: [{ type: 'command', bash: 'node guard.mjs' }] } });

	function plugin(path: string, format: PluginFormat, label: string): IAgentPlugin {
		return { uri: URI.from({ scheme: Schemas.inMemory, path }), format, label, hooks: constObservable([]) } as Partial<IAgentPlugin> as IAgentPlugin;
	}

	test('marks own Local-format hook files and Copilot-format plugins only', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const files: Record<string, string> = {
			'/repo/.github/hooks/local.json': localFile,
			'/repo/.github/hooks/copilot.json': copilotFile,
			'/repo/.github/hooks/broken.json': localFile,
			'/plugins/copilot-plugin/hooks.json': localFile,
			'/plugins/claude-plugin/hooks/hooks.json': localFile,
			'/plugins/unknown-plugin/hooks.json': localFile,
			'/policy/policy.json': localFile,
		};
		for (const [path, content] of Object.entries(files)) {
			await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path }), VSBuffer.fromString(content));
		}
		interface ITestItem { readonly uri: URI; readonly promptType: PromptsType; readonly source: AICustomizationSource; readonly name: string; readonly status?: 'error' | 'degraded'; readonly statusMessage?: string; readonly organizationControl?: object; readonly localFormatHook?: boolean }
		const item = (path: string, source: AICustomizationSource = AICustomizationSources.local, extra: Partial<ITestItem> = {}): ITestItem => ({
			uri: URI.from({ scheme: Schemas.inMemory, path }),
			promptType: PromptsType.hook,
			source,
			name: path,
			...extra,
		});
		const items = [
			item('/repo/.github/hooks/local.json'),
			item('/repo/.github/hooks/copilot.json'),
			item('/repo/.github/hooks/broken.json', AICustomizationSources.local, { status: 'error', statusMessage: 'Failed to load' }),
			item('/plugins/copilot-plugin/hooks.json', AICustomizationSources.plugin),
			item('/plugins/claude-plugin/hooks/hooks.json', AICustomizationSources.plugin),
			item('/plugins/unknown-plugin/hooks.json', AICustomizationSources.plugin),
			item('/policy/policy.json', AICustomizationSources.user, { organizationControl: { requiredEnabled: true } }),
			{ ...item('/repo/.github/hooks/local.json'), promptType: PromptsType.agent },
		];
		const plugins = [plugin('/plugins/copilot-plugin', PluginFormat.Copilot, 'Guards'), plugin('/plugins/claude-plugin', PluginFormat.Claude, 'Claude Guards')];

		const marked = await markLocalFormatHookItems(items, plugins, fileService);

		assert.deepStrictEqual(marked.map(i => [i.name, i.promptType, i.status, i.localFormatHook, i.statusMessage]), [
			['/repo/.github/hooks/local.json', PromptsType.hook, 'degraded', true, 'This hook file uses the deprecated Local hook format and may not work in Copilot sessions. Migrate it with the agent from Migrations in a local Copilot session.'],
			['/repo/.github/hooks/copilot.json', PromptsType.hook, undefined, undefined, undefined],
			['/repo/.github/hooks/broken.json', PromptsType.hook, 'error', undefined, 'Failed to load'],
			['/plugins/copilot-plugin/hooks.json', PromptsType.hook, 'degraded', true, 'The hooks in the Guards plugin use the deprecated Local hook format and may not work in Copilot sessions. Contact the plugin\'s publisher.'],
			['/plugins/claude-plugin/hooks/hooks.json', PromptsType.hook, undefined, undefined, undefined],
			['/plugins/unknown-plugin/hooks.json', PromptsType.hook, undefined, undefined, undefined],
			['/policy/policy.json', PromptsType.hook, undefined, undefined, undefined],
			['/repo/.github/hooks/local.json', PromptsType.agent, undefined, undefined, undefined],
		]);
	});

	test('finds the scripts named in hook commands for backup', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const root = URI.from({ scheme: Schemas.inMemory, path: '/repo' });
		const write = (path: string, content: string) => fileService.writeFile(URI.joinPath(root, path), VSBuffer.fromString(content));
		await write('.github/hooks/guard.json', JSON.stringify({
			hooks: {
				PreToolUse: [{
					matcher: 'run_in_terminal',
					hooks: [{ type: 'command', osx: 'bash hooks/guard.sh --strict', windows: 'powershell -File hooks\\guard.ps1', env: { POLICY_FILE: 'hooks/paths.txt' } }],
				}],
				PostToolUse: [{ type: 'command', command: 'python3 lint_hook.py "$HOME/x.py"', cwd: 'tools/hooks' }],
				Stop: [{ type: 'command', command: 'node /usr/bin/outside.js && node missing.mjs' }],
				SessionStart: [{ type: 'command', command: 'bash ~/hooks/start.sh && bash "$HOME/hooks/also.sh"' }],
				// An event VS Code does not run, and a native name next to its capitalised alias.
				Notification: [{ type: 'command', command: 'bash hooks/notify.sh' }],
				preToolUse: [{ type: 'command', bash: 'bash hooks/native.sh' }],
			},
		}));
		await write('hooks/guard.sh', 'exit 0');
		await write('hooks/guard.ps1', 'exit 0');
		await write('hooks/notify.sh', 'exit 0');
		await write('hooks/native.sh', 'exit 0');
		await write('hooks/paths.txt', 'secrets/*');
		await write('tools/hooks/lint_hook.py', 'pass');
		await write('home/hooks/start.sh', 'exit 0');
		await write('home/hooks/also.sh', 'exit 0');

		const files = await resolveHookCommandFiles(URI.joinPath(root, '.github/hooks/guard.json'), root, '/repo/home', fileService);

		assert.deepStrictEqual(files.map(uri => uri.path).sort(), ['/repo/home/hooks/also.sh', '/repo/home/hooks/start.sh', '/repo/hooks/guard.ps1', '/repo/hooks/guard.sh', '/repo/hooks/native.sh', '/repo/hooks/notify.sh', '/repo/tools/hooks/lint_hook.py']);
	});
});
