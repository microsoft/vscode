/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mockService } from './utils/mock.js';
import { PromptsConfig } from '../../common/config.js';
import { randomInt } from '../../../../base/common/numbers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../configuration/common/configuration.js';

/**
 * Mocked instance of {@link IConfigurationService}.
 */
const createMock = <T>(value: T): IConfigurationService => {
	return mockService<IConfigurationService>({
		getValue(key?: string | IConfigurationOverrides) {
			assert(
				typeof key === 'string',
				`Expected string configuration key, got '${typeof key}'.`,
			);

			assert(
				[PromptsConfig.KEY, PromptsConfig.LOCATIONS_KEY].includes(key),
				`Unsupported configuration key '${key}'.`,
			);

			return value;
		},
	});
};

suite('PromptsConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('• getLocationsValue', () => {
		test('• undefined', () => {
			const configService = createMock(undefined);

			assert.strictEqual(
				PromptsConfig.getLocationsValue(configService),
				undefined,
				'Must read correct value.',
			);
		});

		test('• null', () => {
			const configService = createMock(null);

			assert.strictEqual(
				PromptsConfig.getLocationsValue(configService),
				undefined,
				'Must read correct value.',
			);
		});

		suite('• object', () => {
			test('• empty', () => {
				assert.deepStrictEqual(
					PromptsConfig.getLocationsValue(createMock({})),
					{},
					'Must read correct value.',
				);
			});

			test('• only valid strings', () => {
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
				PromptsConfig.promptSourceFolders(configService),
				[],
				'Must read correct value.',
			);
		});

		test('• null', () => {
			const configService = createMock(null);

			assert.deepStrictEqual(
				PromptsConfig.promptSourceFolders(configService),
				[],
				'Must read correct value.',
			);
		});

		suite('object', () => {
			test('empty', () => {
				assert.deepStrictEqual(
					PromptsConfig.promptSourceFolders(createMock({})),
					['.github/prompts'],
					'Must read correct value.',
				);
			});

			test('only valid strings', () => {
				assert.deepStrictEqual(
					PromptsConfig.promptSourceFolders(createMock({
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

			test('filters out non valid entries', () => {
				assert.deepStrictEqual(
					PromptsConfig.promptSourceFolders(createMock({
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

			test('only invalid or false values', () => {
				assert.deepStrictEqual(
					PromptsConfig.promptSourceFolders(createMock({
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

			test('filters out disabled default location', () => {
				assert.deepStrictEqual(
					PromptsConfig.promptSourceFolders(createMock({
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
