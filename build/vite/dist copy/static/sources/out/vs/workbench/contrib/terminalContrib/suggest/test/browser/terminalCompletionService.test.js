/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TerminalCompletionService } from '../../browser/terminalCompletionService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import assert, { fail } from 'assert';
import { isWindows } from '../../../../../../base/common/platform.js';
import { createFileStat } from '../../../../../test/common/workbenchTestServices.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ShellEnvDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/shellEnvDetectionCapability.js';
import { TerminalCompletionItemKind } from '../../browser/terminalCompletionItem.js';
import { count } from '../../../../../../base/common/strings.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { gitBashToWindowsPath, windowsToGitBashPath } from '../../browser/terminalGitBashHelpers.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestPathService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
const pathSeparator = isWindows ? '\\' : '/';
/**
 * Assert the set of completions exist exactly, including their order.
 */
function assertCompletions(actual, expected, expectedConfig, pathSep) {
    const sep = pathSep ?? pathSeparator;
    assert.deepStrictEqual(actual?.map(e => ({
        label: e.label,
        detail: e.detail ?? '',
        kind: e.kind ?? TerminalCompletionItemKind.Folder,
        replacementRange: e.replacementRange,
    })), expected.map(e => ({
        label: e.label.replaceAll('/', sep),
        detail: e.detail ? e.detail.replaceAll('/', sep) : '',
        kind: e.kind ?? TerminalCompletionItemKind.Folder,
        replacementRange: expectedConfig.replacementRange,
    })));
}
/**
 * Assert a set of completions exist within the actual set.
 */
function assertPartialCompletionsExist(actual, expectedPartial, expectedConfig) {
    if (!actual) {
        fail();
    }
    const expectedMapped = expectedPartial.map(e => ({
        label: e.label.replaceAll('/', pathSeparator),
        detail: e.detail ? e.detail.replaceAll('/', pathSeparator) : '',
        kind: e.kind ?? TerminalCompletionItemKind.Folder,
        replacementRange: expectedConfig.replacementRange,
    }));
    for (const expectedItem of expectedMapped) {
        assert.deepStrictEqual(actual.map(e => ({
            label: e.label,
            detail: e.detail ?? '',
            kind: e.kind ?? TerminalCompletionItemKind.Folder,
            replacementRange: e.replacementRange,
        })).find(e => e.detail === expectedItem.detail), expectedItem);
    }
}
const testEnv = {
    HOME: '/home/user',
    USERPROFILE: '/home/user'
};
let homeDir = isWindows ? testEnv['USERPROFILE'] : testEnv['HOME'];
if (!homeDir.endsWith('/')) {
    homeDir += '/';
}
const standardTildeItem = Object.freeze({ label: '~', detail: homeDir });
suite('TerminalCompletionService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationService;
    let capabilities;
    let validResources;
    let childResources;
    let terminalCompletionService;
    const provider = 'testProvider';
    setup(() => {
        instantiationService = workbenchInstantiationService({
            pathService: () => new TestPathService(URI.file(homeDir ?? '/')),
        }, store);
        const normalizePath = (path) => path === '/' ? path : path.replace(/\/+$/, '');
        const doesResourceExist = (resource) => validResources.some(e => normalizePath(e.path) === normalizePath(resource.path)) || childResources.some(e => normalizePath(e.resource.path) === normalizePath(resource.path));
        configurationService = new TestConfigurationService();
        instantiationService.stub(ITerminalLogService, new NullLogService());
        instantiationService.stub(IConfigurationService, configurationService);
        instantiationService.stub(IFileService, {
            async stat(resource) {
                if (!doesResourceExist(resource)) {
                    throw new Error('Doesn\'t exist');
                }
                return createFileStat(resource);
            },
            async resolve(resource, options) {
                if (!doesResourceExist(resource)) {
                    throw new Error('Doesn\'t exist');
                }
                const children = childResources.filter(child => {
                    const childFsPath = child.resource.path.replace(/\/$/, '');
                    const parentFsPath = resource.path.replace(/\/$/, '');
                    return (childFsPath.startsWith(parentFsPath) &&
                        count(childFsPath, '/') === count(parentFsPath, '/') + 1);
                });
                return createFileStat(resource, undefined, undefined, undefined, undefined, children);
            },
            async realpath(resource) {
                if (resource.path.includes('symlink-file')) {
                    return resource.with({ path: '/target/actual-file.txt' });
                }
                else if (resource.path.includes('symlink-folder')) {
                    return resource.with({ path: '/target/actual-folder' });
                }
                return undefined;
            }
        });
        terminalCompletionService = store.add(instantiationService.createInstance(TerminalCompletionService));
        terminalCompletionService.processEnv = testEnv;
        validResources = [];
        childResources = [];
        capabilities = store.add(new TerminalCapabilityStore());
    });
    suite('resolveResources should return undefined', () => {
        test('if neither showFiles nor showDirectories are true', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                pathSeparator
            };
            validResources = [URI.parse('file:///test')];
            const result = await terminalCompletionService.resolveResources(resourceOptions, 'cd ', 3, provider, capabilities);
            assert(!result);
        });
    });
    suite('resolveResources should return folder completions', () => {
        setup(() => {
            validResources = [URI.parse('file:///test')];
            childResources = [
                { resource: URI.parse('file:///test/folder1/'), isDirectory: true, isFile: false },
                { resource: URI.parse('file:///test/file1.txt'), isDirectory: false, isFile: true },
            ];
        });
        test('| should return root-level completions', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            const result = await terminalCompletionService.resolveResources(resourceOptions, '', 1, provider, capabilities);
            assertCompletions(result, [
                { label: '.', detail: '/test/' },
                { label: './folder1/', detail: '/test/folder1/' },
                { label: '../', detail: '/' },
                standardTildeItem,
            ], { replacementRange: [1, 1] });
        });
        test('./| should return folder completions', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            const result = await terminalCompletionService.resolveResources(resourceOptions, './', 3, provider, capabilities);
            assertCompletions(result, [
                { label: './', detail: '/test/' },
                { label: './folder1/', detail: '/test/folder1/' },
                { label: './../', detail: '/' },
            ], { replacementRange: [1, 3] });
        });
        test('../| should return parent folder completions', async () => {
            // Scenario: cwd is /parent/folder1, sibling is /parent/folder2
            // When typing ../, should see contents of /parent/ (folder1 and folder2)
            validResources = [
                URI.parse('file:///parent/folder1'),
                URI.parse('file:///parent'),
            ];
            childResources = [
                { resource: URI.parse('file:///parent/folder1/'), isDirectory: true },
                { resource: URI.parse('file:///parent/folder2/'), isDirectory: true },
            ];
            const resourceOptions = {
                cwd: URI.parse('file:///parent/folder1'),
                showDirectories: true,
                pathSeparator
            };
            const result = await terminalCompletionService.resolveResources(resourceOptions, '../', 3, provider, capabilities);
            assertCompletions(result, [
                { label: '../', detail: '/parent/' },
                { label: '../folder1/', detail: '/parent/folder1/' },
                { label: '../folder2/', detail: '/parent/folder2/' },
                { label: '../../', detail: '/' },
            ], { replacementRange: [0, 3] });
        });
        test('cd ./| should return folder completions', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            const result = await terminalCompletionService.resolveResources(resourceOptions, 'cd ./', 5, provider, capabilities);
            assertCompletions(result, [
                { label: './', detail: '/test/' },
                { label: './folder1/', detail: '/test/folder1/' },
                { label: './../', detail: '/' },
            ], { replacementRange: [3, 5] });
        });
        test('cd ./f| should return folder completions', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            const result = await terminalCompletionService.resolveResources(resourceOptions, 'cd ./f', 6, provider, capabilities);
            assertCompletions(result, [
                { label: './', detail: '/test/' },
                { label: './folder1/', detail: '/test/folder1/' },
                { label: './../', detail: '/' },
            ], { replacementRange: [3, 6] });
        });
    });
    suite('resolveResources should handle file and folder completion requests correctly', () => {
        setup(() => {
            validResources = [URI.parse('file:///test')];
            childResources = [
                { resource: URI.parse('file:///test/.hiddenFile'), isFile: true, executable: true },
                { resource: URI.parse('file:///test/.hiddenFolder/'), isDirectory: true },
                { resource: URI.parse('file:///test/folder1/'), isDirectory: true },
                { resource: URI.parse('file:///test/file1.txt'), isFile: true, executable: true },
            ];
        });
        test('./| should handle hidden files and folders', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                showFiles: true,
                pathSeparator
            };
            const result = await terminalCompletionService.resolveResources(resourceOptions, './', 2, provider, capabilities);
            assertCompletions(result, [
                { label: './', detail: '/test/' },
                { label: './.hiddenFile', detail: '/test/.hiddenFile', kind: TerminalCompletionItemKind.File },
                { label: './.hiddenFolder/', detail: '/test/.hiddenFolder/' },
                { label: './folder1/', detail: '/test/folder1/' },
                { label: './file1.txt', detail: '/test/file1.txt', kind: TerminalCompletionItemKind.File },
                { label: './../', detail: '/' },
            ], { replacementRange: [0, 2] });
        });
        test('./h| should handle hidden files and folders', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                showFiles: true,
                pathSeparator
            };
            const result = await terminalCompletionService.resolveResources(resourceOptions, './h', 3, provider, capabilities);
            assertCompletions(result, [
                { label: './', detail: '/test/' },
                { label: './.hiddenFile', detail: '/test/.hiddenFile', kind: TerminalCompletionItemKind.File },
                { label: './.hiddenFolder/', detail: '/test/.hiddenFolder/' },
                { label: './folder1/', detail: '/test/folder1/' },
                { label: './file1.txt', detail: '/test/file1.txt', kind: TerminalCompletionItemKind.File },
                { label: './../', detail: '/' },
            ], { replacementRange: [0, 3] });
        });
    });
    suite('~ -> $HOME', () => {
        let resourceOptions;
        let shellEnvDetection;
        setup(() => {
            shellEnvDetection = store.add(new ShellEnvDetectionCapability());
            shellEnvDetection.setEnvironment({
                HOME: '/home',
                USERPROFILE: '/home'
            }, true);
            capabilities.add(5 /* TerminalCapability.ShellEnvDetection */, shellEnvDetection);
            resourceOptions = {
                cwd: URI.parse('file:///test/folder1'), // Updated to reflect home directory
                showFiles: true,
                showDirectories: true,
                pathSeparator
            };
            validResources = [
                URI.parse('file:///test'),
                URI.parse('file:///test/folder1'),
                URI.parse('file:///home'),
                URI.parse('file:///home/vscode'),
                URI.parse('file:///home/vscode/foo'),
                URI.parse('file:///home/vscode/bar.txt'),
            ];
            childResources = [
                { resource: URI.parse('file:///home/vscode'), isDirectory: true },
                { resource: URI.parse('file:///home/vscode/foo'), isDirectory: true },
                { resource: URI.parse('file:///home/vscode/bar.txt'), isFile: true, executable: true },
            ];
        });
        test('~| should return completion for ~', async () => {
            assertPartialCompletionsExist(await terminalCompletionService.resolveResources(resourceOptions, '~', 1, provider, capabilities), [
                { label: '~', detail: '/home/' },
            ], { replacementRange: [0, 1] });
        });
        test('~/| should return folder completions relative to $HOME', async () => {
            assertCompletions(await terminalCompletionService.resolveResources(resourceOptions, '~/', 2, provider, capabilities), [
                { label: '~/', detail: '/home/' },
                { label: '~/vscode/', detail: '/home/vscode/' },
            ], { replacementRange: [0, 2] });
        });
        test('~/vscode/| should return folder completions relative to $HOME/vscode', async () => {
            assertCompletions(await terminalCompletionService.resolveResources(resourceOptions, '~/vscode/', 9, provider, capabilities), [
                { label: '~/vscode/', detail: '/home/vscode/' },
                { label: '~/vscode/foo/', detail: '/home/vscode/foo/' },
                { label: '~/vscode/bar.txt', detail: '/home/vscode/bar.txt', kind: TerminalCompletionItemKind.File },
            ], { replacementRange: [0, 9] });
        });
    });
    suite('resolveResources edge cases and advanced scenarios', () => {
        setup(() => {
            validResources = [];
            childResources = [];
        });
        if (isWindows) {
            test('C:/Foo/| absolute paths on Windows', async () => {
                const resourceOptions = {
                    cwd: URI.parse('file:///C:'),
                    showDirectories: true,
                    pathSeparator
                };
                validResources = [URI.parse('file:///C:/Foo')];
                childResources = [
                    { resource: URI.parse('file:///C:/Foo/Bar'), isDirectory: true, isFile: false },
                    { resource: URI.parse('file:///C:/Foo/Baz.txt'), isDirectory: false, isFile: true }
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, 'C:/Foo/', 7, provider, capabilities);
                assertCompletions(result, [
                    { label: 'C:/Foo/', detail: 'C:/Foo/' },
                    { label: 'C:/Foo/Bar/', detail: 'C:/Foo/Bar/' },
                ], { replacementRange: [0, 7] });
            });
            test('c:/foo/| case insensitivity on Windows', async () => {
                const resourceOptions = {
                    cwd: URI.parse('file:///c:'),
                    showDirectories: true,
                    pathSeparator
                };
                validResources = [URI.parse('file:///c:/foo')];
                childResources = [
                    { resource: URI.parse('file:///c:/foo/Bar'), isDirectory: true, isFile: false }
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, 'c:/foo/', 7, provider, capabilities);
                assertCompletions(result, [
                    // Note that the detail is normalizes drive letters to capital case intentionally
                    { label: 'c:/foo/', detail: 'C:/foo/' },
                    { label: 'c:/foo/Bar/', detail: 'C:/foo/Bar/' },
                ], { replacementRange: [0, 7] });
            });
        }
        else {
            test('/foo/| absolute paths NOT on Windows', async () => {
                const resourceOptions = {
                    cwd: URI.parse('file:///'),
                    showDirectories: true,
                    pathSeparator
                };
                validResources = [URI.parse('file:///foo')];
                childResources = [
                    { resource: URI.parse('file:///foo/Bar'), isDirectory: true, isFile: false },
                    { resource: URI.parse('file:///foo/Baz.txt'), isDirectory: false, isFile: true }
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, '/foo/', 5, provider, capabilities);
                assertCompletions(result, [
                    { label: '/foo/', detail: '/foo/' },
                    { label: '/foo/Bar/', detail: '/foo/Bar/' },
                ], { replacementRange: [0, 5] });
            });
        }
        if (isWindows) {
            test('.\\folder | Case insensitivity should resolve correctly on Windows', async () => {
                const resourceOptions = {
                    cwd: URI.parse('file:///C:/test'),
                    showDirectories: true,
                    pathSeparator: '\\'
                };
                validResources = [URI.parse('file:///C:/test')];
                childResources = [
                    { resource: URI.parse('file:///C:/test/FolderA/'), isDirectory: true },
                    { resource: URI.parse('file:///C:/test/anotherFolder/'), isDirectory: true }
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, '.\\folder', 8, provider, capabilities);
                assertCompletions(result, [
                    { label: '.\\', detail: 'C:\\test\\' },
                    { label: '.\\FolderA\\', detail: 'C:\\test\\FolderA\\' },
                    { label: '.\\anotherFolder\\', detail: 'C:\\test\\anotherFolder\\' },
                    { label: '.\\..\\', detail: 'C:\\' },
                ], { replacementRange: [0, 8] });
            });
        }
        else {
            test('./folder | Case sensitivity should resolve correctly on Mac/Unix', async () => {
                const resourceOptions = {
                    cwd: URI.parse('file:///test'),
                    showDirectories: true,
                    pathSeparator: '/'
                };
                validResources = [URI.parse('file:///test')];
                childResources = [
                    { resource: URI.parse('file:///test/FolderA/'), isDirectory: true },
                    { resource: URI.parse('file:///test/foldera/'), isDirectory: true }
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, './folder', 8, provider, capabilities);
                assertCompletions(result, [
                    { label: './', detail: '/test/' },
                    { label: './FolderA/', detail: '/test/FolderA/' },
                    { label: './foldera/', detail: '/test/foldera/' },
                    { label: './../', detail: '/' }
                ], { replacementRange: [0, 8] });
            });
        }
        test('| Empty input should resolve to current directory', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            validResources = [URI.parse('file:///test')];
            childResources = [
                { resource: URI.parse('file:///test/folder1/'), isDirectory: true },
                { resource: URI.parse('file:///test/folder2/'), isDirectory: true }
            ];
            const result = await terminalCompletionService.resolveResources(resourceOptions, '', 0, provider, capabilities);
            assertCompletions(result, [
                { label: '.', detail: '/test/' },
                { label: './folder1/', detail: '/test/folder1/' },
                { label: './folder2/', detail: '/test/folder2/' },
                { label: '../', detail: '/' },
                standardTildeItem,
            ], { replacementRange: [0, 0] });
        });
        test('should ignore environment variable setting prefixes', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            validResources = [URI.parse('file:///test')];
            childResources = [
                { resource: URI.parse('file:///test/folder1/'), isDirectory: true },
                { resource: URI.parse('file:///test/folder2/'), isDirectory: true }
            ];
            const result = await terminalCompletionService.resolveResources(resourceOptions, 'FOO=./', 2, provider, capabilities);
            // Must not include FOO= prefix in completions
            assertCompletions(result, [
                { label: '.', detail: '/test/' },
                { label: './folder1/', detail: '/test/folder1/' },
                { label: './folder2/', detail: '/test/folder2/' },
                { label: '../', detail: '/' },
                standardTildeItem,
            ], { replacementRange: [0, 2] });
        });
        test('should not return completions when relative folder prefix does not exist', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            validResources = [URI.parse('file:///test')];
            childResources = [
                { resource: URI.parse('file:///test/src/'), isDirectory: true },
                { resource: URI.parse('file:///test/vs/'), isDirectory: true }
            ];
            const result = await terminalCompletionService.resolveResources(resourceOptions, 's/', 2, provider, capabilities);
            assert.strictEqual(result, undefined);
        });
        test('./| should handle large directories with many results gracefully', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            validResources = [URI.parse('file:///test')];
            childResources = Array.from({ length: 1000 }, (_, i) => ({
                resource: URI.parse(`file:///test/folder${i}/`),
                isDirectory: true
            }));
            const result = await terminalCompletionService.resolveResources(resourceOptions, './', 2, provider, capabilities);
            assert(result);
            // includes the 1000 folders + ./ and ./../
            assert.strictEqual(result?.length, 1002);
            assert.strictEqual(result[0].label, `.${pathSeparator}`);
            assert.strictEqual(result.at(-1)?.label, `.${pathSeparator}..${pathSeparator}`);
        });
        test('./folder| should include current folder with trailing / is missing', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            validResources = [URI.parse('file:///test')];
            childResources = [
                { resource: URI.parse('file:///test/folder1/'), isDirectory: true },
                { resource: URI.parse('file:///test/folder2/'), isDirectory: true }
            ];
            const result = await terminalCompletionService.resolveResources(resourceOptions, './folder1', 10, provider, capabilities);
            assertCompletions(result, [
                { label: './', detail: '/test/' },
                { label: './folder1/', detail: '/test/folder1/' },
                { label: './folder2/', detail: '/test/folder2/' },
                { label: './../', detail: '/' }
            ], { replacementRange: [1, 10] });
        });
        test('should resolve nested folder when name matches cwd basename', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            validResources = [
                URI.parse('file:///test'),
                URI.parse('file:///test/test'),
            ];
            childResources = [
                { resource: URI.parse('file:///test/test/'), isDirectory: true },
                { resource: URI.parse('file:///test/test/inner/'), isDirectory: true }
            ];
            const result = await terminalCompletionService.resolveResources(resourceOptions, 'test/', 5, provider, capabilities);
            assertCompletions(result, [
                { label: './test/', detail: '/test/test/' },
                { label: './test/inner/', detail: '/test/test/inner/' },
                // ../` from the viewed folder (/test/test/) goes to /test/, not /
                { label: './test/../', detail: '/test/' }
            ], { replacementRange: [0, 5] });
        });
        test('test/| should normalize current and parent folders', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                pathSeparator
            };
            validResources = [
                URI.parse('file:///test'),
                URI.parse('file:///test/folder1'),
                URI.parse('file:///test/folder2')
            ];
            childResources = [
                { resource: URI.parse('file:///test/folder1/'), isDirectory: true },
                { resource: URI.parse('file:///test/folder2/'), isDirectory: true }
            ];
            const result = await terminalCompletionService.resolveResources(resourceOptions, './test/', 7, provider, capabilities);
            assertCompletions(result, [
                { label: './test/', detail: '/test/' },
                { label: './test/folder1/', detail: '/test/folder1/' },
                { label: './test/folder2/', detail: '/test/folder2/' },
                { label: './test/../', detail: '/' }
            ], { replacementRange: [0, 7] });
        });
    });
    suite('cdpath', () => {
        let shellEnvDetection;
        setup(() => {
            validResources = [
                URI.parse('file:///test'),
                URI.parse('file:///cdpath_value')
            ];
            childResources = [
                { resource: URI.parse('file:///cdpath_value/folder1/'), isDirectory: true },
                { resource: URI.parse('file:///cdpath_value/file1.txt'), isFile: true },
            ];
            shellEnvDetection = store.add(new ShellEnvDetectionCapability());
            shellEnvDetection.setEnvironment({ CDPATH: '/cdpath_value' }, true);
            capabilities.add(5 /* TerminalCapability.ShellEnvDetection */, shellEnvDetection);
        });
        test('cd | should show paths from $CDPATH (relative)', async () => {
            configurationService.setUserConfiguration('terminal.integrated.suggest.cdPath', 'relative');
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                showFiles: true,
                pathSeparator
            };
            const result = await terminalCompletionService.resolveResources(resourceOptions, 'cd ', 3, provider, capabilities);
            assertPartialCompletionsExist(result, [
                { label: 'folder1', detail: 'CDPATH /cdpath_value/folder1/' },
            ], { replacementRange: [3, 3] });
        });
        test('cd | should show paths from $CDPATH (absolute)', async () => {
            configurationService.setUserConfiguration('terminal.integrated.suggest.cdPath', 'absolute');
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                showFiles: true,
                pathSeparator
            };
            const result = await terminalCompletionService.resolveResources(resourceOptions, 'cd ', 3, provider, capabilities);
            assertPartialCompletionsExist(result, [
                { label: '/cdpath_value/folder1/', detail: 'CDPATH' },
            ], { replacementRange: [3, 3] });
        });
        test('cd | should support pulling from multiple paths in $CDPATH', async () => {
            configurationService.setUserConfiguration('terminal.integrated.suggest.cdPath', 'relative');
            const pathPrefix = isWindows ? 'c:\\' : '/';
            const delimeter = isWindows ? ';' : ':';
            const separator = isWindows ? '\\' : '/';
            shellEnvDetection.setEnvironment({ CDPATH: `${pathPrefix}cdpath1_value${delimeter}${pathPrefix}cdpath2_value${separator}inner_dir` }, true);
            const uriPathPrefix = isWindows ? 'file:///c:/' : 'file:///';
            validResources = [
                URI.parse(`${uriPathPrefix}test`),
                URI.parse(`${uriPathPrefix}cdpath1_value`),
                URI.parse(`${uriPathPrefix}cdpath2_value`),
                URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir`)
            ];
            childResources = [
                { resource: URI.parse(`${uriPathPrefix}cdpath1_value/folder1/`), isDirectory: true },
                { resource: URI.parse(`${uriPathPrefix}cdpath1_value/folder2/`), isDirectory: true },
                { resource: URI.parse(`${uriPathPrefix}cdpath1_value/file1.txt`), isFile: true },
                { resource: URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir/folder1/`), isDirectory: true },
                { resource: URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir/folder2/`), isDirectory: true },
                { resource: URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir/file1.txt`), isFile: true },
            ];
            const resourceOptions = {
                cwd: URI.parse(`${uriPathPrefix}test`),
                showDirectories: true,
                showFiles: true,
                pathSeparator
            };
            const result = await terminalCompletionService.resolveResources(resourceOptions, 'cd ', 3, provider, capabilities);
            const finalPrefix = isWindows ? 'C:\\' : '/';
            assertPartialCompletionsExist(result, [
                { label: 'folder1', detail: `CDPATH ${finalPrefix}cdpath1_value/folder1/` },
                { label: 'folder2', detail: `CDPATH ${finalPrefix}cdpath1_value/folder2/` },
                { label: 'folder1', detail: `CDPATH ${finalPrefix}cdpath2_value/inner_dir/folder1/` },
                { label: 'folder2', detail: `CDPATH ${finalPrefix}cdpath2_value/inner_dir/folder2/` },
            ], { replacementRange: [3, 3] });
        });
    });
    if (isWindows) {
        suite('gitbash', () => {
            test('should convert Git Bash absolute path to Windows absolute path', () => {
                assert.strictEqual(gitBashToWindowsPath('/'), 'C:\\');
                assert.strictEqual(gitBashToWindowsPath('/c/'), 'C:\\');
                assert.strictEqual(gitBashToWindowsPath('/c/Users/foo'), 'C:\\Users\\foo');
                assert.strictEqual(gitBashToWindowsPath('/d/bar'), 'D:\\bar');
            });
            test('should convert Windows absolute path to Git Bash absolute path', () => {
                assert.strictEqual(windowsToGitBashPath('C:\\'), '/c/');
                assert.strictEqual(windowsToGitBashPath('C:\\Users\\foo'), '/c/Users/foo');
                assert.strictEqual(windowsToGitBashPath('D:\\bar'), '/d/bar');
                assert.strictEqual(windowsToGitBashPath('E:\\some\\path'), '/e/some/path');
            });
            test('resolveResources with c:/ style absolute path for Git Bash', async () => {
                const resourceOptions = {
                    cwd: URI.file('C:\\Users\\foo'),
                    showDirectories: true,
                    showFiles: true,
                    pathSeparator: '/'
                };
                validResources = [
                    URI.file('C:\\Users\\foo'),
                    URI.file('C:\\Users\\foo\\bar'),
                    URI.file('C:\\Users\\foo\\baz.txt')
                ];
                childResources = [
                    { resource: URI.file('C:\\Users\\foo\\bar'), isDirectory: true, isFile: false },
                    { resource: URI.file('C:\\Users\\foo\\baz.txt'), isFile: true, executable: true }
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, 'C:/Users/foo/', 13, provider, capabilities, "gitbash" /* WindowsShellType.GitBash */);
                assertCompletions(result, [
                    { label: 'C:/Users/foo/', detail: 'C:\\Users\\foo\\' },
                    { label: 'C:/Users/foo/bar/', detail: 'C:\\Users\\foo\\bar\\' },
                    { label: 'C:/Users/foo/baz.txt', detail: 'C:\\Users\\foo\\baz.txt', kind: TerminalCompletionItemKind.File },
                ], { replacementRange: [0, 13] }, '/');
            });
            test('resolveResources with cwd as Windows path (relative)', async () => {
                const resourceOptions = {
                    cwd: URI.file('C:\\Users\\foo'),
                    showDirectories: true,
                    showFiles: true,
                    pathSeparator: '/'
                };
                validResources = [
                    URI.file('C:\\Users\\foo'),
                    URI.file('C:\\Users\\foo\\bar'),
                    URI.file('C:\\Users\\foo\\baz.txt')
                ];
                childResources = [
                    { resource: URI.file('C:\\Users\\foo\\bar'), isDirectory: true },
                    { resource: URI.file('C:\\Users\\foo\\baz.txt'), isFile: true, executable: true }
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, './', 2, provider, capabilities, "gitbash" /* WindowsShellType.GitBash */);
                assertCompletions(result, [
                    { label: './', detail: 'C:\\Users\\foo\\' },
                    { label: './bar/', detail: 'C:\\Users\\foo\\bar\\' },
                    { label: './baz.txt', detail: 'C:\\Users\\foo\\baz.txt', kind: TerminalCompletionItemKind.File },
                    { label: './../', detail: 'C:\\Users\\' }
                ], { replacementRange: [0, 2] }, '/');
            });
            test('resolveResources with cwd as Windows path (absolute)', async () => {
                const resourceOptions = {
                    cwd: URI.file('C:\\Users\\foo'),
                    showDirectories: true,
                    showFiles: true,
                    pathSeparator: '/'
                };
                validResources = [
                    URI.file('C:\\Users\\foo'),
                    URI.file('C:\\Users\\foo\\bar'),
                    URI.file('C:\\Users\\foo\\baz.txt')
                ];
                childResources = [
                    { resource: URI.file('C:\\Users\\foo\\bar'), isDirectory: true },
                    { resource: URI.file('C:\\Users\\foo\\baz.txt'), isFile: true, executable: true }
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, '/c/Users/foo/', 13, provider, capabilities, "gitbash" /* WindowsShellType.GitBash */);
                assertCompletions(result, [
                    { label: '/c/Users/foo/', detail: 'C:\\Users\\foo\\' },
                    { label: '/c/Users/foo/bar/', detail: 'C:\\Users\\foo\\bar\\' },
                    { label: '/c/Users/foo/baz.txt', detail: 'C:\\Users\\foo\\baz.txt', kind: TerminalCompletionItemKind.File },
                ], { replacementRange: [0, 13] }, '/');
            });
        });
    }
    if (!isWindows) {
        suite('symlink support', () => {
            test('should include symlink target information in completions', async () => {
                const resourceOptions = {
                    cwd: URI.parse('file:///test'),
                    pathSeparator,
                    showFiles: true,
                    showDirectories: true
                };
                validResources = [URI.parse('file:///test')];
                // Create mock children including a symbolic link
                childResources = [
                    { resource: URI.parse('file:///test/regular-file.txt'), isFile: true },
                    { resource: URI.parse('file:///test/symlink-file'), isFile: true, isSymbolicLink: true },
                    { resource: URI.parse('file:///test/symlink-folder'), isDirectory: true, isSymbolicLink: true },
                    { resource: URI.parse('file:///test/regular-folder'), isDirectory: true },
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, 'ls ', 3, provider, capabilities);
                // Find the symlink completion
                const symlinkFileCompletion = result?.find(c => c.label === './symlink-file');
                const symlinkFolderCompletion = result?.find(c => c.label === './symlink-folder/');
                assert.strictEqual(symlinkFileCompletion?.detail, '/test/symlink-file -> /target/actual-file.txt', 'Symlink file detail should match target');
                assert.strictEqual(symlinkFolderCompletion?.detail, '/test/symlink-folder -> /target/actual-folder', 'Symlink folder detail should match target');
            });
        });
    }
    if (!isWindows) {
        suite('remote file completion (e.g. WSL)', () => {
            const remoteAuthority = 'wsl+Ubuntu';
            const remoteTestEnv = {
                HOME: '/home/remoteuser',
                USERPROFILE: '/home/remoteuser'
            };
            test('/absolute/path should preserve remote authority', async () => {
                terminalCompletionService.processEnv = remoteTestEnv;
                const resourceOptions = {
                    cwd: URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser' }),
                    showDirectories: true,
                    pathSeparator: '/'
                };
                validResources = [
                    URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home' }),
                    URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser' }),
                ];
                childResources = [
                    { resource: URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser' }), isDirectory: true },
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, '/home/', 6, provider, capabilities);
                // Check that results exist and have the correct scheme/authority
                assert.ok(result && result.length > 0, 'Should return completions for remote absolute path');
                // Verify completions contain paths resolved via the remote file service (not local file://)
                const absoluteCompletion = result?.find(c => c.label === '/home/');
                assert.ok(absoluteCompletion, 'Should have absolute path completion');
                assert.ok(absoluteCompletion.detail?.includes('/home/'), 'Detail should show remote path');
            });
            test('~/ should preserve remote authority for tilde expansion', async () => {
                terminalCompletionService.processEnv = remoteTestEnv;
                const resourceOptions = {
                    cwd: URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser/project' }),
                    showDirectories: true,
                    pathSeparator: '/'
                };
                validResources = [
                    URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser' }),
                    URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser/project' }),
                ];
                childResources = [
                    { resource: URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser/Documents' }), isDirectory: true },
                    { resource: URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser/project' }), isDirectory: true },
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, '~/', 2, provider, capabilities);
                // Check that results exist for remote tilde path
                assert.ok(result && result.length > 0, 'Should return completions for remote tilde path');
                // Verify the tilde path was resolved using the remote home directory
                const documentsCompletion = result?.find(c => c.detail?.includes('Documents'));
                assert.ok(documentsCompletion, 'Should find Documents folder from remote home');
            });
            test('./relative should preserve remote authority for relative paths', async () => {
                terminalCompletionService.processEnv = remoteTestEnv;
                const resourceOptions = {
                    cwd: URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser/project' }),
                    showDirectories: true,
                    pathSeparator: '/'
                };
                validResources = [
                    URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser/project' }),
                ];
                childResources = [
                    { resource: URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser/project/src' }), isDirectory: true },
                    { resource: URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: '/home/remoteuser/project/docs' }), isDirectory: true },
                ];
                const result = await terminalCompletionService.resolveResources(resourceOptions, './', 2, provider, capabilities);
                // Check that results exist for remote relative path
                assert.ok(result && result.length > 0, 'Should return completions for remote relative path');
                // Verify completions are from the remote filesystem
                const srcCompletion = result?.find(c => c.detail?.includes('/home/remoteuser/project/src'));
                assert.ok(srcCompletion, 'Should find src folder completion with remote path in detail');
            });
        });
    }
    suite('completion label escaping', () => {
        test('| should escape special characters in file/folder names for POSIX shells', async () => {
            const resourceOptions = {
                cwd: URI.parse('file:///test'),
                showDirectories: true,
                showFiles: true,
                pathSeparator
            };
            validResources = [URI.parse('file:///test')];
            childResources = [
                { resource: URI.parse('file:///test/[folder1]/'), isDirectory: true },
                { resource: URI.parse('file:///test/folder 2/'), isDirectory: true },
                { resource: URI.parse('file:///test/!special$chars&/'), isDirectory: true },
                { resource: URI.parse('file:///test/!special$chars2&'), isFile: true, executable: true }
            ];
            const result = await terminalCompletionService.resolveResources(resourceOptions, '', 0, provider, capabilities);
            assertCompletions(result, [
                { label: '.', detail: '/test/' },
                { label: './[folder1]/', detail: '/test/\[folder1]\/' },
                { label: './folder\ 2/', detail: '/test/folder\ 2/' },
                { label: './\!special\$chars\&/', detail: '/test/\!special\$chars\&/' },
                { label: './\!special\$chars2\&', detail: '/test/\!special\$chars2\&', kind: TerminalCompletionItemKind.File },
                { label: '../', detail: '/' },
                standardTildeItem,
            ], { replacementRange: [0, 0] });
        });
    });
    suite('Provider Configuration', () => {
        // Test class that extends TerminalCompletionService to access protected methods
        class TestTerminalCompletionService extends TerminalCompletionService {
            getEnabledProviders(providers) {
                return super._getEnabledProviders(providers);
            }
        }
        let testTerminalCompletionService;
        setup(() => {
            testTerminalCompletionService = store.add(instantiationService.createInstance(TestTerminalCompletionService));
        });
        // Mock provider for testing
        function createMockProvider(id) {
            return {
                id,
                provideCompletions: async () => [{
                        label: `completion-from-${id}`,
                        kind: TerminalCompletionItemKind.Method,
                        replacementRange: [0, 0],
                        provider: id
                    }]
            };
        }
        test('should enable providers by default when no configuration exists', () => {
            const defaultProvider = createMockProvider('terminal-suggest');
            const newProvider = createMockProvider('new-extension-provider');
            const providers = [defaultProvider, newProvider];
            // Set empty configuration (no provider keys)
            configurationService.setUserConfiguration("terminal.integrated.suggest.providers" /* TerminalSuggestSettingId.Providers */, {});
            const result = testTerminalCompletionService.getEnabledProviders(providers);
            // Both providers should be enabled since they're not explicitly disabled
            assert.strictEqual(result.length, 2, 'Should enable both providers by default');
            assert.ok(result.includes(defaultProvider), 'Should include default provider');
            assert.ok(result.includes(newProvider), 'Should include new provider');
        });
        test('should disable providers when explicitly set to false', () => {
            const provider1 = createMockProvider('provider1');
            const provider2 = createMockProvider('provider2');
            const providers = [provider1, provider2];
            // Disable provider1, leave provider2 unconfigured
            configurationService.setUserConfiguration("terminal.integrated.suggest.providers" /* TerminalSuggestSettingId.Providers */, {
                'provider1': false
            });
            const result = testTerminalCompletionService.getEnabledProviders(providers);
            // Only provider2 should be enabled
            assert.strictEqual(result.length, 1, 'Should enable only one provider');
            assert.ok(result.includes(provider2), 'Should include unconfigured provider');
            assert.ok(!result.includes(provider1), 'Should not include disabled provider');
        });
        test('should enable providers when explicitly set to true', () => {
            const provider1 = createMockProvider('provider1');
            const provider2 = createMockProvider('provider2');
            const providers = [provider1, provider2];
            // Explicitly enable provider1, leave provider2 unconfigured
            configurationService.setUserConfiguration("terminal.integrated.suggest.providers" /* TerminalSuggestSettingId.Providers */, {
                'provider1': true
            });
            const result = testTerminalCompletionService.getEnabledProviders(providers);
            // Both providers should be enabled
            assert.strictEqual(result.length, 2, 'Should enable both providers');
            assert.ok(result.includes(provider1), 'Should include explicitly enabled provider');
            assert.ok(result.includes(provider2), 'Should include unconfigured provider');
        });
        test('should handle mixed configuration correctly', () => {
            const provider1 = createMockProvider('provider1');
            const provider2 = createMockProvider('provider2');
            const provider3 = createMockProvider('provider3');
            const providers = [provider1, provider2, provider3];
            // Mixed configuration: enable provider1, disable provider2, leave provider3 unconfigured
            configurationService.setUserConfiguration("terminal.integrated.suggest.providers" /* TerminalSuggestSettingId.Providers */, {
                'provider1': true,
                'provider2': false
            });
            const result = testTerminalCompletionService.getEnabledProviders(providers);
            // provider1 and provider3 should be enabled, provider2 should be disabled
            assert.strictEqual(result.length, 2, 'Should enable two providers');
            assert.ok(result.includes(provider1), 'Should include explicitly enabled provider');
            assert.ok(result.includes(provider3), 'Should include unconfigured provider');
            assert.ok(!result.includes(provider2), 'Should not include disabled provider');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb21wbGV0aW9uU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3N1Z2dlc3QvdGVzdC9icm93c2VyL3Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFlBQVksRUFBc0QsTUFBTSxrREFBa0QsQ0FBQztBQUNwSSxPQUFPLEVBQUUseUJBQXlCLEVBQXVFLE1BQU0sNENBQTRDLENBQUM7QUFDNUosT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDdEMsT0FBTyxFQUFFLFNBQVMsRUFBNEIsTUFBTSwyQ0FBMkMsQ0FBQztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sb0ZBQW9GLENBQUM7QUFDN0gsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sd0ZBQXdGLENBQUM7QUFFckksT0FBTyxFQUF1QiwwQkFBMEIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0sd0RBQXdELENBQUM7QUFDL0csT0FBTyxFQUFF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