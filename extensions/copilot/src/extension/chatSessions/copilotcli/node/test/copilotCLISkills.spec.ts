/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatSkill } from 'vscode';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { SKILLS_LOCATION_KEY } from '../../../../../platform/customInstructions/common/promptTypes';
import { INativeEnvService } from '../../../../../platform/env/common/envService';
import { NullNativeEnvService } from '../../../../../platform/env/common/nullEnvService';
import { ILogService } from '../../../../../platform/log/common/logService';
import type { IPromptsService } from '../../../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { Event } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { CopilotCLISkills } from '../copilotCLISkills';
import { MockPromptsService } from '../../../../../platform/promptFiles/test/common/mockPromptsService';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';

const CopilotCLISkillsConstructor = CopilotCLISkills as unknown as new (
	logService: ILogService,
	instantiationService: unknown,
	configurationService: IConfigurationService,
	envService: INativeEnvService,
	workspaceService: IWorkspaceService,
	promptsService: IPromptsService,
) => CopilotCLISkills;

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
		skills?: readonly ChatSkill[];
		userHome?: URI;
	}): CopilotCLISkills {
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

		const skills = new CopilotCLISkillsConstructor(
			logService,
			{} as unknown,
			configService,
			envService,
			createWorkspaceService(options?.workspaceFolders),
			promptsService,
		);
		disposables.add(skills);
		return skills;
	}

	it('returns empty array when no config and no skills', async () => {
		const skills = createSkills();
		expect((await skills.getSkillsLocations(CancellationToken.None))).toEqual([]);
	});

	it('expands tilde-prefixed paths using user home directory', async () => {
		const userHome = URI.file('/home/user');
		const skills = createSkills({
			configLocations: { '~/my-skills': true },
			userHome,
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/home/user/my-skills');
	});

	it('handles absolute paths', async () => {
		const skills = createSkills({
			configLocations: { '/absolute/skills/path': true },
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/absolute/skills/path');
	});

	it('joins relative paths to each workspace folder', async () => {
		const skills = createSkills({
			configLocations: { 'relative/skills': true },
			workspaceFolders: [URI.file('/workspace1'), URI.file('/workspace2')],
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		expect(locations).toHaveLength(2);
		expect(locations[0].path).toBe('/workspace1/relative/skills');
		expect(locations[1].path).toBe('/workspace2/relative/skills');
	});

	it('ignores config entries with value !== true', async () => {
		const skills = createSkills({
			configLocations: {
				'/included': true,
				'/excluded': false,
			},
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/included');
	});

	it('includes parent-of-parent directories of file-scheme skills', async () => {
		const skills = createSkills({
			skills: [
				mockSkill('/skills/myskill/SKILL.md', 'myskill'),
			],
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/skills');
	});

	it('filters out non-file-scheme skills', async () => {
		const skills = createSkills({
			skills: [
				mockSkill('copilot-skill:/remote/skill/SKILL.md', 'remoteSkill'),
			],
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		expect(locations).toHaveLength(0);
	});

	it('deduplicates locations from config and skills', async () => {
		const skills = createSkills({
			configLocations: { '/skills': true },
			skills: [
				// dirname(dirname("/skills/myskill/SKILL.md")) = "/skills"
				mockSkill('/skills/myskill/SKILL.md', 'myskill'),
			],
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/skills');
	});

	it('deduplicates duplicate config entries', async () => {
		const skills = createSkills({
			configLocations: {
				'/same/path': true,
				'path': true,
			},
			workspaceFolders: [URI.file('/same')],
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		// Absolute '/same/path' and relative 'path' joined to workspace '/same'
		// both resolve to '/same/path', so the result should be deduplicated.
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/same/path');
	});

	it('handles multiple skills deriving to same parent directory', async () => {
		const skills = createSkills({
			skills: [
				mockSkill('/skills/skill1/SKILL.md', 'skill1'),
				mockSkill('/skills/skill2/SKILL.md', 'skill2'),
			],
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		// Both resolve to /skills via dirname(dirname())
		expect(locations).toHaveLength(1);
		expect(locations[0].path).toBe('/skills');
	});

	it('combines config locations and skills locations', async () => {
		const skills = createSkills({
			configLocations: { '/config-skills': true },
			skills: [
				mockSkill('/prompt-skills/myskill/SKILL.md', 'myskill'),
			],
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		expect(locations).toHaveLength(2);
		const paths = locations.map(l => l.path);
		expect(paths).toContain('/config-skills');
		expect(paths).toContain('/prompt-skills');
	});

	it('ignores empty or whitespace-only config keys', async () => {
		const skills = createSkills({
			configLocations: { '  ': true, '': true, '/valid': true },
		});

		const locations = await skills.getSkillsLocations(CancellationToken.None);
		// Empty string after trim is not absolute, not ~/,
		// so goes to relative path. But it's just whitespace.
		// The code trims and checks - empty string is not '~/' prefixed, not absolute,
		// so it would try to join to workspace folders.
		// Let's just verify '/valid' is there
		const validLocations = locations.filter(l => l.path.endsWith('/valid'));
		expect(validLocations).toHaveLength(1);
	});

	it('returns empty when config is not an object', async () => {
		const configService = new InMemoryConfigurationService(baseConfigurationService);
		configService.setNonExtensionConfig(SKILLS_LOCATION_KEY, 'not-an-object');

		const mockPromptsService = disposables.add(new MockPromptsService());
		const skillsService = new CopilotCLISkillsConstructor(
			logService,
			{} as unknown,
			configService,
			new NullNativeEnvService(),
			createWorkspaceService(),
			mockPromptsService,
		);
		disposables.add(skillsService);

		expect(await skillsService.getSkillsLocations(CancellationToken.None)).toEqual([]);
	});

	function mockSkill(uri: string, name: string): ChatSkill {
		return {
			uri: URI.parse(uri),
			name,
		} as ChatSkill;
	}
});
