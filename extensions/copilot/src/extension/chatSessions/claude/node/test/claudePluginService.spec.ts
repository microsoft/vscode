/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatPlugin, ChatSkill } from 'vscode';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { SKILLS_LOCATION_KEY } from '../../../../../platform/customInstructions/common/promptTypes';
import { INativeEnvService } from '../../../../../platform/env/common/envService';
import { NullNativeEnvService } from '../../../../../platform/env/common/nullEnvService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { MockPromptsService } from '../../../../../platform/promptFiles/test/common/mockPromptsService';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ClaudePluginService } from '../claudeSkills';
import { IPromptsService } from '../../../../../platform/promptFiles/common/promptsService';

const ClaudePluginServiceConstructor = ClaudePluginService as unknown as new (
	configurationService: IConfigurationService,
	envService: INativeEnvService,
	workspaceService: IWorkspaceService,
	promptsService: IPromptsService,
) => ClaudePluginService;

function createWorkspaceService(folders: URI[] = [URI.file('/workspace')]): IWorkspaceService {
	return {
		_serviceBrand: undefined,
		onDidChangeWorkspaceFolders: Event.None,
		getWorkspaceFolders: () => folders,
	} as unknown as IWorkspaceService;
}

function mockSkill(uri: string, name: string): ChatSkill {
	return { uri: URI.parse(uri), name } as ChatSkill;
}

function mockPlugin(uri: string): ChatPlugin {
	return { uri: URI.parse(uri) } as ChatPlugin;
}

describe('ClaudePluginService', () => {
	const disposables = new DisposableStore();
	let baseConfigurationService: IConfigurationService;

	beforeEach(() => {
		const services = disposables.add(createExtensionUnitTestingServices());
		const accessor = services.createTestingAccessor();
		baseConfigurationService = accessor.get(IConfigurationService);
	});

	afterEach(() => {
		disposables.clear();
	});

	function createService(options?: {
		configLocations?: Record<string, boolean>;
		workspaceFolders?: URI[];
		skills?: readonly ChatSkill[];
		plugins?: readonly ChatPlugin[];
		userHome?: URI;
	}): ClaudePluginService {
		const configService = new InMemoryConfigurationService(baseConfigurationService);
		if (options?.configLocations) {
			configService.setNonExtensionConfig(SKILLS_LOCATION_KEY, options.configLocations);
		}

		const envService = options?.userHome
			? new class extends NullNativeEnvService { override get userHome() { return options.userHome!; } }()
			: new NullNativeEnvService();

		const promptsService = disposables.add(new MockPromptsService());
		if (options?.skills) {
			promptsService.setSkills(options.skills);
		}
		if (options?.plugins) {
			promptsService.setPlugins(options.plugins);
		}

		const service = new ClaudePluginServiceConstructor(
			configService,
			envService,
			createWorkspaceService(options?.workspaceFolders),
			promptsService,
		);
		disposables.add(service);
		return service;
	}

	it('returns empty array when no config, no skills, and no plugins', async () => {
		const service = createService();
		expect(await service.getPluginLocations(CancellationToken.None)).toEqual([]);
	});

	// #region Config-based skill locations (walks one level up)

	it('walks one level up from config skill locations to get plugin roots', async () => {
		const service = createService({
			configLocations: { '/projects/my-extension/skills': true },
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/projects/my-extension');
	});

	it('resolves tilde paths from config and walks up', async () => {
		const service = createService({
			configLocations: { '~/skills': true },
			userHome: URI.file('/home/user'),
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/home/user');
	});

	it('resolves relative config paths per workspace folder and walks up', async () => {
		const service = createService({
			configLocations: { 'skills': true },
			workspaceFolders: [URI.file('/workspace1'), URI.file('/workspace2')],
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(2);
		expect(locations[0].path).toBe('/workspace1');
		expect(locations[1].path).toBe('/workspace2');
	});

	// #endregion

	// #region Skills from prompts service (walks three levels up from SKILL.md)

	it('derives plugin roots from SKILL.md URIs by walking three levels up', async () => {
		const service = createService({
			skills: [mockSkill('/plugins/my-plugin/skills/my-skill/SKILL.md', 'my-skill')],
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/plugins/my-plugin');
	});

	it('deduplicates skills from the same plugin root', async () => {
		const service = createService({
			skills: [
				mockSkill('/plugins/my-plugin/skills/skill-a/SKILL.md', 'skill-a'),
				mockSkill('/plugins/my-plugin/skills/skill-b/SKILL.md', 'skill-b'),
			],
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/plugins/my-plugin');
	});

	it('filters out non-file-scheme skills', async () => {
		const service = createService({
			skills: [mockSkill('copilot-skill:/remote/skills/my-skill/SKILL.md', 'remote')],
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(0);
	});

	it('filters out skills inside .claude directories', async () => {
		const service = createService({
			skills: [mockSkill('/projects/my-project/.claude/skills/my-skill/SKILL.md', 'my-skill')],
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(0);
	});

	// #endregion

	// #region Plugin roots from prompts service

	it('includes plugin roots from prompts service', async () => {
		const service = createService({
			plugins: [mockPlugin('/plugins/external-plugin')],
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/plugins/external-plugin');
	});

	it('filters out non-file-scheme plugins', async () => {
		const service = createService({
			plugins: [mockPlugin('copilot-plugin:/remote/plugin')],
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(0);
	});

	it('filters out plugins inside .claude directories', async () => {
		const service = createService({
			plugins: [mockPlugin('/projects/my-project/.claude')],
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(0);
	});

	// #endregion

	// #region Deduplication across all sources

	it('deduplicates across config locations, skills, and plugins', async () => {
		const service = createService({
			configLocations: { '/my-plugin/skills': true },
			skills: [mockSkill('/my-plugin/skills/skill-a/SKILL.md', 'skill-a')],
			plugins: [mockPlugin('/my-plugin')],
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/my-plugin');
	});

	it('combines distinct locations from all sources', async () => {
		const service = createService({
			configLocations: { '/config-plugin/skills': true },
			skills: [mockSkill('/skill-plugin/skills/my-skill/SKILL.md', 'my-skill')],
			plugins: [mockPlugin('/direct-plugin')],
		});
		const locations = await service.getPluginLocations(CancellationToken.None);
		const paths = locations.map(l => l.path);
		expect(paths).toContain('/config-plugin');
		expect(paths).toContain('/skill-plugin');
		expect(paths).toContain('/direct-plugin');
		expect(locations).toHaveLength(3);
	});

	// #endregion
});
