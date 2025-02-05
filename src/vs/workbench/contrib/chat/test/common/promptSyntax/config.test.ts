/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomInt } from '../../../../../../base/common/numbers.js';
import { PromptFilesConfig } from '../../../common/promptSyntax/config.js';
import { randomBoolean } from '../../../../../../base/test/common/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

/**
 * Mocked mocked instance of {@link IConfigurationService}.
 */
const createMock = <T>(value: T): IConfigurationService => {
	const service = new Proxy(
		{},
		{
			get: (_target, key) => {
				assert.strictEqual(
					key,
					'getValue',
					`Mocked configuration service supports only one method: 'getValue()'.`,
				);

				return (key: string) => {
					assert.strictEqual(
						key,
						PromptFilesConfig.CONFIG_KEY,
						`Mocked service supports only one configuration key: '${PromptFilesConfig.CONFIG_KEY}'.`,
					);

					return value;
				};
			},
		});

	// note! it's ok to `as IConfigurationService` here, because of the runtime checks in the Proxy getter
	return service as Pick<IConfigurationService, 'getValue'> as IConfigurationService;
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
					PromptFilesConfig.getValue(createMock('./relative-path/to/folder')),
					'./relative-path/to/folder',
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('.github/prompts')),
					'.github/prompts',
					'Must read correct value.',
				);

				assert.strictEqual(
					PromptFilesConfig.getValue(createMock('/abs/path/to/file.prompt.md')),
					'/abs/path/to/file.prompt.md',
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
						'.github/prompts',
						'/abs/path/to/file.prompt.md',
					])),
					[
						'/absolute/path/to/folder',
						'./relative-path/to/folder',
						'.github/prompts',
						'/abs/path/to/file.prompt.md',
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
						'./scripts/build.sh',
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
						'./.config/subfolder.file',
						undefined,
						'/usr/share/man/man1/bash.1',
						null,
					])),
					[
						'/usr/local/bin/.hidden-tool',
						'../config/.env.example',
						'./scripts/build.sh',
						'/home/user/Documents/report.v1.pdf',
						'tmp/.cache/.session.lock',
						'/var/log/backup.2025-02-05.log',
						'../.git/hooks/pre-commit.sample',
						'/opt/app/data/config.yaml',
						'./.config/subfolder.file',
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
					[],
					'Must read correct value.',
				);
			});

			test('• only valid strings', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.getValue(createMock({
						'/root/.bashrc': true,
						'../../folder/.hidden-folder/config.xml': true,
						'/srv/www/public_html/.htaccess': true,
						'../../another.folder/.weird_file.log': true,
						'./folder.name/file.name': true,
						'/media/external/backup.tar.gz': true,
						'/media/external/.secret.backup': true,
						'../relative/path.to.file': true,
						'./folderName.with.dots/more.dots.extension': true,
						'some/folder.with.dots/another.file': true,
						'/var/logs/app.01.05.error': true,
						'./.tempfile': true,
					})),
					[
						'/root/.bashrc',
						'../../folder/.hidden-folder/config.xml',
						'/srv/www/public_html/.htaccess',
						'../../another.folder/.weird_file.log',
						'./folder.name/file.name',
						'/media/external/backup.tar.gz',
						'/media/external/.secret.backup',
						'../relative/path.to.file',
						'./folderName.with.dots/more.dots.extension',
						'some/folder.with.dots/another.file',
						'/var/logs/app.01.05.error',
						'./.tempfile'
					],
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
						'/home/user/.ssh/config': true,
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
						'/home/user/.ssh/config',
						'/tmp/.temp.folder/cache.db',
						'./scripts/.old.build.sh',
					],
					'Must read correct value.',
				);
			});

			test('• only invalid or false values', () => {
				assert.deepStrictEqual(
					PromptFilesConfig.getValue(createMock({
						'/etc/hosts.backup': '\t\n\t',
						'./run.tests.sh': '\v',
						'../assets/img/logo.v2.png': '',
						'/mnt/storage/video.archive/episode.01.mkv': false,
						'/usr/local/share/.fonts/CustomFont.otf': '',
						'./hidden.dir/.subhidden': '\f',
						'/opt/software/v3.2.1/build.log': '  ',
						'/var/data/datafile.2025-02-05.json': '\n',
						'../lib/some_library.v1.0.1.so': '\r\n',
						'/dev/shm/.shared_resource': randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
					})),
					[],
					'Must read correct value.',
				);
			});
		});

		suite('• array immutability', () => {
			test('• empty input array case', () => {
				assert.throws(() => {
					const value = PromptFilesConfig.getValue(createMock([]));

					// sanity check
					assert(
						Array.isArray(value),
						'Must return an array.',
					);

					// note! we have to type case here to be able to test for immutability
					(value as unknown as string[]).push('/usr/src/kernel/module.build');
				});
			});

			test('• empty result array case', () => {
				assert.throws(() => {
					const value = PromptFilesConfig.getValue(createMock([
						randomBoolean(),
						'\n\n',
						'\v\t',
						randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
						'   ',
					]));

					// sanity check
					assert(
						Array.isArray(value),
						'Must return an array.',
					);

					// note! we have to type case here to be able to test for immutability
					(value as unknown as string[]).push('../../archive/old.logs/app.10-12-2025.log');
				});
			});

			test('• empty input object case', () => {
				assert.throws(() => {
					const value = PromptFilesConfig.getValue(createMock({}));

					// sanity check
					assert(
						Array.isArray(value),
						'Must return an array.',
					);

					// note! we have to type case here to be able to test for immutability
					(value as unknown as string[]).push('./local.repo/.gitignore');
				});
			});

			test('• empty result array case (object input)', () => {
				assert.throws(() => {
					const value = PromptFilesConfig.getValue(createMock({
						'/etc/hostname.backup': '\t\n\t',
						'./run.tests.bat': '\v',
						'/mnt/storage/video.archive/episode.02.mkv': false,
						'/usr/local/share/.fonts/CustomFont.ttf': '',
						'./hidden.dir/.subhiddenfile': '\f',
						'/opt/software/v3.2.1/build.log.old': '  ',
						'': true,
						'/var/data/datafile.2025-03-05.json': '\n',
						'\n\n': true,
						'\t': true,
						'\v': true,
						'\f': true,
						'\r\n': true,
						'\f\f': true,
						'../lib/some_library.v1.0.2.so': '\r\n',
						'/dev/shm/.shared_resource.tmp': randomInt(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
					}));

					// sanity check
					assert(
						Array.isArray(value),
						'Must return an array.',
					);

					// note! we have to type case here to be able to test for immutability
					(value as unknown as string[]).push('/etc/systemd/system/app.service');
				});
			});
		});
	});
});
