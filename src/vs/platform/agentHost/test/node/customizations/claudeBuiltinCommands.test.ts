/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CustomizationType } from '../../../common/state/protocol/state.js';
import { buildClaudeBuiltinSkillsContainer, buildSdkBuiltinSkillsContainer } from '../../../node/claude/customizations/claudeBuiltinCommands.js';

/** Black-box copy of the (intentionally unexported) built-in URI scheme. */
const AGENT_BUILTIN_SCHEME = 'agent-builtin';

suite('claudeBuiltinCommands', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds a read-only Built-in skills container with agent-builtin children', () => {
		const container = buildClaudeBuiltinSkillsContainer(new Set());
		assert.ok(container, 'expected a built-in container');

		// Container is a non-writable Skill directory on the agent-builtin scheme.
		assert.strictEqual(container.type, CustomizationType.Directory);
		assert.strictEqual(container.contents, CustomizationType.Skill);
		assert.strictEqual(container.writable, false);
		assert.strictEqual(URI.parse(container.uri).scheme, AGENT_BUILTIN_SCHEME);

		const children = container.children ?? [];
		assert.ok(children.length > 0, 'expected built-in skills');
		for (const child of children) {
			const uri = URI.parse(child.uri);
			assert.strictEqual(child.type, CustomizationType.Skill);
			assert.strictEqual(uri.scheme, AGENT_BUILTIN_SCHEME, `child ${child.name} should use the agent-builtin scheme`);
			assert.strictEqual(uri.path, `/skill/${child.name}`, `child ${child.name} should be a /skill/<name> path`);
			assert.ok(child.description && child.description.length > 0, `child ${child.name} should have a description`);
		}

		// Names are unique.
		const names = children.map(c => c.name);
		assert.strictEqual(new Set(names).size, names.length, 'built-in command names should be unique');
	});

	test('curated container excludes built-ins that collide with a discovered disk skill', () => {
		const all = buildClaudeBuiltinSkillsContainer(new Set());
		const allNames = (all?.children ?? []).map(c => c.name);
		assert.ok(allNames.includes('init'), 'precondition: `init` is a curated built-in');

		// A disk skill named `init` must suppress the curated built-in of the
		// same name (the editable file wins), so it is never duplicated.
		const filtered = buildClaudeBuiltinSkillsContainer(new Set(['init']));
		const filteredNames = (filtered?.children ?? []).map(c => c.name);
		assert.ok(!filteredNames.includes('init'), '`init` should be excluded when on disk');
		assert.strictEqual(filteredNames.length, allNames.length - 1);
	});

	test('SDK container surfaces only commands not discovered on disk, carrying SDK descriptions', () => {
		const commands = [
			{ name: 'init', description: 'Initialize the project.', argumentHint: '' },
			{ name: 'my-skill', description: 'A user skill on disk.', argumentHint: '' },
			{ name: 'compact', description: 'Compact the context.', argumentHint: '' },
		];
		const container = buildSdkBuiltinSkillsContainer(commands, new Set(['my-skill']));
		assert.ok(container, 'expected a built-in container');

		assert.strictEqual(container.contents, CustomizationType.Skill);
		assert.strictEqual(container.writable, false);
		assert.strictEqual(URI.parse(container.uri).scheme, AGENT_BUILTIN_SCHEME);

		const children = container.children ?? [];
		// The on-disk skill is excluded; the two genuine runtime built-ins remain.
		const summary = children.map(child => {
			assert.strictEqual(child.type, CustomizationType.Skill);
			const uri = URI.parse(child.uri);
			assert.strictEqual(uri.scheme, AGENT_BUILTIN_SCHEME);
			assert.strictEqual(uri.path, `/skill/${child.name}`, `child ${child.name} should be a /skill/<name> path`);
			return { name: child.name, description: child.description };
		});
		assert.deepStrictEqual(summary, [
			{ name: 'init', description: 'Initialize the project.' },
			{ name: 'compact', description: 'Compact the context.' },
		]);
	});

	test('SDK container is undefined when every command is a known disk skill', () => {
		const commands = [{ name: 'a', description: 'A', argumentHint: '' }];
		assert.strictEqual(buildSdkBuiltinSkillsContainer(commands, new Set(['a'])), undefined);
	});

	test('SDK container dedupes commands by name, keeping the first', () => {
		const commands = [
			{ name: 'dup', description: 'first', argumentHint: '' },
			{ name: 'dup', description: 'second', argumentHint: '' },
		];
		const container = buildSdkBuiltinSkillsContainer(commands, new Set());
		assert.strictEqual(container?.children?.length, 1);
		const child = container?.children?.[0];
		assert.ok(child);
		assert.strictEqual(child.type, CustomizationType.Skill);
		assert.strictEqual(child.description, 'first');
	});
});
