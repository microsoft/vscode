/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CustomizationType } from '../../../common/state/protocol/channels-session/state.js';
import { codexHooksToContainers, codexSkillsToContainers } from '../../../node/codex/codexCustomizations.js';
import type { HookMetadata } from '../../../node/codex/protocol/generated/v2/HookMetadata.js';
import type { SkillMetadata } from '../../../node/codex/protocol/generated/v2/SkillMetadata.js';
import type { SkillScope } from '../../../node/codex/protocol/generated/v2/SkillScope.js';
import type { SkillsListResponse } from '../../../node/codex/protocol/generated/v2/SkillsListResponse.js';

suite('codexCustomizations', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const skill = (name: string, scope: SkillScope, path: string, enabled = true): SkillMetadata =>
		({ name, description: `${name} desc`, path, scope, enabled });

	const skillsResponse = (...entries: { cwd: string; skills: SkillMetadata[] }[]): SkillsListResponse =>
		({ data: entries.map(e => ({ cwd: e.cwd, skills: e.skills, errors: [] })) });

	const hook = (key: string, eventName: HookMetadata['eventName'], sourcePath: string, displayOrder = 0, enabled = true): HookMetadata =>
		({ key, eventName, handlerType: 'command', matcher: null, command: 'echo hi', timeoutSec: 5n, statusMessage: null, sourcePath, source: 'project', pluginId: null, displayOrder: BigInt(displayOrder), enabled, isManaged: false, currentHash: 'h', trustStatus: 'trusted' });

	test('groups skills by scope into read-only containers, sorted by name', () => {
		const containers = codexSkillsToContainers(skillsResponse({
			cwd: '/repo',
			skills: [
				skill('beta', 'repo', '/repo/.agents/skills/beta/SKILL.md'),
				skill('alpha', 'repo', '/repo/.agents/skills/alpha/SKILL.md'),
				skill('gamma', 'user', '/home/.agents/skills/gamma/SKILL.md', false),
			],
		}));
		assert.deepStrictEqual(containers.map(c => ({
			name: c.name,
			contents: c.contents,
			writable: c.writable,
			children: c.children?.map(ch => ({ type: ch.type, name: ch.name, enabled: (ch as { enabled?: boolean }).enabled })),
		})), [
			{
				name: 'Repository', contents: CustomizationType.Skill, writable: false,
				children: [
					{ type: CustomizationType.Skill, name: 'alpha', enabled: true },
					{ type: CustomizationType.Skill, name: 'beta', enabled: true },
				],
			},
			{
				name: 'User', contents: CustomizationType.Skill, writable: false,
				children: [{ type: CustomizationType.Skill, name: 'gamma', enabled: false }],
			},
		]);
	});

	test('de-duplicates skills by path across cwd entries and orders scopes repo/user/system', () => {
		const dup = skill('shared', 'user', '/home/.agents/skills/shared/SKILL.md');
		const containers = codexSkillsToContainers(skillsResponse(
			{ cwd: '/a', skills: [dup, skill('sys', 'system', '/sys/imagegen/SKILL.md')] },
			{ cwd: '/b', skills: [dup] },
		));
		assert.deepStrictEqual(containers.map(c => [c.name, c.children?.length]), [['User', 1], ['Built-in', 1]]);
	});

	test('skill child uri is a file uri and id is stable', () => {
		const [container] = codexSkillsToContainers(skillsResponse({ cwd: '/r', skills: [skill('s', 'repo', '/r/.agents/skills/s/SKILL.md')] }));
		const child = container.children![0];
		assert.deepStrictEqual({ uriStartsWith: child.uri.toString().startsWith('file://'), sameId: child.id === codexSkillsToContainers(skillsResponse({ cwd: '/r', skills: [skill('s', 'repo', '/r/.agents/skills/s/SKILL.md')] }))[0].children![0].id }, { uriStartsWith: true, sameId: true });
	});

	test('empty / undefined skills responses yield no containers', () => {
		assert.deepStrictEqual([codexSkillsToContainers(undefined), codexSkillsToContainers(skillsResponse()), codexSkillsToContainers(skillsResponse({ cwd: '/x', skills: [] }))], [[], [], []]);
	});

	test('hooks project into a single container, de-duped by key and ordered by displayOrder', () => {
		const containers = codexHooksToContainers({
			data: [{
				cwd: '/repo',
				hooks: [
					hook('k2', 'postToolUse', '/repo/.codex/config.toml', 2),
					hook('k1', 'preToolUse', '/repo/.codex/config.toml', 1, false),
					hook('k1', 'preToolUse', '/repo/.codex/config.toml', 1),
				],
				warnings: [],
				errors: [],
			}],
		});
		assert.deepStrictEqual(containers.map(c => ({
			name: c.name, contents: c.contents, writable: c.writable,
			children: c.children?.map(ch => ({ type: ch.type, name: ch.name, enabled: (ch as { enabled?: boolean }).enabled })),
		})), [{
			name: 'Hooks', contents: CustomizationType.Hook, writable: false,
			children: [
				{ type: CustomizationType.Hook, name: 'preToolUse', enabled: false },
				{ type: CustomizationType.Hook, name: 'postToolUse', enabled: true },
			],
		}]);
	});

	test('empty / undefined hooks responses yield no containers', () => {
		assert.deepStrictEqual([codexHooksToContainers(undefined), codexHooksToContainers({ data: [] }), codexHooksToContainers({ data: [{ cwd: '/x', hooks: [], warnings: [], errors: [] }] })], [[], [], []]);
	});
});
