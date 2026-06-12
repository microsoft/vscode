/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CompletionItemKind } from '../../common/state/protocol/commands.js';
import { CustomizationLoadStatus, CustomizationType, MessageAttachmentKind, type PluginCustomization, type PromptCustomization, type SkillCustomization } from '../../common/state/sessionState.js';
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
			enabled,
			load: { kind: CustomizationLoadStatus.Loaded },
			...(children ? { children: [...children] } : {}),
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

	test('returns session-effective skills with attachment metadata and trailing space', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			plugin('skills', [skill('agent-host-docs', 'Use this skill when working on Agent Host code')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result, [{
			insertText: '/agent-host-docs ',
			rangeStart: 0,
			rangeEnd: 1,
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: '/agent-host-docs',
				_meta: {
					uri: 'file:///skills/agent-host-docs/SKILL.md',
					name: 'agent-host-docs',
					displayName: 'agent-host-docs',
					description: 'Use this skill when working on Agent Host code',
				},
			},
		}]);
	});

	test('flattens skill children in session-effective order and ignores non-skill children', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			plugin('first', [skill('session-skill'), prompt('ignored-prompt')]),
			plugin('second', [skill('global-skill')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result.map(item => item.insertText), ['/session-skill ', '/global-skill ']);
	});

	test('ignores disabled customization containers', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [
			plugin('disabled', [skill('hidden-skill')], false),
			plugin('enabled', [skill('visible-skill')]),
		];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result.map(item => item.insertText), ['/visible-skill ']);
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

		const result = await run(provider, '/b extra', 2);

		assert.deepStrictEqual(result.map(item => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
			{ insertText: '/beta ', rangeStart: 0, rangeEnd: 2 },
		]);
	});

	test('filters skills by an in-message slash prefix and replaces only that token', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [plugin('skills', [skill('alpha'), skill('beta')])];
		const provider = createProvider(agent);
		const text = 'use /b extra';

		const result = await run(provider, text, text.indexOf('/b') + '/b'.length);

		assert.deepStrictEqual(result.map(item => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
			{ insertText: '/beta ', rangeStart: 4, rangeEnd: 6 },
		]);
	});

	test('returns skills for a slash token after whitespace', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [plugin('skills', [skill('alpha'), skill('beta')])];
		const provider = createProvider(agent);
		const text = 'use /';

		const result = await run(provider, text);

		assert.deepStrictEqual(result.map(item => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
			{ insertText: '/alpha ', rangeStart: 4, rangeEnd: 5 },
			{ insertText: '/beta ', rangeStart: 4, rangeEnd: 5 },
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
		const text = 'use /cached-skill trailing';

		const result = await run(provider, text, text.indexOf('trailing'));

		assert.deepStrictEqual(result, []);
	});

	test('returns an empty list when the cursor is past the leading slash token', async () => {
		const agent = new MockAgent('mock');
		agent.getSessionCustomizations = async () => [plugin('skills', [skill('cached-skill')])];
		const provider = createProvider(agent);

		const result = await run(provider, '/cached-skill trailing', 14);

		assert.deepStrictEqual(result, []);
	});
});
