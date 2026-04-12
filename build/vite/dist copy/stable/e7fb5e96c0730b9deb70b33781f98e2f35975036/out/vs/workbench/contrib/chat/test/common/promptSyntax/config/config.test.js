/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mockService } from '../utils/mock.js';
import { PromptsConfig } from '../../../../common/promptSyntax/config/config.js';
import { PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
/**
 * Helper to extract just the paths from IPromptSourceFolder array for testing.
 */
function getPaths(folders) {
    return folders.map(f => f.path);
}
/**
 * Mocked instance of {@link IConfigurationService}.
 */
function createMock(value) {
    return mockService({
        getValue(key) {
            assert(typeof key === 'string', `Expected string configuration key, got '${typeof key}'.`);
            assert([PromptsConfig.PROMPT_LOCATIONS_KEY, PromptsConfig.INSTRUCTIONS_LOCATION_KEY, PromptsConfig.MODE_LOCATION_KEY, PromptsConfig.SKILLS_LOCATION_KEY].includes(key), `Unsupported configuration key '${key}'.`);
            return value;
        },
    });
}
suite('PromptsConfig', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('getLocationsValue', () => {
        test('undefined', () => {
            const configService = createMock(undefined);
            assert.strictEqual(PromptsConfig.getLocationsValue(configService, PromptsType.prompt), undefined, 'Must read correct value.');
        });
        test('null', () => {
            const configService = createMock(null);
            assert.strictEqual(PromptsConfig.getLocationsValue(configService, PromptsType.prompt), undefined, 'Must read correct value.');
        });
        test('undefined for skill', () => {
            const configService = createMock(undefined);
            assert.strictEqual(PromptsConfig.getLocationsValue(configService, PromptsType.skill), undefined, 'Must read correct value for skills.');
        });
        test('null for skill', () => {
            const configService = createMock(null);
            assert.strictEqual(PromptsConfig.getLocationsValue(configService, PromptsType.skill), undefined, 'Must read correct value for skills.');
        });
        suite('object', () => {
            test('empty', () => {
                assert.deepStrictEqual(PromptsConfig.getLocationsValue(createMock({}), PromptsType.prompt), {}, 'Must read correct value.');
            });
            test('only valid strings', () => {
                assert.deepStrictEqual(PromptsConfig.getLocationsValue(createMock({
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
                }), PromptsType.prompt), {
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
                }, 'Must read correct value.');
            });
            test('filters out non valid entries', () => {
                assert.deepStrictEqual(PromptsConfig.getLocationsValue(createMock({
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
                }), PromptsType.prompt), {
                    '../assets/img/logo.v2.png': true,
                    '/mnt/storage/video.archive/episode.01.mkv': false,
                    '../.local/bin/script.sh': true,
                    '../../development/branch.name/some.test': true,
                    '/Home/user/.ssh/config': true,
                    '/tmp/.temp.folder/cache.db': true,
                    './scripts/.old.build.sh': true,
                }, 'Must read correct value.');
            });
            test('only invalid or false values', () => {
                assert.deepStrictEqual(PromptsConfig.getLocationsValue(createMock({
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
                }), PromptsType.prompt), {
                    '/mnt/storage/video.archive/episode.01.mkv': false,
                }, 'Must read correct value.');
            });
            test('skill locations - empty', () => {
                assert.deepStrictEqual(PromptsConfig.getLocationsValue(createMock({}), PromptsType.skill), {}, 'Must read correct value for skills.');
            });
            test('skill locations - valid paths', () => {
                assert.deepStrictEqual(PromptsConfig.getLocationsValue(createMock({
                    '.github/skills': true,
                    '.claude/skills': true,
                    '/custom/skills/folder': true,
                    './relative/skills': true,
                }), PromptsType.skill), {
                    '.github/skills': true,
                    '.claude/skills': true,
                    '/custom/skills/folder': true,
                    './relative/skills': true,
                }, 'Must read correct skill locations.');
            });
            test('skill locations - filters invalid entries', () => {
                assert.deepStrictEqual(PromptsConfig.getLocationsValue(createMock({
                    '.github/skills': true,
                    '.claude/skills': '\t\n',
                    '/invalid/path': '',
                    '': true,
                    './valid/skills': true,
                    '\n': true,
                }), PromptsType.skill), {
                    '.github/skills': true,
                    './valid/skills': true,
                }, 'Must filter invalid skill locations.');
            });
        });
    });
    suite('sourceLocations', () => {
        test('undefined', () => {
            const configService = createMock(undefined);
            assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.prompt)), [], 'Must read correct value.');
        });
        test('null', () => {
            const configService = createMock(null);
            assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.prompt)), [], 'Must read correct value.');
        });
        suite('object', () => {
            test('empty', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({}), PromptsType.prompt)), ['.github/prompts'], 'Must read correct value.');
            });
            test('only valid strings', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({
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
                }), PromptsType.prompt)), [
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
                ], 'Must read correct value.');
            });
            test('filters out non valid entries', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({
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
                }), PromptsType.prompt)), [
                    '.github/prompts',
                    '../assets/img/logo.v2.png',
                    '../.local/bin/script.sh',
                    '../../development/branch.name/some.test',
                    '.giThub/prompts',
                    '/Home/user/.ssh/config',
                    '/tmp/.temp.folder/cache.db',
                    './scripts/.old.build.sh',
                ], 'Must read correct value.');
            });
            test('only invalid or false values', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({
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
                }), PromptsType.prompt)), [
                    '.github/prompts',
                ], 'Must read correct value.');
            });
            test('filters out disabled default location', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({
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
                }), PromptsType.prompt)), [
                    '../assets/img/logo.v2.png',
                    '../.local/bin/script.sh',
                    '../../development/branch.name/some.test',
                    '.giThub/prompts',
                    '/Home/user/.ssh/config',
                    '/tmp/.temp.folder/cache.db',
                    './scripts/.old.build.sh',
                ], 'Must read correct value.');
            });
        });
        suite('skills', () => {
            test('undefined returns empty array', () => {
                const configService = createMock(undefined);
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.skill)), [], 'Must return empty array for undefined config.');
            });
            test('null returns empty array', () => {
                const configService = createMock(null);
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.skill)), [], 'Must return empty array for null config.');
            });
            test('empty object returns default skill folders', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({}), PromptsType.skill)), ['.github/skills', '.agents/skills', '.claude/skills', '~/.copilot/skills', '~/.agents/skills', '~/.claude/skills'], 'Must return default skill folders.');
            });
            test('includes custom skill folders', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({
                    '/custom/skills': true,
                    './local/skills': true,
                }), PromptsType.skill)), [
                    '.github/skills',
                    '.agents/skills',
                    '.claude/skills',
                    '~/.copilot/skills',
                    '~/.agents/skills',
                    '~/.claude/skills',
                    '/custom/skills',
                    './local/skills',
                ], 'Must include custom skill folders.');
            });
            test('filters out disabled default skill folders', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({
                    '.github/skills': false,
                    '/custom/skills': true,
                }), PromptsType.skill)), [
                    '.agents/skills',
                    '.claude/skills',
                    '~/.copilot/skills',
                    '~/.agents/skills',
                    '~/.claude/skills',
                    '/custom/skills',
                ], 'Must filter out disabled .github/skills folder.');
            });
            test('filters out all disabled default skill folders', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({
                    '.github/skills': false,
                    '.agents/skills': false,
                    '.claude/skills': false,
                    '~/.copilot/skills': false,
                    '~/.agents/skills': false,
                    '~/.claude/skills': false,
                    '/only/custom/skills': true,
                }), PromptsType.skill)), [
                    '/only/custom/skills',
                ], 'Must filter out all disabled default folders.');
            });
            test('filters out invalid entries', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({
                    '/valid/skills': true,
                    '/invalid/path': '\t\n',
                    '': true,
                    './another/valid': true,
                    '\n': true,
                }), PromptsType.skill)), [
                    '.github/skills',
                    '.agents/skills',
                    '.claude/skills',
                    '~/.copilot/skills',
                    '~/.agents/skills',
                    '~/.claude/skills',
                    '/valid/skills',
                    './another/valid',
                ], 'Must filter out invalid entries.');
            });
            test('includes all default folders when explicitly enabled', () => {
                assert.deepStrictEqual(getPaths(PromptsConfig.promptSourceFolders(createMock({
                    '.github/skills': true,
                    '.agents/skills': true,
                    '.claude/skills': true,
                    '~/.copilot/skills': true,
                    '~/.agents/skills': true,
                    '~/.claude/skills': true,
                    '/extra/skills': true,
                }), PromptsType.skill)), [
                    '.github/skills',
                    '.agents/skills',
                    '.claude/skills',
                    '~/.copilot/skills',
                    '~/.agents/skills',
                    '~/.claude/skills',
                    '/extra/skills',
                ], 'Must include all default folders.');
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvY29uZmlnLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUMvQyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDakYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzdFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBSXpHOztHQUVHO0FBQ0gsU0FBUyxRQUFRLENBQUMsT0FBOEI7SUFDL0MsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2pDLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsVUFBVSxDQUFJLEtBQVE7SUFDOUIsT0FBTyxXQUFXLENBQXdCO1FBQ3pDLFFBQVEsQ0FBQyxHQUFzQztZQUM5QyxNQUFNLENBQ0wsT0FBTyxHQUFHLEtBQUssUUFBUSxFQUN2QiwyQ0FBMkMsT0FBTyxHQUFHLElBQUksQ0FDekQsQ0FBQztZQUVGLE1BQU0sQ0FDTCxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsRUFBRSxhQUFhLENBQUMseUJBQXlCLEVBQUUsYUFBYSxDQUFDLGlCQUFpQixFQUFFLGFBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFDL0osa0NBQWtDLEdBQUcsSUFBSSxDQUN6QyxDQUFDO1lBRUYsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO0tB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