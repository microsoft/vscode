/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mockService } from './testUtils/mock.js';
import { randomInt } from '../../../../../../base/common/numbers.js';
import { PromptFilesConfig } from '../../../common/promptSyntax/config.js';
import { randomBoolean } from '../../../../../../base/test/common/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

/**
 * Mocked instance of {@link IConfigurationService}.
 */
const createMock = <T>(value: T): IConfigurationService => {
	return mockService<IConfigurationService>({
		getValue(key?: string | IConfigurationOverrides) {
			assert.strictEqual(
				key,
				PromptFilesConfig.CONFIG_KEY,
				`Mocked service supports only one configuration key: '${PromptFilesConfig.CONFIG_KEY}'.`,
			);

			return value;
		},
	});
};

suite('PromptFilesConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('• getValue', () => {
		test('• undefined', () => {
			const configService = createMock(undefined);

			assert.strictEqual(
				PromptFilesConfig.getValue(configService),
				undefined,
				'Must read correct value.',
			);
		});

		test('• null', () => {
			const configService = createMock(null);

			assert.strictEqual(
				PromptFilesConfig.getValue(configService),
				undefined,
				'Must read correct value.',
			);
		});

		suite('• string', () => {
			test('• empty', () => {
				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('')),
					undefined,
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('  ')),
					undefined,
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('\t')),
					undefined,
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('\v')),
					undefined,
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('\f')),
					undefined,
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('\n')),
					undefined,
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('\r\n')),
					undefined,
					'Must read correct value.',
				);
			});

			test('• true', () => {
				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('true')),
					true,
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('TRUE')),
					true,
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('TrUe')),
					true,
					'Must read correct value.',
				);
			});

			test('• false', () => {
				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('false')),
					false,
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('FALSE')),
					false,
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('fAlSe')),
					false,
					'Must read correct value.',
				);
			});

			test('• non-empty', () => {
				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('/absolute/path/to/folder')),
					'/absolute/path/to/folder',
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('/Absolute/path/to/folder')),
					'/Absolute/path/to/folder',
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('./relative-path/to/folder')),
					'./relative-path/to/folder',
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('./relative-path/To/folder')),
					'./relative-path/To/folder',
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('.github/prompts')),
					'.github/prompts',
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('.github/Prompts')),
					'.github/Prompts',
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('/abs/path/to/file.prompt.md')),
					'/abs/path/to/file.prompt.md',
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('/Abs/Path/To/File.prompt.md')),
					'/Abs/Path/To/File.prompt.md',
					'Must read correct value.',
				);
			});
		});

		test('• boolean', () => {
			assert.strictEqual(
				PromptFilesConfig.getValue(createMock(true)),
				true,
				'Must read correct value.',
			);

			assert.strictEqual(
				PromptFilesConfig.getValue(createMock(false)),
				false,
				'Must read correct value.',
			);
		});

		suite('• array', () => {
			test('• empty', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.getValue(createMock([])),
					[],
					'Must read correct value.',
				);
			});

			test('• valid strings', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.getValue(createMock([
						'/absolute/path/to/folder',
						'./relative-path/to/folder',
						'./another-Relative/Path/to/folder',
						'.github/prompts',
						'/abs/path/to/file.prompt.md',
						'/ABS/path/to/prompts/',
					])),
					[
						'/absolute/path/to/folder',
						'./relative-path/to/folder',
						'./another-Relative/Path/to/folder',
						'.github/prompts',
						'/abs/path/to/file.prompt.md',
						'/ABS/path/to/prompts/',
					],
					'Must read correct value.',
				);
			});

			test('• filters out not valid string values', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.getValue(createMock([
						'/usr/local/bin/.hidden-tool',
						'../config/.env.example',
						[
							'test',
							randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
						],
						'',
						'./scripts/BUILD.sh',
						randomBoolean(),
						'/home/user/Documents/report.v1.pdf',
						'tmp/.cache/.session.lock',
						'/var/log/backup.2025-02-05.log',
						{
							'key1': randomBoolean(),
							'key2': 'value2',
						},
						'../.git/hooks/pre-commit.sample',
						randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
						'\t\t',
						'/opt/app/data/config.yaml',
						'./.config/Subfolder.file',
						undefined,
						'/usr/share/man/man1/bash.1',
						null,
					])),
					[
						'/usr/local/bin/.hidden-tool',
						'../config/.env.example',
						'./scripts/BUILD.sh',
						'/home/user/Documents/report.v1.pdf',
						'tmp/.cache/.session.lock',
						'/var/log/backup.2025-02-05.log',
						'../.git/hooks/pre-commit.sample',
						'/opt/app/data/config.yaml',
						'./.config/Subfolder.file',
						'/usr/share/man/man1/bash.1',
					],
					'Must read correct value.',
				);
			});

			test('• only invalid values', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.getValue(createMock([
						null,
						undefined,
						'',
						'  ',
						'\t',
						'\v',
						'\f',
						'\n',
						'\r\n',
						{
							'some-key': randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
							'another-key': randomBoolean(),
							'one_more_key': '../relative/path.to.file',
						},
						[randomBoolean(), randomBoolean()],
						randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
					])),
					[],
					'Must read correct value.',
				);
			});
		});

		suite('• object', () => {
			test('• empty', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.getValue(createMock({})),
					{},
					'Must read correct value.',
				);
			});

			test('• only valid strings', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.getValue(createMock({
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
					})),
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

			test('• filters out non valid entries', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.getValue(createMock({
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
						'/dev/shm/.shared_resource': randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
					})),
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

			test('• only invalid or false values', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.getValue(createMock({
						'/etc/hosts.backup': '\t\n\t',
						'./run.tests.sh': '\v',
						'../assets/IMG/logo.v2.png': '',
						'/mnt/storage/video.archive/episode.01.mkv': false,
						'/usr/local/share/.fonts/CustomFont.otf': '',
						'./hidden.dir/.subhidden': '\f',
						'/opt/Software/v3.2.1/build.log': '  ',
						'/var/data/datafile.2025-02-05.json': '\n',
						'../lib/some_library.v1.0.1.so': '\r\n',
						'/dev/shm/.shared_resource': randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
					})),
					{
						'/mnt/storage/video.archive/episode.01.mkv': false,
					},
					'Must read correct value.',
				);
			});
		});
	});

	suite('• sourceLocations', () => {
		test('• undefined', () => {
			const configService = createMock(undefined);

			assert.deepStrictEqual(
				PromptFilesConfig.promptSourceFolders(configService),
				[],
				'Must read correct value.',
			);
		});

		test('• null', () => {
			const configService = createMock(null);

			assert.deepStrictEqual(
				PromptFilesConfig.promptSourceFolders(configService),
				[],
				'Must read correct value.',
			);
		});

		suite('• string', () => {
			test('• empty', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('')),
					[],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('  ')),
					[],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('\t')),
					[],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('\v')),
					[],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('\f')),
					[],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('\n')),
					[],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('\r\n')),
					[],
					'Must read correct value.',
				);
			});

			test('• true', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('true')),
					['.github/prompts'],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('TRUE')),
					['.github/prompts'],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('TrUe')),
					['.github/prompts'],
					'Must read correct value.',
				);
			});

			test('• false', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('false')),
					[],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('FALSE')),
					[],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('fAlSe')),
					[],
					'Must read correct value.',
				);
			});

			test('• non-empty', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('/absolute/path/to/folder')),
					['.github/prompts', '/absolute/path/to/folder'],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('/Absolute/path/to/folder')),
					['.github/prompts', '/Absolute/path/to/folder'],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('./relative-path/to/folder')),
					['.github/prompts', './relative-path/to/folder'],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('./relative-path/To/folder')),
					['.github/prompts', './relative-path/To/folder'],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('.github/prompts')),
					['.github/prompts'],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('.github/Prompts')),
					['.github/prompts', '.github/Prompts'],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('/abs/path/to/file.prompt.md')),
					['.github/prompts', '/abs/path/to/file.prompt.md'],
					'Must read correct value.',
				);

				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock('/Abs/Path/To/File.prompt.md')),
					['.github/prompts', '/Abs/Path/To/File.prompt.md'],
					'Must read correct value.',
				);
			});
		});

		test('• boolean', () => {
			assert.deepStrictEqual(
				PromptFilesConfig.promptSourceFolders(createMock(true)),
				['.github/prompts'],
				'Must read correct value.',
			);

			assert.deepStrictEqual(
				PromptFilesConfig.promptSourceFolders(createMock(false)),
				[],
				'Must read correct value.',
			);
		});

		suite('• array', () => {
			test('• empty', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock([])),
					['.github/prompts'],
					'Must read correct value.',
				);
			});

			test('• valid strings', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock([
						'/absolute/path/to/folder',
						'./relative-path/to/folder',
						'./another-Relative/Path/to/folder',
						'.github/prompts',
						'/abs/path/to/file.prompt.md',
						'.githuB/prompts',
						'/ABS/path/to/prompts/',
					])),
					[
						'.github/prompts',
						'/absolute/path/to/folder',
						'./relative-path/to/folder',
						'./another-Relative/Path/to/folder',
						'/abs/path/to/file.prompt.md',
						'.githuB/prompts',
						'/ABS/path/to/prompts/',
					],
					'Must read correct value.',
				);
			});

			test('• filters out not valid string values', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock([
						'/usr/local/bin/.hidden-tool',
						'../config/.env.example',
						[
							'test',
							randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
						],
						'',
						'./scripts/BUILD.sh',
						randomBoolean(),
						'/home/user/Documents/report.v1.pdf',
						'tmp/.cache/.session.lock',
						'/var/log/backup.2025-02-05.log',
						{
							'key1': randomBoolean(),
							'key2': 'value2',
						},
						'../.git/hooks/pre-commit.sample',
						randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
						'\t\t',
						'/opt/app/data/config.yaml',
						'./.config/Subfolder.file',
						undefined,
						'/usr/share/man/man1/bash.1',
						null,
					])),
					[
						'.github/prompts',
						'/usr/local/bin/.hidden-tool',
						'../config/.env.example',
						'./scripts/BUILD.sh',
						'/home/user/Documents/report.v1.pdf',
						'tmp/.cache/.session.lock',
						'/var/log/backup.2025-02-05.log',
						'../.git/hooks/pre-commit.sample',
						'/opt/app/data/config.yaml',
						'./.config/Subfolder.file',
						'/usr/share/man/man1/bash.1',
					],
					'Must read correct value.',
				);
			});

			test('• only invalid values', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock([
						null,
						undefined,
						'',
						'  ',
						'\t',
						'\v',
						'\f',
						'\n',
						'\r\n',
						{
							'some-key': randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
							'another-key': randomBoolean(),
							'one_more_key': '../relative/path.to.file',
						},
						[randomBoolean(), randomBoolean()],
						randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
					])),
					['.github/prompts'],
					'Must read correct value.',
				);
			});
		});

		suite('• object', () => {
			test('• empty', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock({})),
					['.github/prompts'],
					'Must read correct value.',
				);
			});

			test('• only valid strings', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock({
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
					})),
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

			test('• filters out non valid entries', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock({
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
						'/dev/shm/.shared_resource': randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
					})),
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

			test('• only invalid or false values', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock({
						'/etc/hosts.backup': '\t\n\t',
						'./run.tests.sh': '\v',
						'../assets/IMG/logo.v2.png': '',
						'/mnt/storage/video.archive/episode.01.mkv': false,
						'/usr/local/share/.fonts/CustomFont.otf': '',
						'./hidden.dir/.subhidden': '\f',
						'/opt/Software/v3.2.1/build.log': '  ',
						'/var/data/datafile.2025-02-05.json': '\n',
						'../lib/some_library.v1.0.1.so': '\r\n',
						'/dev/shm/.shared_resource': randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
					})),
					[
						'.github/prompts',
					],
					'Must read correct value.',
				);
			});

			test('• filters out disabled default location', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.promptSourceFolders(createMock({
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
						'/dev/shm/.shared_resource': randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
					})),
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
	});
});
