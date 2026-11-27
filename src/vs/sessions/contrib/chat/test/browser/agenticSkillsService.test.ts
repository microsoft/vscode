/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { readDisabledPromptFiles, storeDisabledPromptFiles } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/disabledPromptFilesStorage.js';
import { AgenticSkillsService, BUILTIN_SKILLS_URI } from '../../browser/agenticSkillsService.js';

suite('AgenticSkillsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('moves disabled built-in skills from the legacy key before the first read', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const builtinSkill = joinPath(BUILTIN_SKILLS_URI, 'create-pr', 'SKILL.md');
		const localSkill = URI.file('/workspace/.github/skills/local/SKILL.md');
		storeDisabledPromptFiles(storage, 'chat.disabledPromptFiles.skill', [builtinSkill, localSkill]);

		const service = disposables.add(new AgenticSkillsService(disposables.add(new FileService(new NullLogService())), new TestConfigurationService(), storage, new NullLogService()));

		assert.deepStrictEqual({
			builtin: [...service.getDisabledSkills()].map(uri => uri.toString()),
			legacy: [...readDisabledPromptFiles(storage, 'chat.disabledPromptFiles.skill')].map(uri => uri.toString()),
		}, {
			builtin: [builtinSkill.toString()],
			legacy: [localSkill.toString()],
		});
	});

	test('strips tags from a built-in skill description until none remain', async () => {
		const files = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(files.registerProvider(BUILTIN_SKILLS_URI.scheme, provider));
		if (/^\/[a-z]:\//i.test(BUILTIN_SKILLS_URI.path)) {
			await provider.mkdir(BUILTIN_SKILLS_URI.with({ scheme: Schemas.inMemory, path: BUILTIN_SKILLS_URI.path.slice(0, 3) }));
		}
		await files.writeFile(joinPath(BUILTIN_SKILLS_URI, 'commit', 'SKILL.md'), VSBuffer.fromString('---\nname: commit\ndescription: Commits <<b>script>alert(1)<</b>/script> changes.\n---\nCommit.'));
		const storage = disposables.add(new InMemoryStorageService());

		const service = disposables.add(new AgenticSkillsService(files, new TestConfigurationService(), storage, new NullLogService()));

		assert.deepStrictEqual((await service.getSkills()).map(skill => skill.description), ['Commits script>alert(1)/script> changes.']);
	});
});
