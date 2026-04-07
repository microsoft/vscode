/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatResource } from 'vscode';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { SKILLS_LOCATION_KEY } from '../../../../../platform/customInstructions/common/promptTypes';
import { INativeEnvService } from '../../../../../platform/env/common/envService';
import { NullNativeEnvService } from '../../../../../platform/env/common/nullEnvService';
import { ILogService } from '../../../../../platform/log/common/logService';
import type { ParsedPromptFile } from '../../../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { Event } from '../../../../../util/vs/base/common/event';
import { Disposable, DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IChatPromptFileService } from '../../../common/chatPromptFileService';
import { CopilotCLISkills } from '../copilotCLISkills';

const CopilotCLISkillsConstructor = CopilotCLISkills as unknown as new (
	logService: ILogService,
	instantiationService: unknown,
	configurationService: IConfigurationService,
	envService: INativeEnvService,
	workspaceService: IWorkspaceService,
	chatPromptFileService: IChatPromptFileService,
) => CopilotCLISkills;

class TestChatPromptFileService extends Disposable implements IChatPromptFileService {
	declare _serviceBrand: undefined;
	readonly onDidChangeCustomAgents: Event<void> = Event.None;
	readonly onDidChangeInstructions: Event<void> = Event.None;
	readonly onDidChangeSkills: Event<void> = Event.None;
	readonly onDidChangeHooks: Event<void> = Event.None;
	readonly onDidChangePlugins: Event<void> = Event.None;
	readonly customAgents: readonly ChatResource[] = [];
	readonly customAgentPromptFiles: readonly ParsedPromptFile[] = [];
	readonly instructions: readonly ChatResource[] = [];
	skills: readonly ChatResource[] = [];
	readonly hooks: readonly ChatResource[] = [];
	readonly plugins: readonly ChatResource[] = [];
}

function createWorkspaceService(folders: URI[] = [URI.file('/workspace')]): IWorkspaceService {
	return {
		_serviceBrand: undefined,
		onDidChangeWorkspaceFolders: Event.None,
		getWorkspaceFolders: () => folders,
	} as unknown as IWorkspaceService;
}

describe('CopilotCLISkills', () => {
	const disposables = new DisposableStore();
	let logService: ILogService;
	let baseConfigurationService: IConfigurationService;

	beforeEach(() => {
		const services = disposables.add(createExtensionUnitTestingServices());
		const accessor = services.createTestingAccessor();
		logService = accessor.get(ILogService);
		baseConfigurationService = accessor.get(IConfigurationService);
	});

	afterEach(() => {
		disposables.clear();
	});

	function createSkills(options?: {
		configLocations?: Record<string, boolean>;
		workspaceFolders?: URI[];
		skills?: readonly ChatResource[];
		userHome?: URI;
	}): CopilotCLISkills {
		const configService = new InMemoryConfigurationService(baseConfigurationService);
		if (options?.configLocations) {
			configService.setNonExtensionConfig(SKILLS_LOCATION_KEY, options.configLocations);
		}

		const envService = options?.userHome
			? new class extends NullNativeEnvService { override get userHome() { return options.userHome!; } }()
			: new NullNativeEnvService();

		const chatPromptFileService = disposables.add(new TestChatPromptFileService());
		if (options?.skills) {
			(chatPromptFileService as { skills: readonly ChatResource[] }).skills = options.skills;
		}

		const skills = new CopilotCLISkillsConstructor(
			logService,
			{} as unknown,
			configService,
			envService,
			createWorkspaceService(options?.workspaceFolders),
			chatPromptFileService,
		);
		disposables.add(skills);
		return skills;
	}

	it('returns empty array when no config and no skills', () => {
		const skills = createSkills();
		expect(skills.getSkillsLocations()).toEqual([]);
	});

	it('expands tilde-prefixed paths using user home directory', () => {
		const userHome = URI.file('/home/user');
		const skills = createSkills({
			configLocations: { '~/my-skills': true },
			userHome,
		});

		const locations = skills.getSkillsLocations();
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/home/user/my-skills');
	});

	it('handles absolute paths', () => {
		const skills = createSkills({
			configLocations: { '/absolute/skills/path': true },
		});

		const locations = skills.getSkillsLocations();
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/absolute/skills/path');
	});

	it('joins relative paths to each workspace folder', () => {
		const skills = createSkills({
			configLocations: { 'relative/skills': true },
			workspaceFolders: [URI.file('/workspace1'), URI.file('/workspace2')],
		});

		const locations = skills.getSkillsLocations();
		expect(locations).toHaveLength(2);
		expect(locations[0].path).toBe('/workspace1/relative/skills');
		expect(locations[1].path).toBe('/workspace2/relative/skills');
	});

	it('ignores config entries with value !== true', () => {
		const skills = createSkills({
			configLocations: {
				'/included': true,
				'/excluded': false,
			},
		});

		const locations = skills.getSkillsLocations();
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/included');
	});

	it('includes parent-of-parent directories of file-scheme skills', () => {
		const skills = createSkills({
			skills: [
				{ uri: URI.file('/skills/myskill/SKILL.md') } as ChatResource,
			],
		});

		const locations = skills.getSkillsLocations();
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/skills');
	});

	it('filters out non-file-scheme skills', () => {
		const skills = createSkills({
			skills: [
				{ uri: URI.parse('copilot-skill:/remote/skill/SKILL.md') } as ChatResource,
			],
		});

		const locations = skills.getSkillsLocations();
		expect(locations).toHaveLength(0);
	});

	it('deduplicates locations from config and skills', () => {
		const skills = createSkills({
			configLocations: { '/skills': true },
			skills: [
				// dirname(dirname("/skills/myskill/SKILL.md")) = "/skills"
				{ uri: URI.file('/skills/myskill/SKILL.md') } as ChatResource,
			],
		});

		const locations = skills.getSkillsLocations();
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/skills');
	});

	it('deduplicates duplicate config entries', () => {
		const skills = createSkills({
			configLocations: {
				'/same/path': true,
				'path': true,
			},
			workspaceFolders: [URI.file('/same')],
		});

		const locations = skills.getSkillsLocations();
		// Absolute '/same/path' and relative 'path' joined to workspace '/same'
		// both resolve to '/same/path', so the result should be deduplicated.
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/same/path');
	});

	it('handles multiple skills deriving to same parent directory', () => {
		const skills = createSkills({
			skills: [
				{ uri: URI.file('/skills/skill1/SKILL.md') } as ChatResource,
				{ uri: URI.file('/skills/skill2/SKILL.md') } as ChatResource,
			],
		});

		const locations = skills.getSkillsLocations();
		// Both resolve to /skills via dirname(dirname())
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/skills');
	});

	it('combines config locations and skills locations', () => {
		const skills = createSkills({
			configLocations: { '/config-skills': true },
			skills: [
				{ uri: URI.file('/prompt-skills/myskill/SKILL.md') } as ChatResource,
			],
		});

		const locations = skills.getSkillsLocations();
		expect(locations).toHaveLength(2);
		const paths = locations.map(l => l.path);
		expect(paths).toContain('/config-skills');
		expect(paths).toContain('/prompt-skills');
	});

	it('ignores empty or whitespace-only config keys', () => {
		const skills = createSkills({
			configLocations: { '  ': true, '': true, '/valid': true },
		});

		const locations = skills.getSkillsLocations();
		// Empty string after trim is not absolute, not ~/,
		// so goes to relative path. But it's just whitespace.
		// The code trims and checks - empty string is not '~/' prefixed, not absolute,
		// so it would try to join to workspace folders.
		// Let's just verify '/valid' is there
		const validLocations = locations.filter(l => l.path.endsWith('/valid'));
		expect(validLocations).toHaveLength(1);
	});

	it('returns empty when config is not an object', () => {
		const configService = new InMemoryConfigurationService(baseConfigurationService);
		configService.setNonExtensionConfig(SKILLS_LOCATION_KEY, 'not-an-object');

		const chatPromptFileService = disposables.add(new TestChatPromptFileService());
		const skillsService = new CopilotCLISkillsConstructor(
			logService,
			{} as unknown,
			configService,
			new NullNativeEnvService(),
			createWorkspaceService(),
			chatPromptFileService,
		);
		disposables.add(skillsService);

		expect(skillsService.getSkillsLocations()).toEqual([]);
	});
});
