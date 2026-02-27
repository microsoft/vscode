/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { resolveUserTargetDirectory } from '../../../browser/aiCustomization/customizationCreatorService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';

suite('customizationCreatorService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const userHome = URI.file('/home/user');

	function createMockPathService(): Pick<IPathService, 'userHome'> {
		return {
			userHome: ((options?: { preferLocal: boolean }) => {
				if (options?.preferLocal) {
					return userHome;
				}
				return Promise.resolve(userHome);
			}) as IPathService['userHome'],
		};
	}

	function createMockConfigService(overridePath: string): Pick<IConfigurationService, 'getValue'> {
		return {
			getValue: (key: string) => {
				if (key === ChatConfiguration.ChatCustomizationUserStoragePath) {
					return overridePath;
				}
				return undefined;
			},
		} as Pick<IConfigurationService, 'getValue'>;
	}

	function createMockPromptsService(userFolderUri?: URI): Pick<IPromptsService, 'getSourceFolders'> {
		return {
			getSourceFolders: () => Promise.resolve(
				userFolderUri
					? [{ uri: userFolderUri, storage: PromptsStorage.user, type: PromptsType.instructions }]
					: []
			),
		} as Pick<IPromptsService, 'getSourceFolders'>;
	}

	suite('resolveUserTargetDirectory', () => {

		test('with override path and tilde for instructions', async () => {
			const result = await resolveUserTargetDirectory(
				createMockPromptsService() as IPromptsService,
				PromptsType.instructions,
				createMockConfigService('~/.copilot') as IConfigurationService,
				createMockPathService() as IPathService,
			);
			assert.strictEqual(result?.path, '/home/user/.copilot/instructions');
		});

		test('with override path and tilde for skills', async () => {
			const result = await resolveUserTargetDirectory(
				createMockPromptsService() as IPromptsService,
				PromptsType.skill,
				createMockConfigService('~/.copilot') as IConfigurationService,
				createMockPathService() as IPathService,
			);
			assert.strictEqual(result?.path, '/home/user/.copilot/skills');
		});

		test('override path is ignored for prompts (no CLI discovery path)', async () => {
			const fallbackUri = URI.file('/home/user/.vscode/prompts');
			const result = await resolveUserTargetDirectory(
				createMockPromptsService(fallbackUri) as IPromptsService,
				PromptsType.prompt,
				createMockConfigService('~/.copilot') as IConfigurationService,
				createMockPathService() as IPathService,
			);
			// Should fall through to getSourceFolders, not use the override
			assert.strictEqual(result?.path, '/home/user/.vscode/prompts');
		});

		test('override path is ignored for agents (no CLI convention)', async () => {
			const fallbackUri = URI.file('/home/user/.vscode/prompts');
			const result = await resolveUserTargetDirectory(
				createMockPromptsService(fallbackUri) as IPromptsService,
				PromptsType.agent,
				createMockConfigService('~/.copilot') as IConfigurationService,
				createMockPathService() as IPathService,
			);
			// Should fall through to getSourceFolders, not use the override
			assert.strictEqual(result?.path, '/home/user/.vscode/prompts');
		});

		test('override path is ignored for hooks (no CLI convention)', async () => {
			const result = await resolveUserTargetDirectory(
				createMockPromptsService() as IPromptsService,
				PromptsType.hook,
				createMockConfigService('~/.copilot') as IConfigurationService,
				createMockPathService() as IPathService,
			);
			// No user folder for hooks, should return undefined
			assert.strictEqual(result, undefined);
		});

		test('falls back to getSourceFolders when no override is set', async () => {
			const fallbackUri = URI.file('/home/user/.vscode/prompts');
			const result = await resolveUserTargetDirectory(
				createMockPromptsService(fallbackUri) as IPromptsService,
				PromptsType.instructions,
				createMockConfigService('') as IConfigurationService,
				createMockPathService() as IPathService,
			);
			assert.strictEqual(result?.path, '/home/user/.vscode/prompts');
		});

		test('falls back to getSourceFolders when no config service provided', async () => {
			const fallbackUri = URI.file('/home/user/.vscode/prompts');
			const result = await resolveUserTargetDirectory(
				createMockPromptsService(fallbackUri) as IPromptsService,
				PromptsType.instructions,
			);
			assert.strictEqual(result?.path, '/home/user/.vscode/prompts');
		});

		test('with absolute override path (no tilde)', async () => {
			const result = await resolveUserTargetDirectory(
				createMockPromptsService() as IPromptsService,
				PromptsType.instructions,
				createMockConfigService('/custom/path') as IConfigurationService,
				createMockPathService() as IPathService,
			);
			assert.strictEqual(result?.path, '/custom/path/instructions');
		});
	});
});
