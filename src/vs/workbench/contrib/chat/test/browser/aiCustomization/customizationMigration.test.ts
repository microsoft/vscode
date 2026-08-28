/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileType, IFileDeleteOptions, IFileWriteOptions, createFileSystemProviderError, FileSystemProviderErrorCode } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage, type IPromptPath } from '../../../common/promptSyntax/service/promptsService.js';
import { ICustomizationSourceFolder } from '../../../common/customizationHarnessService.js';
import { createSkillFileUri, migrateCustomizations, migratePromptFileToSkill, type CustomizationMigrationTargetFolders } from '../../../browser/aiCustomization/customizationMigration.js';
import { CUSTOMIZATION_MIGRATION_CATEGORIES, CustomizationMigrationCategoryId, getCustomizationMigrationCategory } from '../../../browser/aiCustomization/customizationMigrationCategories.js';

class DeleteFailingFileSystemProvider extends InMemoryFileSystemProvider {
	deleteFailureResource: URI | undefined;

	override async delete(resource: URI, options: IFileDeleteOptions): Promise<void> {
		if (this.deleteFailureResource && isEqual(resource, this.deleteFailureResource)) {
			throw new Error('Expected delete failure');
		}
		await super.delete(resource, options);
	}
}

class ConcurrentTargetFileSystemProvider extends InMemoryFileSystemProvider {
	conflictResource: URI | undefined;

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		if (this.conflictResource && isEqual(resource, this.conflictResource)) {
			this.conflictResource = undefined;
			await super.writeFile(resource, VSBuffer.fromString('foreign content').buffer, {
				create: true,
				overwrite: true,
				unlock: false,
				atomic: false,
			});
			throw createFileSystemProviderError('file exists already', FileSystemProviderErrorCode.FileExists);
		}
		await super.writeFile(resource, content, options);
	}
}

suite('customizationMigration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('splits candidates into focused, non-overlapping categories', () => {
		const customizations: IPromptPath[] = [
			{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/user-data/prompts/release.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/prompts/reviewer.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/prompts/style.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData },
			{ uri: URI.file('/home/test/.copilot/agents/planner.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.CopilotPersonal },
			{ uri: URI.file('/workspace/.github/skills/deploy/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, source: PromptFileSource.GitHubWorkspace },
		];
		const candidatesFor = (id: CustomizationMigrationCategoryId) => customizations
			.filter(customization => getCustomizationMigrationCategory(id).isCandidate(customization))
			.map(customization => customization.uri.path);

		assert.deepStrictEqual({
			promptFiles: candidatesFor(CustomizationMigrationCategoryId.PromptFiles),
			userData: candidatesFor(CustomizationMigrationCategoryId.UserData),
			sourceTypes: CUSTOMIZATION_MIGRATION_CATEGORIES.map(category => [category.id, [...category.sourceTypes]]),
		}, {
			promptFiles: [
				'/workspace/.github/prompts/review.prompt.md',
				'/user-data/prompts/release.prompt.md',
			],
			userData: [
				'/user-data/prompts/reviewer.agent.md',
				'/user-data/prompts/style.instructions.md',
			],
			sourceTypes: [
				[CustomizationMigrationCategoryId.PromptFiles, [PromptsType.prompt]],
				[CustomizationMigrationCategoryId.UserData, [PromptsType.agent, PromptsType.instructions]],
			],
		});
	});


	test('uses singular copy for one User Data customization', () => {
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.UserData);
		const harnessLabel = 'Copilot';
		const agent: IPromptPath = {
			uri: URI.file('/user-data/prompts/reviewer.agent.md'),
			storage: PromptsStorage.user,
			type: PromptsType.agent,
			source: PromptFileSource.UserData,
		};
		const instruction: IPromptPath = {
			uri: URI.file('/user-data/prompts/style.instructions.md'),
			storage: PromptsStorage.user,
			type: PromptsType.instructions,
			source: PromptFileSource.UserData,
		};

		assert.deepStrictEqual({
			shortcut: category.getShortcutAriaLabel(1),
			agent: {
				card: category.getCardDescription([agent], harnessLabel),
				page: category.getPageDescription([agent], harnessLabel),
				confirmation: category.getConfirmation([agent], harnessLabel, '~/.copilot/agents'),
			},
			instruction: {
				card: category.getCardDescription([instruction], harnessLabel),
				page: category.getPageDescription([instruction], harnessLabel),
				confirmation: category.getConfirmation([instruction], harnessLabel).detail,
			},
			mixed: {
				card: category.getCardDescription([agent, instruction], harnessLabel),
				confirmation: category.getConfirmation([agent, instruction], harnessLabel).detail,
			},
			migrated: category.getMigratedMessage(1),
			failed: category.getFailedMessage(['reviewer.agent.md'], 0),
		}, {
			shortcut: 'User data, 1 customization needs migration',
			agent: {
				card: 'User data customizations are only used by VS Code. Found 1 agent that Copilot ignores. Move it to keep it available.',
				page: 'Found 1 agent in user data that local VS Code can still use, but Copilot ignores. Move it to the harness agents folder to keep it available.',
				confirmation: {
					message: 'Migrate user data customizations to \'~/.copilot/agents\'?',
					detail: 'This moves 1 agent out of user data.',
					primaryButton: 'Migrate',
					deleteOriginalsLabel: 'Delete the original files from user data after migration',
				},
			},
			instruction: {
				card: 'User data customizations are only used by VS Code. Found 1 instruction file that Copilot ignores. Move it to keep it available.',
				page: 'Found 1 instruction file in user data that local VS Code can still use, but Copilot ignores. Move it to the harness instructions folder to keep it available.',
				confirmation: 'This moves 1 instruction file out of user data.',
			},
			mixed: {
				card: 'User data customizations are only used by VS Code. Found 2 customizations that Copilot ignores. Move them to keep them available.',
				confirmation: 'This moves 2 customizations out of user data.',
			},
			migrated: 'Migrated 1 user data customization.',
			failed: 'Failed to migrate 1 user data customization: reviewer.agent.md.',
		});
	});

	test('migrates prompt headers into a skill file', () => {
		const promptFile: IPromptPath = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: 'Review Prompt',
			description: 'Review the active change',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const content = [
			'---',
			'name: "Review Prompt"',
			'description: "Review the active change"',
			'argument-hint: "[diff]"',
			'tools: [read_file, edit_file]',
			'mode: code',
			'---',
			'## Steps',
			'',
			'- Review the diff',
		].join('\n');

		const migrated = migratePromptFileToSkill(promptFile, content);

		assert.strictEqual(migrated.skillName, 'review-prompt');
		assert.deepStrictEqual(migrated.unsupportedHeaderKeys, ['tools', 'mode']);
		assert.ok(migrated.content.includes('name: review-prompt'));
		assert.ok(migrated.content.includes('description: Review the active change'));
		assert.ok(migrated.content.includes('disable-model-invocation: true'));
		assert.ok(migrated.content.includes('argument-hint: "[diff]"'));
		assert.ok(!migrated.content.includes('tools: [read_file, edit_file]'));
		assert.ok(migrated.content.includes('## Steps'));
	});

	test('preserves argument-hint formatting from source prompt', () => {
		const promptFile: IPromptPath = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: 'Review Prompt',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const content = [
			'---',
			'name: Review Prompt',
			'description: Review the active change',
			'argument-hint: diff',
			'---',
			'Review body',
		].join('\n');

		const migrated = migratePromptFileToSkill(promptFile, content);
		assert.ok(migrated.content.includes('argument-hint: diff'));
	});

	test('migrates mixed customizations and continues after per-file failures', async () => {
		const customizations: IPromptPath[] = [
			{
				uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
				name: 'Review Prompt',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			},
			{
				uri: URI.file('/home/test/.vscode/prompts/planner.agent.md'),
				name: 'Planner',
				storage: PromptsStorage.user,
				type: PromptsType.agent,
				source: PromptFileSource.UserData,
			},
			{
				uri: URI.file('/home/test/.vscode/prompts/style.instructions.md'),
				name: 'Style',
				storage: PromptsStorage.user,
				type: PromptsType.instructions,
				source: PromptFileSource.UserData,
			},
			{
				uri: URI.file('/home/test/.vscode/prompts/failing.prompt.md'),
				name: 'Failing Prompt',
				storage: PromptsStorage.user,
				type: PromptsType.prompt,
				source: PromptFileSource.UserData,
			},
		];
		const workspaceSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local };
		const userSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/skills'), label: '~/.copilot/skills', source: PromptsStorage.user };
		const userAgentRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/agents'), label: '~/.copilot/agents', source: PromptsStorage.user };
		const userInstructionsRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/instructions'), label: '~/.copilot/instructions', source: PromptsStorage.user };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.skill, new Map([[PromptsStorage.local, workspaceSkillRoot], [PromptsStorage.user, userSkillRoot]])],
			[PromptsType.agent, new Map([[PromptsStorage.user, userAgentRoot]])],
			[PromptsType.instructions, new Map([[PromptsStorage.user, userInstructionsRoot]])],
		]);

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(customizations[0].uri, VSBuffer.fromString(['---', 'name: "Review Prompt"', 'mode: code', '---', 'Review body'].join('\n')));
		await fileService.writeFile(customizations[1].uri, VSBuffer.fromString('---\ndescription: Plan work\n---\nPlan.'));
		await fileService.writeFile(customizations[2].uri, VSBuffer.fromString('---\ndescription: Use tabs\n---\nUse tabs.'));
		await fileService.writeFile(URI.joinPath(userAgentRoot.uri, 'planner.agent.md'), VSBuffer.fromString('existing'));

		const migrationErrors: Error[] = [];
		const result = await migrateCustomizations(customizations, targetFolders, fileService, error => migrationErrors.push(error));
		const migratedSkillUri = createSkillFileUri(workspaceSkillRoot.uri, 'review-prompt');
		const migratedAgentUri = URI.joinPath(userAgentRoot.uri, 'planner-2.agent.md');
		const migratedInstructionsUri = URI.joinPath(userInstructionsRoot.uri, 'style.instructions.md');
		const migratedSkillContent = (await fileService.readFile(migratedSkillUri)).value.toString();

		assert.deepStrictEqual({
			result: {
				...result,
				migratedCustomizations: result.migratedCustomizations.map(customization => ({ uri: customization.uri.path, type: customization.type })),
			},
			migratedSkillHasManualInvocation: migratedSkillContent.includes('disable-model-invocation: true'),
			migratedAgentContent: (await fileService.readFile(migratedAgentUri)).value.toString(),
			migratedInstructionsContent: (await fileService.readFile(migratedInstructionsUri)).value.toString(),
			originalsExist: await Promise.all(customizations.slice(0, 3).map(customization => fileService.exists(customization.uri))),
			migrationErrorCount: migrationErrors.length,
		}, {
			result: {
				migratedCount: 3,
				failedCustomizationFileNames: ['failing.prompt.md'],
				unsupportedHeaderKeys: ['mode'],
				migratedCustomizations: [
					{ uri: migratedSkillUri.path, type: PromptsType.skill },
					{ uri: migratedAgentUri.path, type: PromptsType.agent },
					{ uri: migratedInstructionsUri.path, type: PromptsType.instructions },
				],
			},
			migratedSkillHasManualInvocation: true,
			migratedAgentContent: '---\ndescription: Plan work\n---\nPlan.',
			migratedInstructionsContent: '---\ndescription: Use tabs\n---\nUse tabs.',
			originalsExist: [false, false, false],
			migrationErrorCount: 1,
		});
	});

	test('migrates duplicate source identities before deleting the source', async () => {
		const sourceUri = URI.file('/home/test/shared.prompt.md');
		const customizations: IPromptPath[] = [
			{ uri: sourceUri, name: 'Shared', storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.ConfigWorkspace },
			{ uri: sourceUri, name: 'Shared', storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.ConfigPersonal },
		];
		const workspaceSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local };
		const userSkillRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/skills'), label: '~/.copilot/skills', source: PromptsStorage.user };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.skill, new Map([[PromptsStorage.local, workspaceSkillRoot], [PromptsStorage.user, userSkillRoot]])],
		]);

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('---\nname: Shared\n---\nShared body'));

		const result = await migrateCustomizations(customizations, targetFolders, fileService);
		const workspaceSkillUri = createSkillFileUri(workspaceSkillRoot.uri, 'shared');
		const userSkillUri = createSkillFileUri(userSkillRoot.uri, 'shared');

		assert.deepStrictEqual({
			result: {
				...result,
				migratedCustomizations: result.migratedCustomizations.map(customization => ({ uri: customization.uri.path, type: customization.type })),
			},
			sourceExists: await fileService.exists(sourceUri),
			workspaceTargetExists: await fileService.exists(workspaceSkillUri),
			userTargetExists: await fileService.exists(userSkillUri),
		}, {
			result: {
				migratedCount: 2,
				failedCustomizationFileNames: [],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [
					{ uri: workspaceSkillUri.path, type: PromptsType.skill },
					{ uri: userSkillUri.path, type: PromptsType.skill },
				],
			},
			sourceExists: false,
			workspaceTargetExists: true,
			userTargetExists: true,
		});
	});

	test('rolls back the target when deleting the source fails', async () => {
		const sourceUri = URI.file('/user-data/style.instructions.md');
		const customization: IPromptPath = {
			uri: sourceUri,
			name: 'Style',
			storage: PromptsStorage.user,
			type: PromptsType.instructions,
			source: PromptFileSource.UserData,
		};
		const instructionsRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/instructions'), label: '~/.copilot/instructions', source: PromptsStorage.user };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.instructions, new Map([[PromptsStorage.user, instructionsRoot]])],
		]);

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new DeleteFailingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('Use tabs.'));
		fileSystemProvider.deleteFailureResource = sourceUri;

		const migrationErrors: Error[] = [];
		const failedResult = await migrateCustomizations([customization], targetFolders, fileService, error => migrationErrors.push(error));
		const targetUri = URI.joinPath(instructionsRoot.uri, 'style.instructions.md');
		const afterFailure = {
			sourceExists: await fileService.exists(sourceUri),
			targetExists: await fileService.exists(targetUri),
			migrationErrorCount: migrationErrors.length,
		};

		fileSystemProvider.deleteFailureResource = undefined;
		const retriedResult = await migrateCustomizations([customization], targetFolders, fileService);

		assert.deepStrictEqual({
			failedResult,
			afterFailure,
			retriedResult: {
				...retriedResult,
				migratedCustomizations: retriedResult.migratedCustomizations.map(item => item.uri.path),
			},
			afterRetry: {
				sourceExists: await fileService.exists(sourceUri),
				targetExists: await fileService.exists(targetUri),
				suffixedTargetExists: await fileService.exists(URI.joinPath(instructionsRoot.uri, 'style-2.instructions.md')),
			},
		}, {
			failedResult: {
				migratedCount: 0,
				failedCustomizationFileNames: ['style.instructions.md'],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [],
			},
			afterFailure: {
				sourceExists: true,
				targetExists: false,
				migrationErrorCount: 1,
			},
			retriedResult: {
				migratedCount: 1,
				failedCustomizationFileNames: [],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [targetUri.path],
			},
			afterRetry: {
				sourceExists: false,
				targetExists: true,
				suffixedTargetExists: false,
			},
		});
	});

	test('does not overwrite or roll back a concurrently created target', async () => {
		const sourceUri = URI.file('/user-data/style.instructions.md');
		const customization: IPromptPath = {
			uri: sourceUri,
			name: 'Style',
			storage: PromptsStorage.user,
			type: PromptsType.instructions,
			source: PromptFileSource.UserData,
		};
		const instructionsRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/instructions'), label: '~/.copilot/instructions', source: PromptsStorage.user };
		const targetFolders: CustomizationMigrationTargetFolders = new Map([
			[PromptsType.instructions, new Map([[PromptsStorage.user, instructionsRoot]])],
		]);

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new ConcurrentTargetFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('Use tabs.'));
		const targetUri = URI.joinPath(instructionsRoot.uri, 'style.instructions.md');
		fileSystemProvider.conflictResource = targetUri;

		const migrationErrors: Error[] = [];
		const result = await migrateCustomizations([customization], targetFolders, fileService, error => migrationErrors.push(error));
		const targetEntries = await fileSystemProvider.readdir(instructionsRoot.uri);

		assert.deepStrictEqual({
			result,
			sourceExists: await fileService.exists(sourceUri),
			targetContent: (await fileService.readFile(targetUri)).value.toString(),
			targetEntries,
			migrationErrorCount: migrationErrors.length,
		}, {
			result: {
				migratedCount: 0,
				failedCustomizationFileNames: ['style.instructions.md'],
				unsupportedHeaderKeys: [],
				migratedCustomizations: [],
			},
			sourceExists: true,
			targetContent: 'foreign content',
			targetEntries: [['style.instructions.md', FileType.File]],
			migrationErrorCount: 1,
		});
	});

	test('can keep original customization files after migration', async () => {
		const customization: IPromptPath = {
			uri: URI.file('/home/test/.vscode/prompts/style.instructions.md'),
			name: 'Style',
			storage: PromptsStorage.user,
			type: PromptsType.instructions,
			source: PromptFileSource.UserData,
		};
		const instructionsRoot: ICustomizationSourceFolder = { uri: URI.file('/home/test/.copilot/instructions'), label: '~/.copilot/instructions', source: PromptsStorage.user };

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(customization.uri, VSBuffer.fromString('Use tabs.'));

		const result = await migrateCustomizations(
			[customization],
			new Map([[PromptsType.instructions, new Map([[PromptsStorage.user, instructionsRoot]])]]),
			fileService,
			undefined,
			{ deleteOriginalFiles: false },
		);
		const migratedUri = URI.joinPath(instructionsRoot.uri, 'style.instructions.md');

		assert.deepStrictEqual({
			migratedCount: result.migratedCount,
			migratedUris: result.migratedCustomizations.map(item => item.uri.path),
			originalExists: await fileService.exists(customization.uri),
			migratedExists: await fileService.exists(migratedUri),
		}, {
			migratedCount: 1,
			migratedUris: [migratedUri.path],
			originalExists: true,
			migratedExists: true,
		});
	});
});
