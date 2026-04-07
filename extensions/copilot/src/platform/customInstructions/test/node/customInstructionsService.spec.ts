/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IConfigurationService } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { createPlatformServices, ITestingServicesAccessor } from '../../../test/node/services';
import { TestWorkspaceService } from '../../../test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../workspace/common/workspaceService';
import { ICustomInstructionsService } from '../../common/customInstructionsService';

suite('CustomInstructionsService - Skills', () => {
	let accessor: ITestingServicesAccessor;
	let customInstructionsService: ICustomInstructionsService;
	let configService: InMemoryConfigurationService;

	beforeEach(async () => {
		const services = createPlatformServices();

		// Setup workspace with a workspace folder
		const workspaceFolders = [URI.file('/workspace')];
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[workspaceFolders, []]
		));

		// Create a configuration service that allows setting values
		configService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		services.define(IConfigurationService, configService);

		// Enable the agent skills setting
		await configService.setNonExtensionConfig('chat.useAgentSkills', true);

		accessor = services.createTestingAccessor();
		customInstructionsService = accessor.get(ICustomInstructionsService);
	});

	afterEach(() => {
		accessor?.dispose();
	});

	suite('getSkillInfo', () => {
		test('should return skill info for file in .github/skills folder', () => {
			const skillFileUri = URI.file('/workspace/.github/skills/myskill/SKILL.md');
			const skillInfo = customInstructionsService.getSkillInfo(skillFileUri);

			expect(skillInfo).toBeDefined();
			expect(skillInfo?.skillName).toBe('myskill');
			expect(skillInfo?.skillFolderUri.toString()).toBe(URI.file('/workspace/.github/skills/myskill').toString());
		});

		test('should return skill info for file in .claude/skills folder', () => {
			const skillFileUri = URI.file('/workspace/.claude/skills/myskill/SKILL.md');
			const skillInfo = customInstructionsService.getSkillInfo(skillFileUri);

			expect(skillInfo).toBeDefined();
			expect(skillInfo?.skillName).toBe('myskill');
			expect(skillInfo?.skillFolderUri.toString()).toBe(URI.file('/workspace/.claude/skills/myskill').toString());
		});

		test('should return skill info for nested file in skill folder', () => {
			const skillFileUri = URI.file('/workspace/.github/skills/myskill/subfolder/helper.ts');
			const skillInfo = customInstructionsService.getSkillInfo(skillFileUri);

			expect(skillInfo).toBeDefined();
			expect(skillInfo?.skillName).toBe('myskill');
			expect(skillInfo?.skillFolderUri.toString()).toBe(URI.file('/workspace/.github/skills/myskill').toString());
		});

		test('should return undefined for non-skill file', () => {
			const regularFileUri = URI.file('/workspace/src/file.ts');
			const skillInfo = customInstructionsService.getSkillInfo(regularFileUri);

			expect(skillInfo).toBeUndefined();
		});

		test('should return undefined when useAgentSkills setting is disabled', async () => {
			// Disable the setting
			await configService.setNonExtensionConfig('chat.useAgentSkills', false);

			const skillFileUri = URI.file('/workspace/.github/skills/myskill/SKILL.md');
			const skillInfo = customInstructionsService.getSkillInfo(skillFileUri);

			expect(skillInfo).toBeUndefined();
		});

		test('should return skill info for skill with hyphenated name', () => {
			const skillFileUri = URI.file('/workspace/.github/skills/my-skill-name/SKILL.md');
			const skillInfo = customInstructionsService.getSkillInfo(skillFileUri);

			expect(skillInfo).toBeDefined();
			expect(skillInfo?.skillName).toBe('my-skill-name');
		});
	});

	suite('isSkillFile', () => {
		test('should return true for file in skill folder', () => {
			const skillFileUri = URI.file('/workspace/.github/skills/myskill/SKILL.md');
			expect(customInstructionsService.isSkillFile(skillFileUri)).toBe(true);
		});

		test('should return true for nested file in skill folder', () => {
			const skillFileUri = URI.file('/workspace/.github/skills/myskill/subfolder/code.ts');
			expect(customInstructionsService.isSkillFile(skillFileUri)).toBe(true);
		});

		test('should return false for non-skill file', () => {
			const regularFileUri = URI.file('/workspace/src/file.ts');
			expect(customInstructionsService.isSkillFile(regularFileUri)).toBe(false);
		});

		test('should return false when useAgentSkills setting is disabled', async () => {
			await configService.setNonExtensionConfig('chat.useAgentSkills', false);

			const skillFileUri = URI.file('/workspace/.github/skills/myskill/SKILL.md');
			expect(customInstructionsService.isSkillFile(skillFileUri)).toBe(false);
		});

		test('should return true for file in .claude/skills folder', () => {
			const skillFileUri = URI.file('/workspace/.claude/skills/test/file.ts');
			expect(customInstructionsService.isSkillFile(skillFileUri)).toBe(true);
		});
	});

	suite('isSkillMdFile', () => {
		test('should return true for SKILL.md in skill folder', () => {
			const skillMdUri = URI.file('/workspace/.github/skills/myskill/SKILL.md');
			expect(customInstructionsService.isSkillMdFile(skillMdUri)).toBe(true);
		});

		test('should return true for skill.md with lowercase', () => {
			const skillMdUri = URI.file('/workspace/.github/skills/myskill/skill.md');
			expect(customInstructionsService.isSkillMdFile(skillMdUri)).toBe(true);
		});

		test('should return true for mixed case sKiLl.Md', () => {
			const skillMdUri = URI.file('/workspace/.github/skills/myskill/sKiLl.Md');
			expect(customInstructionsService.isSkillMdFile(skillMdUri)).toBe(true);
		});

		test('should return false for other .md files in skill folder', () => {
			const otherMdUri = URI.file('/workspace/.github/skills/myskill/README.md');
			expect(customInstructionsService.isSkillMdFile(otherMdUri)).toBe(false);
		});

		test('should return false for non-md files in skill folder', () => {
			const codeFileUri = URI.file('/workspace/.github/skills/myskill/code.ts');
			expect(customInstructionsService.isSkillMdFile(codeFileUri)).toBe(false);
		});

		test('should return false for SKILL.md outside skill folder', () => {
			const nonSkillUri = URI.file('/workspace/docs/SKILL.md');
			expect(customInstructionsService.isSkillMdFile(nonSkillUri)).toBe(false);
		});

		test('should return false when useAgentSkills setting is disabled', async () => {
			await configService.setNonExtensionConfig('chat.useAgentSkills', false);

			const skillMdUri = URI.file('/workspace/.github/skills/myskill/SKILL.md');
			expect(customInstructionsService.isSkillMdFile(skillMdUri)).toBe(false);
		});
	});

	suite('isExternalInstructionsFile', () => {
		test('should return true for skill files', async () => {
			const skillFileUri = URI.file('/workspace/.github/skills/myskill/SKILL.md');
			expect(await customInstructionsService.isExternalInstructionsFile(skillFileUri)).toBe(true);
		});

		test('should return false for regular files', async () => {
			const regularFileUri = URI.file('/workspace/src/file.ts');
			expect(await customInstructionsService.isExternalInstructionsFile(regularFileUri)).toBe(false);
		});
	});

	suite('isExternalInstructionsFolder', () => {
		test('should return true for skill folder', () => {
			const skillFolderUri = URI.file('/workspace/.github/skills/myskill');
			expect(customInstructionsService.isExternalInstructionsFolder(skillFolderUri)).toBe(true);
		});

		test('should return true for nested folder in skill', () => {
			const nestedFolderUri = URI.file('/workspace/.github/skills/myskill/subfolder');
			expect(customInstructionsService.isExternalInstructionsFolder(nestedFolderUri)).toBe(true);
		});

		test('should return false for regular folder', () => {
			const regularFolderUri = URI.file('/workspace/src');
			expect(customInstructionsService.isExternalInstructionsFolder(regularFolderUri)).toBe(false);
		});
	});

	suite('chat.agentSkillsLocations config', () => {
		test('should return skill info for file in absolute path skill location', async () => {
			await configService.setNonExtensionConfig('chat.agentSkillsLocations', {
				'/custom/skills': true
			});

			const skillFileUri = URI.file('/custom/skills/myskill/SKILL.md');
			const skillInfo = customInstructionsService.getSkillInfo(skillFileUri);

			expect(skillInfo).toBeDefined();
			expect(skillInfo?.skillName).toBe('myskill');
			expect(skillInfo?.skillFolderUri.toString()).toBe(URI.file('/custom/skills/myskill').toString());
		});

		test('should return skill info for nested file in absolute path skill location', async () => {
			await configService.setNonExtensionConfig('chat.agentSkillsLocations', {
				'/custom/skills': true
			});

			const skillFileUri = URI.file('/custom/skills/myskill/subfolder/code.ts');
			const skillInfo = customInstructionsService.getSkillInfo(skillFileUri);

			expect(skillInfo).toBeDefined();
			expect(skillInfo?.skillName).toBe('myskill');
			expect(skillInfo?.skillFolderUri.toString()).toBe(URI.file('/custom/skills/myskill').toString());
		});

		test('should return skill info for file in tilde path skill location', async () => {
			await configService.setNonExtensionConfig('chat.agentSkillsLocations', {
				'~/my-skills': true
			});

			// userHome is /home/testuser in NullNativeEnvService
			const skillFileUri = URI.file('/home/testuser/my-skills/myskill/SKILL.md');
			const skillInfo = customInstructionsService.getSkillInfo(skillFileUri);

			expect(skillInfo).toBeDefined();
			expect(skillInfo?.skillName).toBe('myskill');
			expect(skillInfo?.skillFolderUri.toString()).toBe(URI.file('/home/testuser/my-skills/myskill').toString());
		});

		test('should return skill info for file in relative path skill location', async () => {
			await configService.setNonExtensionConfig('chat.agentSkillsLocations', {
				'custom-skills': true
			});

			// Relative paths are joined to workspace folder (/workspace)
			const skillFileUri = URI.file('/workspace/custom-skills/myskill/SKILL.md');
			const skillInfo = customInstructionsService.getSkillInfo(skillFileUri);

			expect(skillInfo).toBeDefined();
			expect(skillInfo?.skillName).toBe('myskill');
			expect(skillInfo?.skillFolderUri.toString()).toBe(URI.file('/workspace/custom-skills/myskill').toString());
		});

		test('should ignore disabled skill locations (value !== true)', async () => {
			await configService.setNonExtensionConfig('chat.agentSkillsLocations', {
				'/custom/skills': false
			});

			const skillFileUri = URI.file('/custom/skills/myskill/SKILL.md');
			const skillInfo = customInstructionsService.getSkillInfo(skillFileUri);

			expect(skillInfo).toBeUndefined();
		});

		test('should handle multiple skill locations', async () => {
			await configService.setNonExtensionConfig('chat.agentSkillsLocations', {
				'/custom/skills': true,
				'~/my-skills': true,
				'local-skills': true
			});

			// Check absolute path
			const skill1 = customInstructionsService.getSkillInfo(URI.file('/custom/skills/skill1/SKILL.md'));
			expect(skill1?.skillName).toBe('skill1');

			// Check tilde path
			const skill2 = customInstructionsService.getSkillInfo(URI.file('/home/testuser/my-skills/skill2/SKILL.md'));
			expect(skill2?.skillName).toBe('skill2');

			// Check relative path
			const skill3 = customInstructionsService.getSkillInfo(URI.file('/workspace/local-skills/skill3/SKILL.md'));
			expect(skill3?.skillName).toBe('skill3');
		});

		test('should return true for isSkillFile with config-based location', async () => {
			await configService.setNonExtensionConfig('chat.agentSkillsLocations', {
				'/custom/skills': true
			});

			const skillFileUri = URI.file('/custom/skills/myskill/code.ts');
			expect(customInstructionsService.isSkillFile(skillFileUri)).toBe(true);
		});

		test('should return true for isSkillMdFile with config-based location', async () => {
			await configService.setNonExtensionConfig('chat.agentSkillsLocations', {
				'/custom/skills': true
			});

			const skillMdUri = URI.file('/custom/skills/myskill/SKILL.md');
			expect(customInstructionsService.isSkillMdFile(skillMdUri)).toBe(true);
		});

		test('should return true for isExternalInstructionsFolder with config-based location', async () => {
			await configService.setNonExtensionConfig('chat.agentSkillsLocations', {
				'/custom/skills': true
			});

			const skillFolderUri = URI.file('/custom/skills/myskill');
			expect(customInstructionsService.isExternalInstructionsFolder(skillFolderUri)).toBe(true);
		});

		test('config-based locations should not interfere with default locations', async () => {
			await configService.setNonExtensionConfig('chat.agentSkillsLocations', {
				'/custom/skills': true
			});

			// Default .github/skills should still work
			const defaultSkillFile = URI.file('/workspace/.github/skills/myskill/SKILL.md');
			const skillInfo = customInstructionsService.getSkillInfo(defaultSkillFile);

			expect(skillInfo).toBeDefined();
			expect(skillInfo?.skillName).toBe('myskill');
		});
	});

	suite('chat.instructionsFilesLocations config', () => {
		test('should recognize instruction file in absolute path location', async () => {
			await configService.setNonExtensionConfig('chat.instructionsFilesLocations', {
				'/custom/instructions': true
			});

			const instructionFileUri = URI.file('/custom/instructions/setup.instructions.md');
			expect(await customInstructionsService.isExternalInstructionsFile(instructionFileUri)).toBe(true);
		});

		test('should recognize instruction file in tilde path location', async () => {
			await configService.setNonExtensionConfig('chat.instructionsFilesLocations', {
				'~/.copilot/instructions': true
			});

			// userHome is /home/testuser in NullNativeEnvService
			const instructionFileUri = URI.file('/home/testuser/.copilot/instructions/setup.instructions.md');
			expect(await customInstructionsService.isExternalInstructionsFile(instructionFileUri)).toBe(true);
		});

		test('should not recognize non-instruction file in tilde path location', async () => {
			await configService.setNonExtensionConfig('chat.instructionsFilesLocations', {
				'~/.copilot/instructions': true
			});

			const regularFileUri = URI.file('/home/testuser/.copilot/instructions/notes.txt');
			expect(await customInstructionsService.isExternalInstructionsFile(regularFileUri)).toBe(false);
		});

		test('should ignore disabled instruction locations', async () => {
			await configService.setNonExtensionConfig('chat.instructionsFilesLocations', {
				'/custom/instructions': false
			});

			const instructionFileUri = URI.file('/custom/instructions/setup.instructions.md');
			expect(await customInstructionsService.isExternalInstructionsFile(instructionFileUri)).toBe(false);
		});

		test('should handle both absolute and tilde paths together', async () => {
			await configService.setNonExtensionConfig('chat.instructionsFilesLocations', {
				'/custom/instructions': true,
				'~/.copilot/instructions': true
			});

			const absoluteFileUri = URI.file('/custom/instructions/setup.instructions.md');
			expect(await customInstructionsService.isExternalInstructionsFile(absoluteFileUri)).toBe(true);

			// userHome is /home/testuser in NullNativeEnvService
			const tildeFileUri = URI.file('/home/testuser/.copilot/instructions/setup.instructions.md');
			expect(await customInstructionsService.isExternalInstructionsFile(tildeFileUri)).toBe(true);
		});
	});
});
