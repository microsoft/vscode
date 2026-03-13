/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mockService } from '../utils/mock.js';
import { PromptsConfig } from '../../../../common/promptSyntax/config/config.js';
import { PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IPromptSourceFolder } from '../../../../common/promptSyntax/config/promptFileLocations.js';

/**
 * Helper to extract just the paths from IPromptSourceFolder array for testing.
 */
function getPaths(folders: IPromptSourceFolder[]): string[] {
	return folders.map(f => f.path);
}

/**
 * Mocked instance of {@link IConfigurationService}.
 */
function createMock<T>(value: T): IConfigurationService {
	return mockService<IConfigurationService>({
		getValue(key?: string | IConfigurationOverrides) {
			assert(
				typeof key === 'string',
				`Expected string configuration key, got '${typeof key}'.`,
			);

			assert(
				[PromptsConfig.PROMPT_LOCATIONS_KEY, PromptsConfig.INSTRUCTIONS_LOCATION_KEY, PromptsConfig.MODE_LOCATION_KEY, PromptsConfig.SKILLS_LOCATION_KEY].includes(key),
				`Unsupported configuration key '${key}'.`,
			);

			return value;
		},
	});
}

suite('PromptsConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getLocationsValue', () => {
		test('undefined', () => {
			const configService = createMock(undefined);

			assert.strictEqual(
				PromptsConfig.getLocationsValue(configService, PromptsType.prompt),
				undefined,
				'Must read correct value.',
			);
		});

		test('null', () => {
			const configService = createMock(null);

			assert.strictEqual(
				PromptsConfig.getLocationsValue(configService, PromptsType.prompt),
				undefined,
				'Must read correct value.',
			);
		});

		test('undefined for skill', () => {
			const configService = createMock(undefined);

			assert.strictEqual(
				PromptsConfig.getLocationsValue(configService, PromptsType.skill),
				undefined,
				'Must read correct value for skills.',
			);
		});

		test('null for skill', () => {
			const configService = createMock(null);

			assert.strictEqual(
				PromptsConfig.getLocationsValue(configService, PromptsType.skill),
				undefined,
				'Must read correct value for skills.',
			);
		});

		suite('object', () => {
			test('empty', () => {
				assert.deepStrictEqual(
					PromptsConfig.getLocationsValue(createMock({}), PromptsType.prompt),
					{},
					'Must read correct value.',
				);
			});

			test('only valid strings', () => {
				assert.deepStrictEqual(
					PromptsConfig.getLocationsValue(createMock({
						'/root/.bashrc': true,
						'../../folder/.hidden-folder/config.xml': true,
						'/srv/www/Public_html/.htaccess': true,
						'../../another.folder/.WEIRD_FILE.log': true,
						'./folder.name/file.name': true,
						'/media/external/backup.tar.gz': true,
						'/Media/external/.secret.backup': true,
						'../relative/path.to.file': true,
						'./folderName.with.dots/more.dots.extension': true,
						'some/folder.with.dots/another.file': true,
						'/var/logs/app.01.05.error': true,
						'./.tempfile': true,
					}), PromptsType.prompt),
					{
						'/root/.bashrc': true,
						'../../folder/.hidden-folder/config.xml': true,
						'/srv/www/Public_html/.htaccess': true,
						'../../another.folder/.WEIRD_FILE.log': true,
						'./folder.name/file.name': true,
						'/media/external/backup.tar.gz': true,
						'/Media/external/.secret.backup': true,
						'../relative/path.to.file': true,
						'./folderName.with.dots/more.dots.extension': true,
						'some/folder.with.dots/another.file': true,
						'/var/logs/app.01.05.error': true,
						'./.tempfile': true,
					},
					'Must read correct value.',
				);
			});

			test('filters out non valid entries', () => {
				assert.deepStrictEqual(
					PromptsConfig.getLocationsValue(createMock({
						'/etc/hosts.backup': '\t\n\t',
						'./run.tests.sh': '\v',
						'../assets/img/logo.v2.png': true,
						'/mnt/storage/video.archive/episode.01.mkv': false,
						'../.local/bin/script.sh': true,
						'/usr/local/share/.fonts/CustomFont.otf': '',
						'../../development/branch.name/some.test': true,
						'/Home/user/.ssh/config': true,
						'./hidden.dir/.subhidden': '\f',
						'/tmp/.temp.folder/cache.db': true,
						'/opt/software/v3.2.1/build.log': '  ',
						'': true,
						'./scripts/.old.build.sh': true,
						'/var/data/datafile.2025-02-05.json': '\n',
						'\n\n': true,
						'\t': true,
						'\v': true,
						'\f': true,
						'\r\n': true,
						'\f\f': true,
						'../lib/some_library.v1.0.1.so': '\r\n',
						'/dev/shm/.shared_resource': 1234,
					}), PromptsType.prompt),
					{
						'../assets/img/logo.v2.png': true,
						'/mnt/storage/video.archive/episode.01.mkv': false,
						'../.local/bin/script.sh': true,
						'../../development/branch.name/some.test': true,
						'/Home/user/.ssh/config': true,
						'/tmp/.temp.folder/cache.db': true,
						'./scripts/.old.build.sh': true,
					},
					'Must read correct value.',
				);
			});

			test('only invalid or false values', () => {
				assert.deepStrictEqual(
					PromptsConfig.getLocationsValue(createMock({
						'/etc/hosts.backup': '\t\n\t',
						'./run.tests.sh': '\v',
						'../assets/IMG/logo.v2.png': '',
						'/mnt/storage/video.archive/episode.01.mkv': false,
						'/usr/local/share/.fonts/CustomFont.otf': '',
						'./hidden.dir/.subhidden': '\f',
						'/opt/Software/v3.2.1/build.log': '  ',
						'/var/data/datafile.2025-02-05.json': '\n',
						'../lib/some_library.v1.0.1.so': '\r\n',
						'/dev/shm/.shared_resource': 2345,
					}), PromptsType.prompt),
					{
						'/mnt/storage/video.archive/episode.01.mkv': false,
					},
					'Must read correct value.',
				);
			});

			test('skill locations - empty', () => {
				assert.deepStrictEqual(
					PromptsConfig.getLocationsValue(createMock({}), PromptsType.skill),
					{},
					'Must read correct value for skills.',
				);
			});

			test('skill locations - valid paths', () => {
				assert.deepStrictEqual(
					PromptsConfig.getLocationsValue(createMock({
						'.github/skills': true,
						'.claude/skills': true,
						'/custom/skills/folder': true,
						'./relative/skills': true,
					}), PromptsType.skill),
					{
						'.github/skills': true,
						'.claude/skills': true,
						'/custom/skills/folder': true,
						'./relative/skills': true,
					},
					'Must read correct skill locations.',
				);
			});

			test('skill locations - filters invalid entries', () => {
				assert.deepStrictEqual(
					PromptsConfig.getLocationsValue(createMock({
						'.github/skills': true,
						'.claude/skills': '\t\n',
						'/invalid/path': '',
						'': true,
						'./valid/skills': true,
						'\n': true,
					}), PromptsType.skill),
					{
						'.github/skills': true,
						'./valid/skills': true,
					},
					'Must filter invalid skill locations.',
				);
			});
		});
	});

	suite('sourceLocations', () => {
		test('undefined', () => {
			const configService = createMock(undefined);

			assert.deepStrictEqual(
				getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.prompt)),
				[],
				'Must read correct value.',
			);
		});

		test('null', () => {
			const configService = createMock(null);

			assert.deepStrictEqual(
				getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.prompt)),
				[],
				'Must read correct value.',
			);
		});

		suite('object', () => {
			test('empty', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({}), PromptsType.prompt)),
					['.github/prompts'],
					'Must read correct value.',
				);
			});

			test('only valid strings', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({
						'/root/.bashrc': true,
						'../../folder/.hidden-folder/config.xml': true,
						'/srv/www/Public_html/.htaccess': true,
						'../../another.folder/.WEIRD_FILE.log': true,
						'./folder.name/file.name': true,
						'/media/external/backup.tar.gz': true,
						'/Media/external/.secret.backup': true,
						'../relative/path.to.file': true,
						'./folderName.with.dots/more.dots.extension': true,
						'some/folder.with.dots/another.file': true,
						'/var/logs/app.01.05.error': true,
						'.GitHub/prompts': true,
						'./.tempfile': true,
					}), PromptsType.prompt)),
					[
						'.github/prompts',
						'/root/.bashrc',
						'../../folder/.hidden-folder/config.xml',
						'/srv/www/Public_html/.htaccess',
						'../../another.folder/.WEIRD_FILE.log',
						'./folder.name/file.name',
						'/media/external/backup.tar.gz',
						'/Media/external/.secret.backup',
						'../relative/path.to.file',
						'./folderName.with.dots/more.dots.extension',
						'some/folder.with.dots/another.file',
						'/var/logs/app.01.05.error',
						'.GitHub/prompts',
						'./.tempfile',
					],
					'Must read correct value.',
				);
			});

			test('filters out non valid entries', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({
						'/etc/hosts.backup': '\t\n\t',
						'./run.tests.sh': '\v',
						'../assets/img/logo.v2.png': true,
						'/mnt/storage/video.archive/episode.01.mkv': false,
						'../.local/bin/script.sh': true,
						'/usr/local/share/.fonts/CustomFont.otf': '',
						'../../development/branch.name/some.test': true,
						'.giThub/prompts': true,
						'/Home/user/.ssh/config': true,
						'./hidden.dir/.subhidden': '\f',
						'/tmp/.temp.folder/cache.db': true,
						'.github/prompts': true,
						'/opt/software/v3.2.1/build.log': '  ',
						'': true,
						'./scripts/.old.build.sh': true,
						'/var/data/datafile.2025-02-05.json': '\n',
						'\n\n': true,
						'\t': true,
						'\v': true,
						'\f': true,
						'\r\n': true,
						'\f\f': true,
						'../lib/some_library.v1.0.1.so': '\r\n',
						'/dev/shm/.shared_resource': 2345,
					}), PromptsType.prompt)),
					[
						'.github/prompts',
						'../assets/img/logo.v2.png',
						'../.local/bin/script.sh',
						'../../development/branch.name/some.test',
						'.giThub/prompts',
						'/Home/user/.ssh/config',
						'/tmp/.temp.folder/cache.db',
						'./scripts/.old.build.sh',
					],
					'Must read correct value.',
				);
			});

			test('only invalid or false values', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({
						'/etc/hosts.backup': '\t\n\t',
						'./run.tests.sh': '\v',
						'../assets/IMG/logo.v2.png': '',
						'/mnt/storage/video.archive/episode.01.mkv': false,
						'/usr/local/share/.fonts/CustomFont.otf': '',
						'./hidden.dir/.subhidden': '\f',
						'/opt/Software/v3.2.1/build.log': '  ',
						'/var/data/datafile.2025-02-05.json': '\n',
						'../lib/some_library.v1.0.1.so': '\r\n',
						'/dev/shm/.shared_resource': 7654,
					}), PromptsType.prompt)),
					[
						'.github/prompts',
					],
					'Must read correct value.',
				);
			});

			test('filters out disabled default location', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({
						'/etc/hosts.backup': '\t\n\t',
						'./run.tests.sh': '\v',
						'.github/prompts': false,
						'../assets/img/logo.v2.png': true,
						'/mnt/storage/video.archive/episode.01.mkv': false,
						'../.local/bin/script.sh': true,
						'/usr/local/share/.fonts/CustomFont.otf': '',
						'../../development/branch.name/some.test': true,
						'.giThub/prompts': true,
						'/Home/user/.ssh/config': true,
						'./hidden.dir/.subhidden': '\f',
						'/tmp/.temp.folder/cache.db': true,
						'/opt/software/v3.2.1/build.log': '  ',
						'': true,
						'./scripts/.old.build.sh': true,
						'/var/data/datafile.2025-02-05.json': '\n',
						'\n\n': true,
						'\t': true,
						'\v': true,
						'\f': true,
						'\r\n': true,
						'\f\f': true,
						'../lib/some_library.v1.0.1.so': '\r\n',
						'/dev/shm/.shared_resource': 853,
					}), PromptsType.prompt)),
					[
						'../assets/img/logo.v2.png',
						'../.local/bin/script.sh',
						'../../development/branch.name/some.test',
						'.giThub/prompts',
						'/Home/user/.ssh/config',
						'/tmp/.temp.folder/cache.db',
						'./scripts/.old.build.sh',
					],
					'Must read correct value.',
				);
			});
		});

		suite('skills', () => {
			test('undefined returns empty array', () => {
				const configService = createMock(undefined);

				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.skill)),
					[],
					'Must return empty array for undefined config.',
				);
			});

			test('null returns empty array', () => {
				const configService = createMock(null);

				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.skill)),
					[],
					'Must return empty array for null config.',
				);
			});

			test('empty object returns default skill folders', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({}), PromptsType.skill)),
					['.github/skills', '.agents/skills', '.claude/skills', '~/.copilot/skills', '~/.agents/skills', '~/.claude/skills'],
					'Must return default skill folders.',
				);
			});

			test('includes custom skill folders', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({
						'/custom/skills': true,
						'./local/skills': true,
					}), PromptsType.skill)),
					[
						'.github/skills',
						'.agents/skills',
						'.claude/skills',
						'~/.copilot/skills',
						'~/.agents/skills',
						'~/.claude/skills',
						'/custom/skills',
						'./local/skills',
					],
					'Must include custom skill folders.',
				);
			});

			test('filters out disabled default skill folders', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({
						'.github/skills': false,
						'/custom/skills': true,
					}), PromptsType.skill)),
					[
						'.agents/skills',
						'.claude/skills',
						'~/.copilot/skills',
						'~/.agents/skills',
						'~/.claude/skills',
						'/custom/skills',
					],
					'Must filter out disabled .github/skills folder.',
				);
			});

			test('filters out all disabled default skill folders', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({
						'.github/skills': false,
						'.agents/skills': false,
						'.claude/skills': false,
						'~/.copilot/skills': false,
						'~/.agents/skills': false,
						'~/.claude/skills': false,
						'/only/custom/skills': true,
					}), PromptsType.skill)),
					[
						'/only/custom/skills',
					],
					'Must filter out all disabled default folders.',
				);
			});

			test('filters out invalid entries', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({
						'/valid/skills': true,
						'/invalid/path': '\t\n',
						'': true,
						'./another/valid': true,
						'\n': true,
					}), PromptsType.skill)),
					[
						'.github/skills',
						'.agents/skills',
						'.claude/skills',
						'~/.copilot/skills',
						'~/.agents/skills',
						'~/.claude/skills',
						'/valid/skills',
						'./another/valid',
					],
					'Must filter out invalid entries.',
				);
			});

			test('includes all default folders when explicitly enabled', () => {
				assert.deepStrictEqual(
					getPaths(PromptsConfig.promptSourceFolders(createMock({
						'.github/skills': true,
						'.agents/skills': true,
						'.claude/skills': true,
						'~/.copilot/skills': true,
						'~/.agents/skills': true,
						'~/.claude/skills': true,
						'/extra/skills': true,
					}), PromptsType.skill)),
					[
						'.github/skills',
						'.agents/skills',
						'.claude/skills',
						'~/.copilot/skills',
						'~/.agents/skills',
						'~/.claude/skills',
						'/extra/skills',
					],
					'Must include all default folders.',
				);
			});
		});
	});
});
