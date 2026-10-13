/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { renderCopilotSlashCommandOutput, type CopilotSlashCommandOutput, type ICopilotSlashCommandHandler, type RuntimeSlashCommandInfo } from '../../node/copilot/copilotSlashCommand.js';
import { CopilotSlashCommandProvider } from '../../node/copilot/copilotSlashCommandProvider.js';
import { getCopilotCustomizationCommandHandler, invokeCopilotPluginCommand, type ICopilotPluginCommandApi } from '../../node/copilot/copilotCustomizationCommandDisplay.js';

function pluginApi(calls: string[]): ICopilotPluginCommandApi {
	return {
		list: async () => {
			calls.push('list');
			return { plugins: [{ name: 'document-skills', marketplace: 'anthropic', version: '1.2.3', enabled: true }] };
		},
		install: async ({ source }) => {
			calls.push(`install:${source}`);
			return {
				plugin: { name: 'document-skills', marketplace: 'anthropic', version: '1.2.3', enabled: true },
				skillsInstalled: 2,
				postInstallMessage: 'Use /document-skills to invoke the plugin.',
			};
		},
		uninstall: async ({ name }) => {
			calls.push(`uninstall:${name}`);
		},
		update: async ({ name }) => {
			calls.push(`update:${name}`);
			return { previousVersion: '1.2.3', newVersion: '1.2.4', skillsInstalled: 2 };
		},
		enable: async ({ names }) => {
			calls.push(`enable:${names.join(',')}`);
		},
		disable: async ({ names }) => {
			calls.push(`disable:${names.join(',')}`);
		},
		reload: async () => {
			calls.push('reload');
		},
		marketplaces: {
			add: async ({ source }) => {
				calls.push(`marketplace.add:${source}`);
				return { name: 'anthropic-agent-skills' };
			},
			remove: async ({ name, force }) => {
				calls.push(`marketplace.remove:${name}:${force === true}`);
				return { removed: true };
			},
			list: async () => {
				calls.push('marketplace.list');
				return {
					marketplaces: [
						{ name: 'copilot-plugins', source: 'GitHub: github/copilot-plugins', isDefault: true },
						{ name: 'anthropic-agent-skills', source: 'GitHub: anthropics/skills', managed: true, available: false },
					]
				};
			},
			browse: async ({ name }) => {
				calls.push(`marketplace.browse:${name}`);
				return { plugins: [{ name: 'document-skills', description: 'Document tools' }] };
			},
			refresh: async params => {
				calls.push(`marketplace.refresh:${params?.name ?? ''}`);
				return { results: [{ name: 'anthropic-agent-skills', success: true }] };
			},
		},
	};
}

suite('Copilot slash command output', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const cases: { name: string; output: CopilotSlashCommandOutput; expected: string }[] = [
		{
			name: 'escapes text when markdown is omitted',
			output: { kind: 'text', text: '*report*' },
			expected: '\\*report\\*',
		},
		{
			name: 'escapes explicitly plain text',
			output: { kind: 'text', text: '*report*', markdown: false },
			expected: '\\*report\\*',
		},
		{
			name: 'preserves explicitly marked Markdown',
			output: { kind: 'text', text: '*report*', markdown: true },
			expected: '*report*',
		},
		{
			name: 'renders a link without opting into preview',
			output: { kind: 'link', resource: URI.parse('file:///diagnostics/report.md'), label: 'Open Report' },
			expected: '[Open Report](file:///diagnostics/report.md)',
		},
		{
			name: 'does not request preview when explicitly disabled',
			output: { kind: 'link', resource: URI.parse('file:///diagnostics/report.md'), label: 'Open Report', preview: false },
			expected: '[Open Report](file:///diagnostics/report.md)',
		},
		{
			name: 'renders a Markdown preview link',
			output: { kind: 'link', resource: URI.parse('file:///diagnostics/report.md'), label: 'Open Report', preview: true },
			expected: '[Open Report](file:///diagnostics/report.md?vscodeLinkType%3Dmarkdown-preview)',
		},
		{
			name: 'preserves query and fragment when requesting preview',
			output: { kind: 'link', resource: URI.parse('file:///diagnostics/report.md?view=full#section'), label: 'Open Report', preview: true },
			expected: '[Open Report](file:///diagnostics/report.md?view%3Dfull%26vscodeLinkType%3Dmarkdown-preview#section)',
		},
		{
			name: 'escapes the link label',
			output: { kind: 'link', resource: URI.parse('file:///diagnostics/report.md'), label: 'Open [Report]' },
			expected: '[Open [Report\\]](file:///diagnostics/report.md)',
		},
	];

	for (const { name, output, expected } of cases) {
		test(name, () => {
			assert.strictEqual(renderCopilotSlashCommandOutput(output), expected);
		});
	}
});

suite('Copilot slash command handlers', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const command: RuntimeSlashCommandInfo = {
		name: 'diagnostic',
		aliases: ['diag'],
		kind: 'builtin',
		description: 'Show diagnostics',
		allowDuringAgentExecution: true,
	};

	test('preserves SDK commands when handler lookup is omitted', async () => {
		const provider = new CopilotSlashCommandProvider(async () => [command], undefined, store.add(new NullLogService()));

		assert.deepStrictEqual({
			byName: await provider.resolveSlashCommand('diagnostic'),
			byAlias: await provider.resolveSlashCommand('/DIAG'),
			missing: await provider.resolveSlashCommand('missing'),
		}, {
			byName: command,
			byAlias: command,
			missing: undefined,
		});
	});

	suite('Copilot skills display', () => {
		const command: RuntimeSlashCommandInfo = {
			name: 'skills',
			kind: 'builtin',
			description: 'Manage skills',
			allowDuringAgentExecution: false,
		};

		test('formats the plain runtime list as compact Markdown', async () => {
			const provider = new CopilotSlashCommandProvider(async () => [command], {
				getCommandHandler: getCopilotCustomizationCommandHandler,
			}, store.add(new NullLogService()));
			const resolved = await provider.resolveSlashCommand('skills');
			const output = await resolved?.getOutput?.('', {
				kind: 'text',
				text: [
					'Available Skills',
					'',
					'Project *skills*:',
					'  - accessibility',
					'    Improve [accessibility](command:unsafe).',
					'  - disabled-skill (disabled)',
					'    Disabled description.',
					'',
					'Found 2 skills.',
				].join('\n'),
			});

			assert.deepStrictEqual(output, {
				kind: 'text',
				text: [
					'# Available skills',
					'',
					'## Project \\*skills\\*',
					'',
					'- `accessibility` — Improve \\[accessibility\\]\\(command:unsafe\\).',
					'- `disabled-skill` (disabled) — Disabled description.',
					'',
					'2 skills found.',
				].join('\n'),
				markdown: true,
			});
		});

		test('defers to the runtime for other responses and changed list formats', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			assert.deepStrictEqual([
				await handler?.getOutput?.('info accessibility', { kind: 'text', text: 'Skill: accessibility' }),
				await handler?.getOutput?.('reload', { kind: 'text', text: 'Skills reloaded.' }),
				await handler?.getOutput?.('list', { kind: 'text', text: '# Already formatted', markdown: true }),
				await handler?.getOutput?.('list', { kind: 'text', text: 'A newer runtime format' }),
			], [undefined, undefined, undefined, undefined]);
		});

		test('formats missing info arguments as command guidance', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			assert.deepStrictEqual(
				await handler?.getErrorOutput?.('info', new Error('Usage: /skills info <skill-name>\nExample: /skills info my-skill')),
				{
					kind: 'text',
					text: 'Usage: `/skills info <skill-name>`\n\nExample: `/skills info my-skill`',
					markdown: true,
				},
			);
		});
	});

	suite('Copilot MCP display', () => {
		const command: RuntimeSlashCommandInfo = {
			name: 'mcp',
			kind: 'builtin',
			description: 'Manage MCP servers',
			allowDuringAgentExecution: false,
		};

		test('formats the plain runtime list as compact Markdown', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			const output = await handler?.getOutput?.('show github', {
				kind: 'text',
				text: [
					'MCP Servers',
					'',
					'Per-server rows show standalone token counts.',
					'',
					'- github (connected, builtin): 1.2k tokens',
					'- unsafe [server](command:unsafe) <https://example.invalid> (disabled, user): error: unavailable',
					'- playwright (failed): error: process exited; last stderr: npm error E401',
				].join('\n'),
			});

			assert.deepStrictEqual(output, {
				kind: 'text',
				text: [
					'# MCP servers',
					'',
					'Per-server rows show standalone token counts.',
					'',
					'- github \\(connected, builtin\\): 1.2k tokens',
					'- unsafe \\[server\\]\\(command:unsafe\\) &lt;https://example.invalid&gt; — **disabled, user**',
					'  ```text',
					'  Error: unavailable',
					'  ```',
					'- playwright — **failed**',
					'  ```text',
					'  Error: process exited',
					'  ',
					'  Last stderr: npm error E401',
					'  ```',
				].join('\n'),
				markdown: true,
			});
		});

		test('formats multiline failed-server stderr without merging subsequent servers', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			const output = await handler?.getOutput?.('show', {
				kind: 'text',
				text: [
					'MCP Servers',
					'',
					'Per-server rows show standalone token counts.',
					'',
					'- component-explorer (failed): error: failed to initialize MCP client; server closed its input stream; last stderr: [mcp] v0.3.0 (built 2026-09-08)',
					'Server stderr (last 3 lines):',
					'npm warn Unknown project config "target".',
					'npm warn [help](command:unsafe) <https://example.invalid>',
					'[mcp] v0.3.0 (built 2026-09-08)',
					'- github (connected, builtin)',
				].join('\n'),
			});

			assert.deepStrictEqual(output, {
				kind: 'text',
				text: [
					'# MCP servers',
					'',
					'Per-server rows show standalone token counts.',
					'',
					'- component-explorer — **failed**',
					'  ```text',
					'  Error: failed to initialize MCP client; server closed its input stream',
					'  ',
					'  Server stderr (last 3 lines):',
					'  npm warn Unknown project config "target".',
					'  npm warn [help](command:unsafe) <https://example.invalid>',
					'  [mcp] v0.3.0 (built 2026-09-08)',
					'  ```',
					'- github \\(connected, builtin\\)',
				].join('\n'),
				markdown: true,
			});
		});

		test('defers to the runtime for mutating and changed responses', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			assert.deepStrictEqual([
				await handler?.getOutput?.('enable github', { kind: 'text', text: 'MCP server enabled.' }),
				await handler?.getOutput?.('list', { kind: 'text', text: '# Already formatted', markdown: true }),
				await handler?.getOutput?.('list', { kind: 'text', text: 'A newer runtime format' }),
				await handler?.getOutput?.('show', { kind: 'text', text: 'MCP Servers\n\nSummary\n\n- github (connected)\nUnexpected footer' }),
			], [undefined, undefined, undefined, undefined]);
		});

		test('formats missing server arguments as command guidance', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			assert.deepStrictEqual(
				await handler?.getErrorOutput?.('disable', new Error('Usage: /mcp disable <server-name>')),
				{
					kind: 'text',
					text: 'Usage: `/mcp disable <server-name>`',
					markdown: true,
				},
			);
		});
	});

	suite('Copilot plugin display', () => {
		const command: RuntimeSlashCommandInfo = {
			name: 'plugin',
			kind: 'builtin',
			description: 'Manage plugins',
			allowDuringAgentExecution: false,
		};

		test('formats the plain runtime list as compact Markdown', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			const output = await handler?.getOutput?.('', {
				kind: 'text',
				text: [
					'Installed Plugins:',
					'',
					'  • document-skills@marketplace v<https://example.invalid>',
					'  • unsafe-[plugin](command:unsafe) (disabled)',
				].join('\n'),
			});

			assert.deepStrictEqual(output, {
				kind: 'text',
				text: [
					'# Installed plugins',
					'',
					'- `document-skills@marketplace` — v&lt;https://example.invalid&gt;',
					'- `unsafe-[plugin](command:unsafe)` (disabled)',
				].join('\n'),
				markdown: true,
			});
		});

		test('defers to the runtime for unsupported and changed responses', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			assert.deepStrictEqual([
				await handler?.getOutput?.('install plugin', { kind: 'text', text: 'Usage' }),
				await handler?.getOutput?.('list', { kind: 'text', text: '# Already formatted', markdown: true }),
				await handler?.getOutput?.('list', { kind: 'text', text: 'A newer runtime format' }),
			], [undefined, undefined, undefined]);
		});

		test('formats named description lists as compact Markdown', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			assert.deepStrictEqual(
				await handler?.getOutput?.('marketplace browse awesome-copilot', {
					kind: 'text',
					text: 'Plugins in awesome-copilot:\n- accessibility-kanban: Kanban [board](command:unsafe)\n- no-description:',
				}),
				{
					kind: 'text',
					text: '# Plugins in awesome-copilot\n\n- `accessibility-kanban` — Kanban \\[board\\]\\(command:unsafe\\)\n- `no-description`',
					markdown: true,
				},
			);
		});

		test('formats a missing marketplace error with recovery guidance', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			assert.deepStrictEqual(
				await handler?.getErrorOutput?.(
					'marketplace browse work',
					new Error('(sendFailed) Request session.plugins.marketplaces.browse failed with message: Marketplace "work" not found'),
				),
				{
					kind: 'text',
					text: 'Marketplace `work` was not found.\n\nRun `/plugin marketplace list` to see the available marketplaces.',
					markdown: true,
				},
			);
		});

		test('formats a missing plugin manifest error with repository guidance', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			assert.deepStrictEqual(
				await handler?.getErrorOutput?.(
					'install github/awesome-copilot',
					new Error('(sendFailed) Request session.plugins.install failed with message: No plugin.json found in repository. Tried: .plugin/plugin.json, ./plugin.json, .github/plugin/plugin.json, .claude-plugin/plugin.json'),
				),
				{
					kind: 'text',
					text: [
						'Could not install a plugin from `github/awesome-copilot`.',
						'',
						'No `plugin.json` manifest was found in the repository.',
						'',
						'Expected one of:',
						'- `.plugin/plugin.json`',
						'- `./plugin.json`',
						'- `.github/plugin/plugin.json`',
						'- `.claude-plugin/plugin.json`',
					].join('\n'),
					markdown: true,
				},
			);
		});

		test('removes transport details from other plugin API errors', async () => {
			const handler = getCopilotCustomizationCommandHandler(command);
			assert.deepStrictEqual(
				await handler?.getErrorOutput?.(
					'marketplace add github/awesome-copilot',
					new Error('(sendFailed) Request session.plugins.marketplaces.add failed with message: Marketplace "awesome-copilot" is a default marketplace and is already available'),
				),
				{
					kind: 'text',
					text: '## Plugin command failed\n\nMarketplace "awesome-copilot" is a default marketplace and is already available',
					markdown: true,
				},
			);
		});

		test('provides progress messages for plugin mutations', () => {
			const handler = getCopilotCustomizationCommandHandler(command, pluginApi([]));

			assert.deepStrictEqual({
				install: handler?.getProgressMessage?.('install github/example'),
				uninstall: handler?.getProgressMessage?.('remove example'),
				update: handler?.getProgressMessage?.('update example'),
				enable: handler?.getProgressMessage?.('enable example'),
				disable: handler?.getProgressMessage?.('disable example'),
				marketplaceAdd: handler?.getProgressMessage?.('marketplace add github/example'),
				marketplaceRemove: handler?.getProgressMessage?.('marketplace remove example --force'),
				marketplaceUpdate: handler?.getProgressMessage?.('marketplace update'),
				marketplaceBrowse: handler?.getProgressMessage?.('marketplace browse example'),
				list: handler?.getProgressMessage?.('list'),
			}, {
				install: 'Installing plugin…',
				uninstall: 'Uninstalling plugin…',
				update: 'Updating plugin…',
				enable: 'Enabling plugin…',
				disable: 'Disabling plugin…',
				marketplaceAdd: 'Adding plugin marketplace…',
				marketplaceRemove: 'Removing plugin marketplace…',
				marketplaceUpdate: 'Updating plugin marketplaces…',
				marketplaceBrowse: undefined,
				list: undefined,
			});
		});

		test('invokes plugin mutations through the session plugin API and reloads contributions', async () => {
			const calls: string[] = [];
			const plugins = pluginApi(calls);

			assert.deepStrictEqual({
				install: await invokeCopilotPluginCommand('install document-skills@anthropic', plugins),
				update: await invokeCopilotPluginCommand('update document-skills@anthropic', plugins),
				disable: await invokeCopilotPluginCommand('disable document-skills@anthropic', plugins),
				uninstall: await invokeCopilotPluginCommand('remove document-skills@anthropic', plugins),
				calls,
			}, {
				install: {
					kind: 'text',
					text: 'Installed plugin document-skills@anthropic.\nVersion: 1.2.3\nInstalled 2 skills.\nUse /document-skills to invoke the plugin.',
					runtimeSettingsChanged: true,
				},
				update: {
					kind: 'text',
					text: 'Updated plugin document-skills@anthropic. Updated version: 1.2.4.',
					runtimeSettingsChanged: true,
				},
				disable: {
					kind: 'text',
					text: 'Disabled plugin document-skills@anthropic.',
					runtimeSettingsChanged: true,
				},
				uninstall: {
					kind: 'text',
					text: 'Uninstalled plugin document-skills@anthropic.',
					runtimeSettingsChanged: true,
				},
				calls: [
					'install:document-skills@anthropic', 'reload',
					'update:document-skills@anthropic', 'reload',
					'list', 'disable:document-skills@anthropic', 'reload',
					'uninstall:document-skills@anthropic', 'reload',
				],
			});
		});

		test('invokes plugin marketplace commands', async () => {
			const calls: string[] = [];
			const plugins = pluginApi(calls);

			assert.deepStrictEqual({
				add: await invokeCopilotPluginCommand('marketplace add anthropics/skills', plugins),
				list: await invokeCopilotPluginCommand('marketplace list', plugins),
				browse: await invokeCopilotPluginCommand('marketplace browse anthropic-agent-skills', plugins),
				update: await invokeCopilotPluginCommand('marketplace update anthropic-agent-skills', plugins),
				remove: await invokeCopilotPluginCommand('marketplace remove anthropic-agent-skills --force', plugins),
				calls,
			}, {
				add: { kind: 'text', text: 'Added plugin marketplace anthropic-agent-skills.', runtimeSettingsChanged: true },
				list: {
					kind: 'text',
					text: [
						'# Plugin marketplaces',
						'',
						'## Included with GitHub Copilot',
						'- `copilot-plugins` — GitHub: github/copilot-plugins',
						'',
						'## Registered marketplaces',
						'- `anthropic-agent-skills` — GitHub: anthropics/skills *(managed, unavailable)*',
					].join('\n'),
					markdown: true,
				},
				browse: { kind: 'text', text: 'Plugins in anthropic-agent-skills:\n- document-skills: Document tools' },
				update: { kind: 'text', text: 'Updated plugin marketplaces.\nUpdated anthropic-agent-skills.' },
				remove: { kind: 'text', text: 'Removed plugin marketplace anthropic-agent-skills.', runtimeSettingsChanged: true },
				calls: [
					'marketplace.add:anthropics/skills',
					'marketplace.list',
					'marketplace.browse:anthropic-agent-skills',
					'marketplace.refresh:anthropic-agent-skills',
					'marketplace.remove:anthropic-agent-skills:true',
					'reload',
				],
			});
		});

		test('returns usage without mutating plugins when arguments are missing', async () => {
			const calls: string[] = [];
			const plugins = pluginApi(calls);

			assert.deepStrictEqual({
				install: await invokeCopilotPluginCommand('install', plugins),
				removeMarketplace: await invokeCopilotPluginCommand('marketplace remove', plugins),
				calls,
			}, {
				install: { kind: 'text', text: 'Usage: /plugin install <source>' },
				removeMarketplace: { kind: 'text', text: 'Usage: /plugin marketplace remove <name> [--force]' },
				calls: [],
			});
		});
	});

	for (const handler of [undefined, {}] satisfies (ICopilotSlashCommandHandler | undefined)[]) {
		test(`preserves SDK commands with ${handler ? 'empty' : 'no matching'} handlers`, async () => {
			const provider = new CopilotSlashCommandProvider(async () => [command], {
				getCommandHandler: () => handler,
			}, store.add(new NullLogService()));

			assert.deepStrictEqual(await provider.resolveSlashCommand('diagnostic'), command);
		});

	}

	test('attaches hooks to canonical commands without changing catalog metadata', async () => {
		const handler: ICopilotSlashCommandHandler = {
			getInvocation: input => ({ name: 'diagnostic', input: `report ${input}` }),
			getOutput: async (_input, result) => result.kind === 'text' ? { kind: 'text', text: result.text, markdown: true } : undefined,
		};
		const provider = new CopilotSlashCommandProvider(async () => [command], {
			getCommandHandler: resolved => resolved.name === command.name ? handler : undefined,
		}, store.add(new NullLogService()));
		const resolved = await provider.resolveSlashCommand('/DIAG');
		const output = await resolved?.getOutput?.('all', { kind: 'text', text: '**Report**' });

		assert.deepStrictEqual({
			invocation: resolved?.getInvocation?.('all'),
			output: output && renderCopilotSlashCommandOutput(output),
			catalogCommand: (await provider.getSlashCommands()).find(item => item.name === command.name),
			catalogHasHooks: Object.hasOwn(command, 'getOutput') || Object.hasOwn(command, 'getInvocation'),
		}, {
			invocation: { name: 'diagnostic', input: 'report all' },
			output: '**Report**',
			catalogCommand: command,
			catalogHasHooks: false,
		});

	});

	test('supports output-only handlers and synchronous link results', async () => {
		const output: CopilotSlashCommandOutput = { kind: 'link', resource: URI.parse('file:///diagnostics/report.md'), label: 'Open Report' };
		const provider = new CopilotSlashCommandProvider(async () => [command], {
			getCommandHandler: () => ({ getOutput: () => output }),
		}, store.add(new NullLogService()));
		const resolved = await provider.resolveSlashCommand('diagnostic');

		assert.deepStrictEqual({
			getInvocation: resolved?.getInvocation,
			output: await resolved?.getOutput?.('', { kind: 'completed', message: 'Report saved' }),
		}, {
			getInvocation: undefined,
			output,
		});
	});

	test('supports invocation-only handlers', async () => {
		const provider = new CopilotSlashCommandProvider(async () => [command], {
			getCommandHandler: () => ({ getInvocation: () => ({ name: 'diagnostic', input: 'report' }) }),
		}, store.add(new NullLogService()));
		const resolved = await provider.resolveSlashCommand('diagnostic');

		assert.deepStrictEqual({
			invocation: resolved?.getInvocation?.(''),
			getOutput: resolved?.getOutput,
		}, {
			invocation: { name: 'diagnostic', input: 'report' },
			getOutput: undefined,
		});
	});

	test('allows handlers to defer to the SDK invocation and output', async () => {
		const provider = new CopilotSlashCommandProvider(async () => [command], {
			getCommandHandler: () => ({
				getInvocation: () => undefined,
				getOutput: async () => undefined,
			}),
		}, store.add(new NullLogService()));
		const resolved = await provider.resolveSlashCommand('diagnostic');

		assert.deepStrictEqual({
			invocation: resolved?.getInvocation?.(''),
			output: await resolved?.getOutput?.('', { kind: 'completed' }),
		}, {
			invocation: undefined,
			output: undefined,
		});
	});
});
