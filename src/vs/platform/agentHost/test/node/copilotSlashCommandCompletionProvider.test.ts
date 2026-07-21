/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../common/agentHostFileSystemService.js';
import { CompletionItem, CompletionItemKind } from '../../common/state/protocol/commands.js';
import { Customization, CustomizationLoadStatus, CustomizationType, McpServerStatus, MessageAttachmentKind, type PluginCustomization, type SkillCustomization } from '../../common/state/protocol/state.js';
import { CopilotSlashCommandCompletionProvider, ICopilotRuntimeSlashCommandInfo, parseLeadingSlashCommand } from '../../node/copilot/copilotSlashCommandCompletionProvider.js';

/**
 * The provider now also injects workbench-defined config-action items
 * (permission/mode toggles like `/yolo`, `/autopilot`) into every leading-slash
 * completion result; these carry an `action` bag on their attachment `_meta`.
 * The runtime-focused assertions below filter them out with this helper so they
 * keep asserting on the runtime SDK command set. Runtime commands whose name
 * collides with a config-action command (e.g. `plan`) are intentionally dropped
 * by the provider, so they no longer appear even after filtering.
 */
function runtimeOnly(items: readonly CompletionItem[]): CompletionItem[] {
	return items.filter(i => i.attachment?._meta?.action === undefined);
}

suite('CopilotSlashCommandCompletionProvider', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseLeadingSlashCommand', () => {
		test('matches lone /plan', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/plan'), { command: 'plan', rest: '', rawRest: '' });
		});

		test('matches lone /compact', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/compact'), { command: 'compact', rest: '', rawRest: '' });
		});

		test('matches lone /research', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/research'), { command: 'research', rest: '', rawRest: '' });
		});

		test('captures trailing text after a space for /research', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/research How does React work?'), { command: 'research', rest: 'How does React work?', rawRest: 'How does React work?' });
		});

		test('matches lone /rubber-duck', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/rubber-duck'), { command: 'rubber-duck', rest: '', rawRest: '' });
		});

		test('matches lone /env', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/env'), { command: 'env', rest: '', rawRest: '' });
		});

		test('matches lone /review', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/review'), { command: 'review', rest: '', rawRest: '' });
		});

		test('matches lone /security-review', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/security-review'), { command: 'security-review', rest: '', rawRest: '' });
		});

		test('captures trailing text after a space for /rubber-duck', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/rubber-duck review my approach'), { command: 'rubber-duck', rest: 'review my approach', rawRest: 'review my approach' });
		});

		test('captures trailing text after a space for /env', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/env ignored input'), { command: 'env', rest: 'ignored input', rawRest: 'ignored input' });
		});

		test('captures trailing text after a space for /review', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/review focus on tests'), { command: 'review', rest: 'focus on tests', rawRest: 'focus on tests' });
		});

		test('captures trailing text after a space for /security-review', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/security-review focus on auth'), { command: 'security-review', rest: 'focus on auth', rawRest: 'focus on auth' });
		});

		test('parses arbitrary slash command tokens', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/rubber-duck-extra'), { command: 'rubber-duck-extra', rest: '', rawRest: '' });
		});

		test('preserves multiline command input as rawRest', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/foo first line\nsecond line'), { command: 'foo', rest: 'first line\nsecond line', rawRest: 'first line\nsecond line' });
		});

		test('trims rest while retaining rawRest', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/foo   padded  '), { command: 'foo', rest: 'padded', rawRest: 'padded  ' });
		});

		test('captures trailing text after a space', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/plan build a hello world'), { command: 'plan', rest: 'build a hello world', rawRest: 'build a hello world' });
		});

		test('captures trailing text after a space for /compact', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/compact some text'), { command: 'compact', rest: 'some text', rawRest: 'some text' });
		});

		test('rejects leading whitespace', () => {
			assert.strictEqual(parseLeadingSlashCommand(' /compact'), undefined);
		});

		test('accepts uppercase command tokens', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/PLAN'), { command: 'PLAN', rest: '', rawRest: '' });
		});
	});

	suite('provideCompletionItems', () => {
		const runtimeCommands = [
			{ name: 'plan', description: 'Runtime plan', kind: 'builtin' as const, allowDuringAgentExecution: true, input: { hint: 'task' } },
			{ name: 'compact', description: 'Runtime compact', kind: 'builtin' as const, allowDuringAgentExecution: true },
			{ name: 'research', description: 'Runtime research', kind: 'builtin' as const, allowDuringAgentExecution: true, input: { hint: 'query' } },
			{ name: 'rubber-duck', description: 'Runtime rubber-duck', kind: 'builtin' as const, allowDuringAgentExecution: true, input: { hint: 'review prompt' } },
			{ name: 'env', description: 'Runtime env', kind: 'builtin' as const, allowDuringAgentExecution: true },
			{ name: 'review', description: 'Runtime review', kind: 'builtin' as const, allowDuringAgentExecution: true, input: { hint: 'scope' } },
			{ name: 'security-review', description: 'Runtime security review', kind: 'builtin' as const, allowDuringAgentExecution: true, input: { hint: 'scope' } },
		];
		const provider = new CopilotSlashCommandCompletionProvider('copilotcli', {
			isRubberDuckEnabled: () => true,
			getRuntimeSlashCommands: async () => runtimeCommands,
			getSessionCustomizations: async () => [],
		});
		const session = 'copilotcli:/abc';

		async function run(text: string, offset = text.length) {
			return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
		}

		test('returns nothing for non-copilotcli scheme', async () => {
			const items = await provider.provideCompletionItems({
				kind: CompletionItemKind.UserMessage,
				channel: 'claude:/abc',
				text: '/',
				offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(items, []);
		});

		test('returns all runtime items for lone "/" (config-action items filtered)', async () => {
			const items = await run('/');
			// `plan` collides with a config-action command and is dropped from the runtime set.
			assert.deepStrictEqual(runtimeOnly(items).map(i => i.insertText), ['/compact ', '/research ', '/rubber-duck ', '/env ', '/review ', '/security-review '].sort());
		});

		test('injects config-action items (permission/mode toggles) for a leading slash', async () => {
			const items = await run('/');
			const byLabel = new Map(items.filter(i => i.attachment?._meta?.action !== undefined).map(i => [i.attachment?.label, i]));
			assert.ok(byLabel.has('/yolo'));
			assert.ok(byLabel.has('/autopilot on'));
			assert.strictEqual(byLabel.get('/autopilot')?.insertText, '/autopilot ');
		});

		test('filters to /plan when "/p" typed', async () => {
			const items = await run('/p');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ']);
		});

		test('filters to /compact when "/c" typed', async () => {
			const items = await run('/c');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/compact ']);
		});

		test('filters to /env when "/e" typed and runtime command exists', async () => {
			const items = await run('/e');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/env ']);
		});

		test('filters to /research and /rubber-duck when "/r" typed', async () => {
			const items = await run('/r');
			assert.deepStrictEqual(items.map(i => i.insertText), [
				'/research ',
				'/review ',
				'/rubber-duck '
			].sort());
		});

		test('filters to /security-review when "/s" typed', async () => {
			const items = await run('/s');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/security-review ']);
		});

		test('returns nothing when /word does not match any command prefix', async () => {
			const items = await run('/zz');
			assert.deepStrictEqual(items, []);
		});

		test('returns nothing when input does not start with /', async () => {
			const items = await run('hello /pl', 9);
			assert.deepStrictEqual(items, []);
		});

		test('returns nothing when cursor is past the leading word', async () => {
			// Cursor sits after the trailing space, no longer in the slash token.
			const items = await run('/plan ', 6);
			assert.deepStrictEqual(items, []);
		});

		test('range covers only the leading slash word', async () => {
			const items = await run('/p extra text', 2);
			assert.strictEqual(items.length, 1);
			assert.strictEqual(items[0].rangeStart, 0);
			assert.strictEqual(items[0].rangeEnd, 2);
		});

		test('attachment is Simple with command + description meta', async () => {
			const items = await run('/');
			assert.deepStrictEqual(runtimeOnly(items).map(item => ({ insertText: item.insertText, type: item.attachment?.type, meta: item.attachment?._meta })), [
				{
					insertText: '/compact ',
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'compact',
						description: 'Runtime compact',
					},
				},
				{
					insertText: '/env ',
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'env',
						description: 'Runtime env',
					},
				},
				{
					insertText: '/research ',
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'research',
						description: 'Runtime research',
						argumentHint: 'query',
					},
				},
				{
					insertText: '/review ',
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'review',
						description: 'Runtime review',
						argumentHint: 'scope',
					},
				},
				{
					insertText: '/rubber-duck ',
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'rubber-duck',
						description: 'Runtime rubber-duck',
						argumentHint: 'review prompt',
					},
				},
				{
					insertText: '/security-review ',
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'security-review',
						description: 'Runtime security review',
						argumentHint: 'scope',
					},
				},
			]);
		});

		test('omits /rubber-duck when not enabled', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => false,
				getRuntimeSlashCommands: async () => runtimeCommands,
				getSessionCustomizations: async () => [],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/', offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(runtimeOnly(items).map(i => i.insertText), [
				'/compact ',
				'/env ',
				'/research ',
				'/review ',
				'/security-review '
			].sort());
		});

		test('returns no completion items when runtime command list is empty', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [],
				getSessionCustomizations: async () => [],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/', offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(runtimeOnly(items), []);
		});

		test('filters out runtime commands omitted from the catalog', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => runtimeCommands.filter(command => command.name !== 'env'),
				getSessionCustomizations: async () => [],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/', offset: 1,
			}, CancellationToken.None);
			// `plan` collides with a config-action command and is dropped from the runtime set.
			assert.deepStrictEqual(runtimeOnly(items).map(i => i.insertText), [
				'/compact ',
				'/research ',
				'/review ',
				'/rubber-duck ',
				'/security-review ',
			].sort());
		});

		test('includes runtime SDK commands in completion results', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [{
					name: 'focus',
					description: 'Focus on specific files',
					kind: 'builtin',
					allowDuringAgentExecution: true,
					input: { hint: 'scope' },
				}],
				getSessionCustomizations: async () => [],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/f', offset: 2,
			}, CancellationToken.None);
			assert.deepStrictEqual(items.map(i => i.insertText), ['/focus ']);
		});

		test('config-action commands shadow runtime commands of the same name', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [
					{ name: 'plan', description: 'runtime plan', kind: 'builtin', allowDuringAgentExecution: true, input: { hint: 'task' } },
					{ name: 'compact', description: 'runtime compact', kind: 'builtin', allowDuringAgentExecution: true },
					{ name: 'runtime-only', description: 'runtime only', kind: 'client', allowDuringAgentExecution: true },
				],
				getSessionCustomizations: async () => [],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/', offset: 1,
			}, CancellationToken.None);
			// `plan` collides with a config-action command, so the runtime `plan` is
			// dropped; non-colliding runtime commands are kept.
			assert.deepStrictEqual(runtimeOnly(items).map(i => i.insertText), ['/compact ', '/runtime-only '].sort());
			// The config-action `/plan ` item is still surfaced (carrying an action bag).
			const planItem = items.find(i => i.insertText === '/plan ');
			assert.ok(planItem?.attachment?._meta?.action !== undefined);
		});

		test('uses runtime input metadata to determine trailing space insertion', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [
					{ name: 'no-input', description: 'No input', kind: 'builtin', allowDuringAgentExecution: true },
					{ name: 'needs-input', description: 'Needs input', kind: 'builtin', allowDuringAgentExecution: true, input: { hint: 'value' } },
				],
				getSessionCustomizations: async () => [],
			});
			const withInput = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/n', offset: 2,
			}, CancellationToken.None);
			assert.deepStrictEqual(withInput.map(i => i.insertText), ['/no-input ', '/needs-input '].sort());
		});

		test('expands input choices into one item per choice', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [
					{ name: 'toggle', description: 'Toggle a feature on or off', kind: 'builtin', allowDuringAgentExecution: true, input: { hint: '', choices: [{ name: 'on', description: 'Turn the feature on' }, { name: 'off', description: 'Turn the feature off' }] } },
				],
				getSessionCustomizations: async () => [],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/t', offset: 2,
			}, CancellationToken.None);
			// Structured choices expand into one item per choice, each carrying its own description.
			assert.deepStrictEqual(items.map(item => ({ insertText: item.insertText, meta: item.attachment?._meta })), [
				{ insertText: '/toggle off ', meta: { command: 'toggle', description: 'Turn the feature off' } },
				{ insertText: '/toggle on ', meta: { command: 'toggle', description: 'Turn the feature on' } },
			]);
		});

		test('includes a bare command item when a choice has an empty name', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [
					{ name: 'toggle', description: 'Toggle a feature on or off', kind: 'builtin', allowDuringAgentExecution: true, input: { hint: '', choices: [{ name: '', description: 'Show the current state' }, { name: 'on', description: 'Turn on' }, { name: 'off', description: 'Turn off' }] } },
				],
				getSessionCustomizations: async () => [],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/t', offset: 2,
			}, CancellationToken.None);
			// A choice with an empty name produces the bare command alongside the other options.
			assert.deepStrictEqual(items.map(i => i.insertText), ['/toggle ', '/toggle off ', '/toggle on ']);
		});

		test('surfaces the free-text hint as an argument hint when there are no choices', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [
					{ name: 'toggle', description: 'Toggle a feature on or off', kind: 'builtin', allowDuringAgentExecution: true, input: { hint: '[on|off]' } },
				],
				getSessionCustomizations: async () => [],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/t', offset: 2,
			}, CancellationToken.None);
			// Without structured choices, the free-text hint is not expanded into options; it is surfaced as an argument hint on a single item.
			assert.deepStrictEqual(items.map(item => ({ insertText: item.insertText, meta: item.attachment?._meta })), [
				{ insertText: '/toggle ', meta: { command: 'toggle', description: 'Toggle a feature on or off', argumentHint: '[on|off]' } },
			]);
		});

		test('passes raw session id to runtime command listing', async () => {
			let seen: string | undefined;
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async (id: string) => {
					seen = id;
					return [{ name: 'focus', kind: 'builtin', description: 'Focus', allowDuringAgentExecution: true }];
				},
				getSessionCustomizations: async () => [],
			});
			await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: 'copilotcli:/abc', text: '/f', offset: 2,
			}, CancellationToken.None);
			assert.strictEqual(seen, 'abc');
		});
	});

	suite('runtime skill completions', () => {
		const session = 'copilotcli:/abc';

		function skill(name: string, description?: string): SkillCustomization {
			return {
				type: CustomizationType.Skill,
				id: `file:///skills/${name}/SKILL.md`,
				uri: `file:///skills/${name}/SKILL.md`,
				name,
				...(description !== undefined ? { description } : {}),
			};
		}

		function plugin(name: string, children?: readonly SkillCustomization[], enabled = true): PluginCustomization {
			return {
				type: CustomizationType.Plugin,
				id: `file:///plugins/${name}`,
				uri: `file:///plugins/${name}`,
				name,
				enabled,
				load: { kind: CustomizationLoadStatus.Loaded },
				...(children ? { children: [...children] } : {}),
			};
		}

		function syncedPlugin(name: string, children?: readonly SkillCustomization[]): PluginCustomization {
			return {
				...plugin(name, children),
				id: `${SYNCED_CUSTOMIZATION_SCHEME}:/plugins/${name}`,
				uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/plugins/${name}`,
			};
		}

		function createProvider(runtimeCommands: readonly ICopilotRuntimeSlashCommandInfo[], customizations: readonly Customization[] = []): CopilotSlashCommandCompletionProvider {
			return new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => runtimeCommands,
				getSessionCustomizations: async () => customizations,
			});
		}

		async function run(provider: CopilotSlashCommandCompletionProvider, text: string, offset = text.length) {
			return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
		}

		test('includes runtime skills that are not known local skills', async () => {
			const provider = createProvider([
				{ name: 'my-skill', description: 'Runtime skill', kind: 'skill', allowDuringAgentExecution: true },
			]);
			const items = await run(provider, '/');
			assert.deepStrictEqual(runtimeOnly(items).map(i => i.insertText), ['/my-skill ']);
		});

		test('excludes runtime skills that match a known plugin skill (with plugin prefix)', async () => {
			const provider = createProvider(
				[{ name: 'my-plugin:my-skill', description: 'Runtime skill', kind: 'skill', allowDuringAgentExecution: true }],
				[plugin('my-plugin', [skill('my-skill')])],
			);
			const items = await run(provider, '/');
			assert.deepStrictEqual(runtimeOnly(items), []);
		});

		test('excludes runtime skills that match a known plugin skill with the same name (no prefix)', async () => {
			const provider = createProvider(
				[{ name: 'monitor-pr', description: 'Runtime skill', kind: 'skill', allowDuringAgentExecution: true }],
				[plugin('monitor-pr', [skill('monitor-pr')])],
			);
			const items = await run(provider, '/');
			assert.deepStrictEqual(runtimeOnly(items), []);
		});

		test('excludes runtime skills that match a known synced plugin skill (no prefix)', async () => {
			const provider = createProvider(
				[{ name: 'monitor-pr', description: 'Runtime skill', kind: 'skill', allowDuringAgentExecution: true }],
				[syncedPlugin('skills-bundle', [skill('monitor-pr')])],
			);
			const items = await run(provider, '/');
			assert.deepStrictEqual(runtimeOnly(items), []);
		});

		test('includes runtime skills whose name differs from the prefixed known skill candidate', async () => {
			// A non-synced plugin skill is known as `my-plugin:my-skill`, so a bare `my-skill` runtime skill is still surfaced.
			const provider = createProvider(
				[{ name: 'my-skill', description: 'Runtime skill', kind: 'skill', allowDuringAgentExecution: true }],
				[plugin('my-plugin', [skill('my-skill')])],
			);
			const items = await run(provider, '/');
			assert.deepStrictEqual(runtimeOnly(items).map(i => i.insertText), ['/my-skill ']);
		});

		test('treats skills inside disabled containers as unknown', async () => {
			const provider = createProvider(
				[{ name: 'my-plugin:my-skill', description: 'Runtime skill', kind: 'skill', allowDuringAgentExecution: true }],
				[plugin('my-plugin', [skill('my-skill')], false)],
			);
			const items = await run(provider, '/');
			assert.deepStrictEqual(runtimeOnly(items).map(i => i.insertText), ['/my-plugin:my-skill ']);
		});

		test('ignores mcp server containers when computing known skills', async () => {
			const mcpServer: Customization = {
				type: CustomizationType.McpServer,
				id: 'file:///mcp/my-skill',
				uri: 'file:///mcp/my-skill',
				name: 'my-skill',
				enabled: true,
				state: { kind: McpServerStatus.Ready },
			};
			const provider = createProvider(
				[{ name: 'my-skill', description: 'Runtime skill', kind: 'skill', allowDuringAgentExecution: true }],
				[mcpServer],
			);
			const items = await run(provider, '/');
			assert.deepStrictEqual(runtimeOnly(items).map(i => i.insertText), ['/my-skill ']);
		});

		test('surfaces the skill prompt hint as an argument hint', async () => {
			const provider = createProvider([
				{ name: 'my-skill', description: 'Runtime skill', kind: 'skill', allowDuringAgentExecution: true, input: { hint: 'do stuff' } },
			]);
			const items = await run(provider, '/');
			assert.deepStrictEqual(runtimeOnly(items).map(item => ({ insertText: item.insertText, type: item.attachment?.type, meta: item.attachment?._meta })), [
				{
					insertText: '/my-skill ',
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'my-skill',
						description: 'Runtime skill',
						argumentHint: 'do stuff',
					},
				},
			]);
		});

		test('does not expand a skill hint into option items', async () => {
			const provider = createProvider([
				{ name: 'toggle-skill', description: 'Toggle skill', kind: 'skill', allowDuringAgentExecution: true, input: { hint: '[on|off]' } },
			]);
			const items = await run(provider, '/');
			assert.deepStrictEqual(runtimeOnly(items).map(i => i.insertText), ['/toggle-skill ']);
		});

		test('surfaces runtime skills alongside builtins for a leading slash', async () => {
			const provider = createProvider([
				{ name: 'compact', description: 'Runtime compact', kind: 'builtin', allowDuringAgentExecution: true },
				{ name: 'alpha-skill', description: 'Alpha skill', kind: 'skill', allowDuringAgentExecution: true },
			]);
			const items = await run(provider, '/');
			assert.deepStrictEqual(runtimeOnly(items).map(i => i.insertText), ['/compact ', '/alpha-skill '].sort());
		});

		test('returns only runtime skills for an in-message slash token', async () => {
			const provider = createProvider([
				{ name: 'plan', description: 'Runtime plan', kind: 'builtin', allowDuringAgentExecution: true, input: { hint: 'task' } },
				{ name: 'runtime-only', description: 'Client command', kind: 'client', allowDuringAgentExecution: true },
				{ name: 'my-skill', description: 'Runtime skill', kind: 'skill', allowDuringAgentExecution: true },
			]);
			const items = await run(provider, 'use /');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/my-skill ']);
		});

		test('excludes known skills even for an in-message slash token', async () => {
			const provider = createProvider(
				[
					{ name: 'my-plugin:my-skill', description: 'Known skill', kind: 'skill', allowDuringAgentExecution: true },
					{ name: 'other-skill', description: 'Runtime skill', kind: 'skill', allowDuringAgentExecution: true },
				],
				[plugin('my-plugin', [skill('my-skill')])],
			);
			const items = await run(provider, 'use /');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/other-skill ']);
		});
	});
});
