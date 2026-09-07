/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { sep } from '../../../../../base/common/path.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { CustomizationType } from '../../../common/state/protocol/channels-session/state.js';
import { codexHooksToContainers, codexSelectedCapabilityRootCandidates, codexSkillsToContainers, discoverCodexWorkspaceAgents, discoverCodexWorkspaceInstructions, discoverCodexWorkspaceSkills } from '../../../node/codex/codexCustomizations.js';
import type { HookMetadata } from '../../../node/codex/protocol/generated/v2/HookMetadata.js';
import type { SkillMetadata } from '../../../node/codex/protocol/generated/v2/SkillMetadata.js';
import type { SkillScope } from '../../../node/codex/protocol/generated/v2/SkillScope.js';
import type { SkillsListResponse } from '../../../node/codex/protocol/generated/v2/SkillsListResponse.js';

suite('codexCustomizations', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	const skill = (name: string, scope: SkillScope, path: string, enabled = true): SkillMetadata =>
		({ name, description: `${name} desc`, path, scope, enabled });

	const skillsResponse = (...entries: { cwd: string; skills: SkillMetadata[] }[]): SkillsListResponse =>
		({ data: entries.map(e => ({ cwd: e.cwd, skills: e.skills, errors: [] })) });

	const hook = (key: string, eventName: HookMetadata['eventName'], sourcePath: string, displayOrder = 0, enabled = true): HookMetadata =>
		({ key, eventName, handlerType: 'command', matcher: null, command: 'echo hi', async: false, timeoutSec: 5n, statusMessage: null, additionalContextLimit: null, sourcePath, source: 'project', pluginId: null, displayOrder: BigInt(displayOrder), enabled, isManaged: false, currentHash: 'h', trustStatus: 'trusted' });

	test('discovers workspace agents without client-pushed local customizations', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
		const agentsDirectory = URI.joinPath(workspace, '.github', 'agents');
		const agent = URI.joinPath(agentsDirectory, 'reviewer.agent.md');
		await fileService.createFolder(agentsDirectory);
		await Promise.all([
			fileService.writeFile(agent, VSBuffer.fromString('---\nname: Reviewer\ndescription: Reviews carefully\nmodel: [gpt-first, gpt-second]\ntools: [read_file, search]\ninfer: true\ndisable-model-invocation: true\n---\nReview every change.')),
			fileService.writeFile(URI.joinPath(agentsDirectory, 'README.md'), VSBuffer.fromString('---\nname: Reviewer\n---\nDocumentation only.')),
		]);

		const discovered = await discoverCodexWorkspaceAgents([workspace], fileService);

		assert.deepStrictEqual({
			agents: discovered.agents.map(item => ({ name: item.name, uri: item.uri.toString(), agentInvocable: item.disableModelInvocation !== true })),
			containers: discovered.containers.map(container => ({
				uri: container.uri,
				contents: container.contents,
				writable: container.writable,
				children: container.children?.map(child => ({ name: child.name, uri: child.uri, model: child.type === CustomizationType.Agent ? child.model : undefined, tools: child.type === CustomizationType.Agent ? child.tools : undefined })),
			})),
		}, {
			agents: [{ name: 'Reviewer', uri: agent.toString(), agentInvocable: true }],
			containers: [{
				uri: agentsDirectory.toString(),
				contents: CustomizationType.Agent,
				writable: true,
				children: [{ name: 'Reviewer', uri: agent.toString(), model: 'gpt-first', tools: ['read_file', 'search'] }],
			}],
		});
	});

	test('discovers every workspace root with primary-root name precedence', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const primaryWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/primary' });
		const secondaryWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/secondary' });
		const primaryDirectory = URI.joinPath(primaryWorkspace, '.github', 'agents');
		const secondaryDirectory = URI.joinPath(secondaryWorkspace, '.github', 'agents');
		const primaryAgent = URI.joinPath(primaryDirectory, 'reviewer.agent.md');
		const secondaryAgent = URI.joinPath(secondaryDirectory, 'reviewer.agent.md');
		const secondaryOnlyAgent = URI.joinPath(secondaryDirectory, 'secondary.agent.md');
		await Promise.all([
			fileService.createFolder(primaryDirectory),
			fileService.createFolder(secondaryDirectory),
		]);
		await Promise.all([
			fileService.writeFile(primaryAgent, VSBuffer.fromString('---\nname: Shared Reviewer\n---\nUse the primary workspace instructions.')),
			fileService.writeFile(secondaryAgent, VSBuffer.fromString('---\nname: Shared Reviewer\n---\nDo not use the duplicate.')),
			fileService.writeFile(secondaryOnlyAgent, VSBuffer.fromString('---\nname: Secondary Agent\n---\nUse the secondary workspace instructions.')),
		]);

		const discovered = await discoverCodexWorkspaceAgents([primaryWorkspace, secondaryWorkspace, primaryWorkspace], fileService);

		assert.deepStrictEqual({
			agents: discovered.agents.map(agent => ({ name: agent.name, uri: agent.uri.toString() })),
			containers: discovered.containers.map(container => ({
				uri: container.uri,
				children: container.children?.map(child => ({ name: child.name, uri: child.uri })),
			})),
		}, {
			agents: [
				{ name: 'Shared Reviewer', uri: primaryAgent.toString() },
				{ name: 'Secondary Agent', uri: secondaryOnlyAgent.toString() },
			],
			containers: [
				{ uri: primaryDirectory.toString(), children: [{ name: 'Shared Reviewer', uri: primaryAgent.toString() }] },
				{ uri: secondaryDirectory.toString(), children: [{ name: 'Secondary Agent', uri: secondaryOnlyAgent.toString() }] },
			],
		});
	});

	test('discovers GitHub workspace skills and preserves invocation metadata', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
		const directory = URI.joinPath(workspace, '.github', 'skills');
		const skillUri = URI.joinPath(directory, 'website', 'SKILL.md');
		await Promise.all([
			fileService.writeFile(skillUri, VSBuffer.fromString('---\nname: standalone-html-website\ndescription: Builds a self-contained website\nuser-invocable: false\ndisable-model-invocation: true\n---\nInclude the required footer.')),
			fileService.writeFile(URI.joinPath(directory, 'SKILL.md'), VSBuffer.fromString('Not a skill directory.')),
			fileService.writeFile(URI.joinPath(workspace, 'SKILL.md'), VSBuffer.fromString('Not a workspace skill.')),
			fileService.writeFile(URI.joinPath(workspace, '.agents', 'skills', 'native', 'SKILL.md'), VSBuffer.fromString('Already discovered by Codex.')),
		]);

		const containers = await discoverCodexWorkspaceSkills([workspace, workspace], fileService);

		assert.deepStrictEqual(containers.map(container => ({
			uri: container.uri,
			contents: container.contents,
			writable: container.writable,
			children: container.children?.map(child => child.type === CustomizationType.Skill ? {
				name: child.name,
				description: child.description,
				uri: child.uri,
				disableUserInvocation: child.disableUserInvocation,
				disableModelInvocation: child.disableModelInvocation,
			} : undefined),
		})), [{
			uri: directory.toString(),
			contents: CustomizationType.Skill,
			writable: true,
			children: [{
				name: 'standalone-html-website',
				description: 'Builds a self-contained website',
				uri: skillUri.toString(),
				disableUserInvocation: true,
				disableModelInvocation: true,
			}],
		}]);
	});

	test('discovers workspace skills across roots with primary-root name precedence', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const primary = URI.from({ scheme: Schemas.inMemory, path: '/primary' });
		const secondary = URI.from({ scheme: Schemas.inMemory, path: '/secondary' });
		const primarySkill = URI.joinPath(primary, '.github', 'skills', 'shared', 'SKILL.md');
		const secondarySkill = URI.joinPath(secondary, '.github', 'skills', 'extra', 'SKILL.md');
		await Promise.all([
			fileService.writeFile(primarySkill, VSBuffer.fromString('---\nname: shared\ndescription: Primary skill\n---\nUse the primary workspace.')),
			fileService.writeFile(URI.joinPath(secondary, '.github', 'skills', 'shared', 'SKILL.md'), VSBuffer.fromString('---\nname: shared\ndescription: Duplicate skill\n---\nDo not use the duplicate.')),
			fileService.writeFile(secondarySkill, VSBuffer.fromString('---\nname: extra\ndescription: Secondary skill\n---\nUse the secondary workspace.')),
		]);

		const containers = await discoverCodexWorkspaceSkills([primary, secondary, primary], fileService);

		assert.deepStrictEqual(containers.map(container => ({
			uri: container.uri,
			children: container.children?.map(child => ({ name: child.name, uri: child.uri })),
		})), [
			{ uri: URI.joinPath(primary, '.github', 'skills').toString(), children: [{ name: 'shared', uri: primarySkill.toString() }] },
			{ uri: URI.joinPath(secondary, '.github', 'skills').toString(), children: [{ name: 'extra', uri: secondarySkill.toString() }] },
		]);
	});

	test('workspace skill name precedence is independent of directory and read order', async () => {
		const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
		const directory = URI.joinPath(workspace, '.github', 'skills');
		const firstSkill = URI.joinPath(directory, 'a-first', 'SKILL.md');
		const lastSkill = URI.joinPath(directory, 'z-last', 'SKILL.md');
		const firstReadStarted = new DeferredPromise<void>();
		const lastReadFinished = new DeferredPromise<void>();
		const releaseFirstRead = new DeferredPromise<void>();
		const fileService = disposables.add(new class extends FileService {
			override async readFile(resource: URI) {
				if (resource.toString() === firstSkill.toString()) {
					firstReadStarted.complete();
					await releaseFirstRead.p;
				}
				const result = await super.readFile(resource);
				if (resource.toString() === lastSkill.toString()) {
					lastReadFinished.complete();
				}
				return result;
			}
		}(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(lastSkill, VSBuffer.fromString('---\nname: shared\ndescription: Last skill\n---\nDo not use the duplicate.'));
		await fileService.writeFile(firstSkill, VSBuffer.fromString('---\nname: shared\ndescription: First skill\nuser-invocable: false\ndisable-model-invocation: true\n---\nUse this skill.'));

		const discovery = discoverCodexWorkspaceSkills([workspace], fileService);
		try {
			await Promise.all([firstReadStarted.p, lastReadFinished.p]);
			await new Promise<void>(resolve => setImmediate(resolve));
		} finally {
			releaseFirstRead.complete();
		}
		const containers = await discovery;

		assert.deepStrictEqual(containers.flatMap(container => container.children ?? [])
			.filter(child => child.type === CustomizationType.Skill)
			.map(skill => ({
				name: skill.name,
				uri: skill.uri,
				description: skill.description,
				disableUserInvocation: skill.disableUserInvocation,
				disableModelInvocation: skill.disableModelInvocation,
			})), [{
				name: 'shared',
				uri: firstSkill.toString(),
				description: 'First skill',
				disableUserInvocation: true,
				disableModelInvocation: true,
			}]);
	});

	test('ignores missing and non-directory workspace skill roots', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
		await fileService.writeFile(URI.joinPath(workspace, '.github', 'skills'), VSBuffer.fromString('Not a directory.'));

		assert.deepStrictEqual(await discoverCodexWorkspaceSkills([workspace, URI.from({ scheme: Schemas.inMemory, path: '/missing' })], fileService), []);
	});

	test('surfaces each workspace root AGENTS.md as an always-on rule', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
		await fileService.createFolder(workspace);
		await Promise.all([
			fileService.writeFile(URI.joinPath(workspace, 'AGENTS.md'), VSBuffer.fromString('Use workspace instructions.')),
			fileService.writeFile(URI.joinPath(workspace, 'CLAUDE.md'), VSBuffer.fromString('Not loaded by Codex.')),
		]);

		const containers = await discoverCodexWorkspaceInstructions([workspace, workspace], fileService);

		assert.deepStrictEqual(containers.map(container => ({
			uri: container.uri,
			contents: container.contents,
			writable: container.writable,
			children: container.children?.map(child => ({ type: child.type, name: child.name, uri: child.uri, alwaysApply: child.type === CustomizationType.Rule ? child.alwaysApply : undefined })),
		})), [{
			uri: workspace.toString(),
			contents: CustomizationType.Rule,
			writable: false,
			children: [{ type: CustomizationType.Rule, name: 'AGENTS.md', uri: URI.joinPath(workspace, 'AGENTS.md').toString(), alwaysApply: true }],
		}]);
	});

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

	test('builds both secondary skill conventions in workspace order', () => {
		const rootA = URI.file('/workspace/a');
		const rootB = URI.file('/workspace/b');
		const rootC = URI.file('/workspace/c');

		assert.deepStrictEqual(
			codexSelectedCapabilityRootCandidates([rootA, rootB, rootC]).map(root => root.location.path),
			[
				URI.joinPath(rootB, '.agents', 'skills').fsPath,
				URI.joinPath(rootB, '.codex', 'skills').fsPath,
				URI.joinPath(rootC, '.agents', 'skills').fsPath,
				URI.joinPath(rootC, '.codex', 'skills').fsPath,
			],
		);
	});

	test('excludes primary-equivalent and duplicate secondary roots', () => {
		const rootA = URI.file('/workspace/a');
		const rootB = URI.file('/workspace/b');
		const primaryEquivalent = URI.file(`${rootA.fsPath}${sep}`);
		const duplicateB = URI.file(`${rootB.fsPath}${sep}`);
		const caseVariantA = URI.file(rootA.fsPath.toUpperCase());
		const caseVariantB = URI.file(rootB.fsPath.toUpperCase());

		const candidates = codexSelectedCapabilityRootCandidates([
			rootA,
			primaryEquivalent,
			...(!isLinux ? [caseVariantA] : []),
			rootB,
			duplicateB,
			...(!isLinux ? [caseVariantB] : []),
		]);

		assert.deepStrictEqual(candidates.map(root => root.location.path), [
			URI.joinPath(rootB, '.agents', 'skills').fsPath,
			URI.joinPath(rootB, '.codex', 'skills').fsPath,
		]);
	});

	test('rejects non-file secondary roots', () => {
		const rootA = URI.file('/workspace/a');

		assert.deepStrictEqual(codexSelectedCapabilityRootCandidates([
			rootA,
			URI.from({ scheme: Schemas.vscodeRemote, authority: 'host', path: '/workspace/b' }),
		]), []);
	});

	test('produces stable versioned ids for equivalent roots and distinct conventions', () => {
		const rootA = URI.file('/workspace/a');
		const rootB = URI.file('/workspace/b');
		const rootC = URI.file('/workspace/c');
		const first = codexSelectedCapabilityRootCandidates([rootA, rootB]);
		const second = codexSelectedCapabilityRootCandidates([rootA, URI.file(`${rootB.fsPath}${sep}`)]);
		const distinctRoot = codexSelectedCapabilityRootCandidates([rootA, rootC]);

		assert.deepStrictEqual({
			firstIds: first.map(root => root.id),
			secondIds: second.map(root => root.id),
			versioned: first.every(root => /^codex-selected-capability-root-v1-[0-9a-f]{64}$/.test(root.id)),
			distinctConventions: first[0].id !== first[1].id,
			distinctRoots: first[0].id !== distinctRoot[0].id,
		}, {
			firstIds: second.map(root => root.id),
			secondIds: second.map(root => root.id),
			versioned: true,
			distinctConventions: true,
			distinctRoots: true,
		});
	});
});
