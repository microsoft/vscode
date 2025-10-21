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
				[PromptsConfig.KEY, PromptsConfig.PROMPT_LOCATIONS_KEY, PromptsConfig.INSTRUCTIONS_LOCATION_KEY, PromptsConfig.MODE_LOCATION_KEY].includes(key),
				`Unsupported configuration key '${key}'.`,
			);

			return value;
		},
	});
}

suite('PromptsConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('enabled', () => {
		test('true', () => {
			const configService = createMock(true);

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				true,
				'Must read correct enablement value.',
			);
		});

		test('false', () => {
			const configService = createMock(false);

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				false,
				'Must read correct enablement value.',
			);
		});

		test('null', () => {
			const configService = createMock(null);

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				false,
				'Must read correct enablement value.',
			);
		});

		test('string', () => {
			const configService = createMock('');

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				false,
				'Must read correct enablement value.',
			);
		});

		test('true string', () => {
			const configService = createMock('TRUE');

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				true,
				'Must read correct enablement value.',
			);
		});

		test('false string', () => {
			const configService = createMock('FaLsE');

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				false,
				'Must read correct enablement value.',
			);
		});

		test('number', () => {
			const configService = createMock(3456);

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				false,
				'Must read correct enablement value.',
			);
		});

		test('NaN', () => {
			const configService = createMock(NaN);

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				false,
				'Must read correct enablement value.',
			);
		});

		test('bigint', () => {
			const configService = createMock(BigInt(5257));

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				false,
				'Must read correct enablement value.',
			);
		});

		test('symbol', () => {
			const configService = createMock(Symbol('test'));

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				false,
				'Must read correct enablement value.',
			);
		});

		test('object', () => {
			const configService = createMock({
				'.github/prompts': false,
			});

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				false,
				'Must read correct enablement value.',
			);
		});

		test('array', () => {
			const configService = createMock(['.github/prompts']);

			assert.strictEqual(
				PromptsConfig.enabled(configService),
				false,
				'Must read correct enablement value.',
			);
		});
	});


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
		});
	});

	suite('sourceLocations', () => {
		test('undefined', () => {
			const configService = createMock(undefined);

			assert.deepStrictEqual(
				PromptsConfig.promptSourceFolders(configService, PromptsType.prompt),
				[],
				'Must read correct value.',
			);
		});

		test('null', () => {
			const configService = createMock(null);

			assert.deepStrictEqual(
				PromptsConfig.promptSourceFolders(configService, PromptsType.prompt),
				[],
				'Must read correct value.',
			);
		});

		suite('object', () => {
			test('empty', () => {
				assert.deepStrictEqual(
					PromptsConfig.promptSourceFolders(createMock({}), PromptsType.prompt),
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
					}), PromptsType.prompt),
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
						'/dev/shm/.shared_resource': 2345,
					}), PromptsType.prompt),
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
						'/dev/shm/.shared_resource': 7654,
					}), PromptsType.prompt),
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
						'/dev/shm/.shared_resource': 853,
					}), PromptsType.prompt),
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

	suite('getPromptFilesRecommendationsValue', () => {
		/**
		 * Create a mock config service with inspect support for testing prompt file recommendations.
		 */
		function createInspectMock(inspectedValue: {
			userValue?: Record<string, boolean | string>;
			workspaceValue?: Record<string, boolean | string>;
			workspaceFolderValue?: Record<string, boolean | string>;
			defaultValue?: Record<string, boolean | string>;
		}): IConfigurationService {
			return mockService<IConfigurationService>({
				inspect<T>(key: string) {
					assert.strictEqual(key, PromptsConfig.PROMPT_FILES_SUGGEST_KEY, `Expected key '${PromptsConfig.PROMPT_FILES_SUGGEST_KEY}', got '${key}'.`);
					return inspectedValue as any;
				},
			});
		}

		test('user settings override workspace settings', () => {
			// User sets plan-fast to false, workspace sets it to true
			const configService = createInspectMock({
				userValue: { 'plan-fast': false },
				workspaceValue: { 'plan-fast': true, 'plan-deep': true },
			});

			const result = PromptsConfig.getPromptFilesRecommendationsValue(configService);

			assert.deepStrictEqual(
				result,
				{
					'plan-fast': false,  // User setting takes priority
					'plan-deep': true,   // Workspace setting used when user hasn't set it
				},
				'User settings must override workspace settings for the same property.',
			);
		});

		test('user settings override workspace folder settings', () => {
			const configService = createInspectMock({
				userValue: { 'prompt-a': false },
				workspaceFolderValue: { 'prompt-a': true, 'prompt-b': 'resourceLangId == typescript' },
			});

			const result = PromptsConfig.getPromptFilesRecommendationsValue(configService);

			assert.deepStrictEqual(
				result,
				{
					'prompt-a': false,  // User setting takes priority
					'prompt-b': 'resourceLangId == typescript',  // Folder setting used when user hasn't set it
				},
				'User settings must override workspace folder settings.',
			);
		});

		test('workspace settings override workspace folder settings', () => {
			const configService = createInspectMock({
				workspaceValue: { 'prompt-x': true },
				workspaceFolderValue: { 'prompt-x': false, 'prompt-y': true },
			});

			const result = PromptsConfig.getPromptFilesRecommendationsValue(configService);

			assert.deepStrictEqual(
				result,
				{
					'prompt-x': true,  // Workspace setting takes priority over folder
					'prompt-y': true,
				},
				'Workspace settings must override workspace folder settings.',
			);
		});

		test('only user settings', () => {
			const configService = createInspectMock({
				userValue: { 'my-prompt': true, 'another-prompt': 'resourceExtname == .js' },
			});

			const result = PromptsConfig.getPromptFilesRecommendationsValue(configService);

			assert.deepStrictEqual(
				result,
				{
					'my-prompt': true,
					'another-prompt': 'resourceExtname == .js',
				},
				'Must correctly read user settings.',
			);
		});

		test('only workspace settings', () => {
			const configService = createInspectMock({
				workspaceValue: { 'workspace-prompt': false },
			});

			const result = PromptsConfig.getPromptFilesRecommendationsValue(configService);

			assert.deepStrictEqual(
				result,
				{
					'workspace-prompt': false,
				},
				'Must correctly read workspace settings.',
			);
		});

		test('empty configuration', () => {
			const configService = createInspectMock({});

			const result = PromptsConfig.getPromptFilesRecommendationsValue(configService);

			assert.strictEqual(
				result,
				undefined,
				'Must return undefined when no configuration is set.',
			);
		});

		test('filters invalid values', () => {
			const configService = createInspectMock({
				userValue: {
					'valid-bool': true,
					'valid-string': 'resourceLangId == markdown',
					'invalid-empty-string': '',
					'invalid-whitespace': '   ',
					'valid-false': false,
				},
			});

			const result = PromptsConfig.getPromptFilesRecommendationsValue(configService);

			assert.deepStrictEqual(
				result,
				{
					'valid-bool': true,
					'valid-string': 'resourceLangId == markdown',
					'valid-false': false,
				},
				'Must filter out invalid values.',
			);
		});

		test('trims prompt names', () => {
			const configService = createInspectMock({
				userValue: {
					'  prompt-with-spaces  ': true,
					'normal-prompt': false,
				},
			});

			const result = PromptsConfig.getPromptFilesRecommendationsValue(configService);

			assert.deepStrictEqual(
				result,
				{
					'prompt-with-spaces': true,
					'normal-prompt': false,
				},
				'Must trim whitespace from prompt names.',
			);
		});

		test('complex merge scenario', () => {
			// Complex scenario with all levels
			const configService = createInspectMock({
				userValue: {
					'user-only': true,
					'override-all': 'user-value',
				},
				workspaceValue: {
					'workspace-only': false,
					'override-all': 'workspace-value',
					'override-workspace-folder': true,
				},
				workspaceFolderValue: {
					'folder-only': 'resourceExtname == .html',
					'override-all': 'folder-value',
					'override-workspace-folder': false,
				},
				defaultValue: {
					'default-only': true,
					'override-all': 'default-value',
				},
			});

			const result = PromptsConfig.getPromptFilesRecommendationsValue(configService);

			assert.deepStrictEqual(
				result,
				{
					'user-only': true,
					'override-all': 'user-value',  // User takes highest priority
					'workspace-only': false,
					'override-workspace-folder': true,  // Workspace overrides folder
					'folder-only': 'resourceExtname == .html',
					'default-only': true,
				},
				'Must correctly merge all configuration levels with proper priority.',
			);
		});
	});
});
