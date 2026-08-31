/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../common/agentHostFileSystemService.js';
import { CompletionItemKind } from '../../common/state/protocol/commands.js';
import { CustomizationLoadStatus, CustomizationType, MessageAttachmentKind, type DirectoryCustomization, type PluginCustomization, type PromptCustomization, type SkillCustomization } from '../../common/state/sessionState.js';
import { CustomizationEnablementKind } from '../../common/state/protocol/state.js';
import { AgentHostCompletions, CompletionTriggerCharacter } from '../../node/agentHostCompletions.js';
import { AgentHostSkillCompletionProvider } from '../../node/agentHostSkillCompletionProvider.js';
import { MockAgent } from './mockAgent.js';

suite('AgentHostSkillCompletionProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function skill(name: string, description?: string): SkillCustomization {
		return {
			type: CustomizationType.Skill,
			id: `file:///skills/${name}/SKILL.md`,
			uri: `file:///skills/${name}/SKILL.md`,
			name,
			...(description !== undefined ? { description } : {}),
		};
	}

	function prompt(name: string): PromptCustomization {
		return {
			type: CustomizationType.Prompt,
			id: `file:///prompts/${name}.md`,
			uri: `file:///prompts/${name}.md`,
			name,
		};
	}

	function plugin(name: string, children?: readonly (SkillCustomization | PromptCustomization)[], enabled = true): PluginCustomization {
		return {
			type: CustomizationType.Plugin,
			id: `file:///plugins/${name}`,
			uri: `file:///plugins/${name}`,
			name,
			...(enabled ? {} : {
				// TODO: Step 2 selects the persisted enablement scope.
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			}),
			load: { kind: CustomizationLoadStatus.Loaded },
			...(children ? { children: [...children] } : {}),
		};
	}

	function syncedPlugin(name: string, children?: readonly (SkillCustomization | PromptCustomization)[]): PluginCustomization {
		return {
			...plugin(name, children),
			id: `${SYNCED_CUSTOMIZATION_SCHEME}:/plugins/${name}`,
			uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/plugins/${name}`,
		};
	}

	/** A skill with an explicit URI, so the same logical skill can be modelled at two different locations. */
	function skillAt(name: string, uri: string, description?: string): SkillCustomization {
		return {
			type: CustomizationType.Skill,
			id: uri,
			uri,
			name,
			...(description !== undefined ? { description } : {}),
		};
	}

	function directory(name: string, uri: string, children: readonly SkillCustomization[]): DirectoryCustomization {
		return {
			type: CustomizationType.Directory,
			id: uri,
			uri,
			name,
			enabled: true,
			contents: CustomizationType.Skill,
			writable: false,
			load: { kind: CustomizationLoadStatus.Loaded },
			children: [...children],
		};
	}

	function createProvider(agent: MockAgent): AgentHostSkillCompletionProvider {
		return disposables.add(new AgentHostSkillCompletionProvider(() => agent));
	}

	async function run(provider: AgentHostSkillCompletionProvider, text: string, offset = text.length) {
		return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: 'mock:/session', text, offset }, CancellationToken.None);
	}

	test('announces slash as a trigger character', () => {
		const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
		const provider = disposables.add(new AgentHostSkillCompletionProvider(() => undefined));
		disposables.add(completions.registerProvider(provider));
		assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.Slash]);
	});

	test('complete skills from a plugin', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			plugin('my-skill', [skill('agent-host-docs', 'Use this skill when working on Agent Host code')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result, [{
			insertText: '/my-skill:agent-host-docs ',
			rangeStart: 0,
			rangeEnd: 1,
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: '/my-skill:agent-host-docs',
				_meta: {
					uri: 'file:///skills/agent-host-docs/SKILL.md',
					name: 'agent-host-docs',
					displayName: 'my-skill:agent-host-docs',
					description: 'Use this skill when working on Agent Host code',
				},
			},
		}]);
	});

	test('complete skills from a plugin with the same name as the skill', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			plugin('monitor-pr', [skill('monitor-pr', 'Use this skill when working with PRs')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result, [{
			insertText: '/monitor-pr ',
			rangeStart: 0,
			rangeEnd: 1,
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: '/monitor-pr',
				_meta: {
					uri: 'file:///skills/monitor-pr/SKILL.md',
					name: 'monitor-pr',
					displayName: 'monitor-pr',
					description: 'Use this skill when working with PRs',
				},
			},
		}]);
	});

	test('complete skills from a synced plugin without plugin prefix', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			syncedPlugin('skills-bundle', [skill('monitor-pr', 'Use this skill when working with PRs')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result, [{
			insertText: '/monitor-pr ',
			rangeStart: 0,
			rangeEnd: 1,
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: '/monitor-pr',
				_meta: {
					uri: 'file:///skills/monitor-pr/SKILL.md',
					name: 'monitor-pr',
					displayName: 'monitor-pr',
					description: 'Use this skill when working with PRs',
				},
			},
		}]);
	});

	test('de-duplicates the same skill discovered via the synced bundle and the on-disk scan', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			syncedPlugin('VS Code Synced Data', [skillAt('flaky-smoke-tests', 'vscode-synced-customization:/plugins/bundle/skills/flaky-smoke-tests/SKILL.md', 'Diagnose flaky tests')]),
			directory('.github', 'file:///ws/.github/skills', [skillAt('flaky-smoke-tests', 'file:///ws/.github/skills/flaky-smoke-tests/SKILL.md', 'Diagnose flaky tests')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result.map(item => item.insertText), ['/flaky-smoke-tests ']);
	});

	test('keeps two different skills that share a short name but have different descriptions', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			directory('.copilot', 'file:///home/.copilot/skills', [skillAt('update-skills', 'file:///home/.copilot/skills/update-skills/SKILL.md', 'Personal update-skills')]),
			directory('.github', 'file:///ws/.github/skills', [skillAt('update-skills', 'file:///ws/.github/skills/update-skills/SKILL.md', 'Workspace update-skills')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result.map(item => item.insertText), ['/update-skills ', '/update-skills ']);
	});

	// Known limitation of the core fix: two distinct same-named skills that both omit a description
	// produce the same identity key and collapse to one. There is no reachability loss (a bare `/X`
	// resolves to exactly one skill at the CLI regardless); Option B disambiguates via a qualified insert.
	test('collapses two same-named description-less skills (core-fix limitation, see Option B)', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			directory('.copilot', 'file:///home/.copilot/skills', [skillAt('update-skills', 'file:///home/.copilot/skills/update-skills/SKILL.md')]),
			directory('.github', 'file:///ws/.github/skills', [skillAt('update-skills', 'file:///ws/.github/skills/update-skills/SKILL.md')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result.map(item => item.insertText), ['/update-skills ']);
	});

	test('keeps same-named skills contributed by two different plugins', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			plugin('plugin-a', [skillAt('review', 'file:///plugins/plugin-a/skills/review/SKILL.md')]),
			plugin('plugin-b', [skillAt('review', 'file:///plugins/plugin-b/skills/review/SKILL.md')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result.map(item => item.insertText).sort(), ['/plugin-a:review ', '/plugin-b:review ']);
	});

	test('flattens skill children in session-effective order and ignores non-skill children', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			plugin('first', [skill('session-skill'), prompt('ignored-prompt')]),
			plugin('second', [skill('global-skill')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result.map(item => item.insertText), ['/first:session-skill ', '/second:global-skill ']);
	});

	test('ignores disabled customization containers', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			plugin('disabled', [skill('hidden-skill')], false),
			plugin('enabled', [skill('visible-skill')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result.map(item => item.insertText), ['/enabled:visible-skill ']);
	});

	test('returns an empty list when the agent has no session customizations hook', async () => {
		const agent = new MockAgent('mock');
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result, []);
	});

	test('filters skills by the typed slash prefix and replaces only that token', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [plugin('skills', [skill('alpha'), skill('beta')])];
		const provider = createProvider(agent);

		const result = await run(provider, '/skills:b extra', '/skills:b'.length);

		assert.deepStrictEqual(result.map(item => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
			{ insertText: '/skills:beta ', rangeStart: 0, rangeEnd: 9 },
		]);
	});

	test('fuzzy matches skills by the typed slash token', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [plugin('skills', [skill('fix-ci'), skill('other')])];
		const provider = createProvider(agent);

		const result = await run(provider, '/ci');

		assert.deepStrictEqual(result.map(item => item.insertText), ['/skills:fix-ci ']);
	});

	test('filters skills by an in-message slash prefix and replaces only that token', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [plugin('skills', [skill('alpha'), skill('beta')])];
		const provider = createProvider(agent);
		const text = 'use /skills:b extra';

		const result = await run(provider, text, text.indexOf('/skills:b') + '/skills:b'.length);

		assert.deepStrictEqual(result.map(item => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
			{ insertText: '/skills:beta ', rangeStart: 4, rangeEnd: 13 },
		]);
	});

	test('returns skills for a slash token after whitespace', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [plugin('skills', [skill('alpha'), skill('beta')])];
		const provider = createProvider(agent);
		const text = 'use /';

		const result = await run(provider, text);

		assert.deepStrictEqual(result.map(item => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
			{ insertText: '/skills:alpha ', rangeStart: 4, rangeEnd: 5 },
			{ insertText: '/skills:beta ', rangeStart: 4, rangeEnd: 5 },
		]);
	});

	test('does not complete slash tokens embedded in non-whitespace text', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [plugin('skills', [skill('alpha')])];
		const provider = createProvider(agent);

		const result = await run(provider, 'foo/bar', 'foo/bar'.length);

		assert.deepStrictEqual(result, []);
	});

	test('returns an empty list when the cursor is past an in-message slash token', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [plugin('skills', [skill('cached-skill')])];
		const provider = createProvider(agent);
		const text = 'use /skills:cached-skill trailing';

		const result = await run(provider, text, text.indexOf('trailing'));

		assert.deepStrictEqual(result, []);
	});

	test('returns an empty list when the cursor is past the leading slash token', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [plugin('skills', [skill('cached-skill')])];
		const provider = createProvider(agent);
		const text = '/skills:cached-skill trailing';

		const result = await run(provider, text, text.indexOf('trailing'));

		assert.deepStrictEqual(result, []);
	});
});
