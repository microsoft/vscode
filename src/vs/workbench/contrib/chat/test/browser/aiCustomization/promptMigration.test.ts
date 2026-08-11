/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage, type IPromptPath } from '../../../common/promptSyntax/service/promptsService.js';
import { ICustomizationSourceFolder } from '../../../common/customizationHarnessService.js';
import { createSkillFileUri, getPromptMigrationInfo, migratePromptFileToSkill, migratePromptFilesToSkills, pickSkillSourceFolder } from '../../../browser/aiCustomization/promptMigration.js';

suite('promptMigration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('counts workspace and user prompt files', () => {
		const promptFiles: IPromptPath[] = [
			{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/workspace/.github/prompts/test.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/home/test/.vscode/prompts/release.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.UserData },
		];

		assert.deepStrictEqual(getPromptMigrationInfo(promptFiles), {
			totalPromptCount: 3,
			workspacePromptCount: 2,
			userPromptCount: 1,
		});
		assert.strictEqual(getPromptMigrationInfo([]), undefined);
	});

	test('picks the matching storage from provider source folders', () => {
		const promptFile: IPromptPath = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const skillRoots: ICustomizationSourceFolder[] = [
			{ uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local },
			{ uri: URI.file('/home/test/.copilot/skills'), label: '~/.copilot/skills', source: PromptsStorage.user },
		];

		assert.strictEqual(
			pickSkillSourceFolder(promptFile, skillRoots)?.uri.toString(),
			URI.file('/workspace/.github/skills').toString(),
		);
		assert.strictEqual(pickSkillSourceFolder({ ...promptFile, storage: PromptsStorage.user }, skillRoots)?.uri.toString(), URI.file('/home/test/.copilot/skills').toString());
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

	test('migrates prompt files and continues after per-file failures', async () => {
		const promptFiles: IPromptPath[] = [
			{
				uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
				name: 'Review Prompt',
				storage: PromptsStorage.local,
				type: PromptsType.prompt,
				source: PromptFileSource.GitHubWorkspace,
			},
			{
				uri: URI.file('/home/test/.vscode/prompts/failing.prompt.md'),
				name: 'Failing Prompt',
				storage: PromptsStorage.user,
				type: PromptsType.prompt,
				source: PromptFileSource.UserData,
			},
		];
		const skillRoots: ICustomizationSourceFolder[] = [
			{ uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local },
			{ uri: URI.file('/home/test/.copilot/skills'), label: '~/.copilot/skills', source: PromptsStorage.user },
		];

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(promptFiles[0].uri, VSBuffer.fromString(['---', 'name: "Review Prompt"', 'mode: code', '---', 'Review body'].join('\n')));

		const migrationErrors: Error[] = [];
		const skillRootsByStorage = new Map<PromptsStorage, ICustomizationSourceFolder>([
			[PromptsStorage.local, skillRoots[0]],
			[PromptsStorage.user, skillRoots[1]],
		]);
		const result = await migratePromptFilesToSkills(promptFiles, skillRootsByStorage, fileService, error => migrationErrors.push(error));
		const migratedSkillUri = createSkillFileUri(skillRoots[0].uri, 'review-prompt');
		const migratedSkillContent = (await fileService.readFile(migratedSkillUri)).value.toString();

		assert.strictEqual(result.convertedCount, 1);
		assert.deepStrictEqual(result.failedPromptFileNames, ['failing.prompt.md']);
		assert.deepStrictEqual(result.unsupportedHeaderKeys, ['mode']);
		assert.deepStrictEqual(result.convertedSkillFileUris.map(uri => uri.toString()), [migratedSkillUri.toString()]);
		assert.ok(migratedSkillContent.includes('disable-model-invocation: true'));
		assert.strictEqual(await fileService.exists(promptFiles[0].uri), false);
		assert.strictEqual(await fileService.exists(promptFiles[1].uri), false);
		assert.strictEqual(migrationErrors.length, 1);
	});

	test('can keep original prompt files after migration', async () => {
		const promptFile: IPromptPath = {
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			name: 'Review Prompt',
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		};
		const skillRoot: ICustomizationSourceFolder = { uri: URI.file('/workspace/.github/skills'), label: '.github/skills', source: PromptsStorage.local };

		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.writeFile(promptFile.uri, VSBuffer.fromString(['---', 'name: "Review Prompt"', '---', 'Review body'].join('\n')));

		const result = await migratePromptFilesToSkills(
			[promptFile],
			new Map<PromptsStorage, ICustomizationSourceFolder>([[PromptsStorage.local, skillRoot]]),
			fileService,
			undefined,
			{ deleteOriginalPromptFiles: false },
		);
		const migratedSkillUri = createSkillFileUri(skillRoot.uri, 'review-prompt');

		assert.strictEqual(result.convertedCount, 1);
		assert.deepStrictEqual(result.convertedSkillFileUris.map(uri => uri.toString()), [migratedSkillUri.toString()]);
		assert.strictEqual(await fileService.exists(promptFile.uri), true);
		assert.strictEqual(await fileService.exists(migratedSkillUri), true);
	});
});
