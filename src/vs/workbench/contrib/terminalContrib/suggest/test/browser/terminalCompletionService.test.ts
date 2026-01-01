/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IFileService, IFileStatWithMetadata, IResolveMetadataFileOptions } from '../../../../../../platform/files/common/files.js';
import { TerminalCompletionService, TerminalCompletionResourceOptions, type ITerminalCompletionProvider } from '../../browser/terminalCompletionService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import assert, { fail } from 'assert';
import { isWindows, type IProcessEnvironment } from '../../../../../../base/common/platform.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { createFileStat } from '../../../../../test/common/workbenchTestServices.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ShellEnvDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/shellEnvDetectionCapability.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalCompletion, TerminalCompletionItemKind } from '../../browser/terminalCompletionItem.js';
import { count } from '../../../../../../base/common/strings.js';
import { ITerminalLogService, WindowsShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { gitBashToWindowsPath, windowsToGitBashPath } from '../../browser/terminalGitBashHelpers.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TerminalSuggestSettingId } from '../../common/terminalSuggestConfiguration.js';
import { TestPathService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

const pathSeparator = isWindows ? '\\' : '/';

interface IAssertionTerminalCompletion {
	label: string;
	detail?: string;
	kind?: TerminalCompletionItemKind;
}

interface IAssertionCommandLineConfig {
	replacementRange: [number, number];
}

/**
 * Assert the set of completions exist exactly, including their order.
 */
function assertCompletions(actual: ITerminalCompletion[] | undefined, expected: IAssertionTerminalCompletion[], expectedConfig: IAssertionCommandLineConfig, pathSep?: string) {
	const sep = pathSep ?? pathSeparator;
	assert.deepStrictEqual(
		actual?.map(e => ({
			label: e.label,
			detail: e.detail ?? '',
			kind: e.kind ?? TerminalCompletionItemKind.Folder,
			replacementRange: e.replacementRange,
		})), expected.map(e => ({
			label: e.label.replaceAll('/', sep),
			detail: e.detail ? e.detail.replaceAll('/', sep) : '',
			kind: e.kind ?? TerminalCompletionItemKind.Folder,
			replacementRange: expectedConfig.replacementRange,
		}))
	);
}

/**
 * Assert a set of completions exist within the actual set.
 */
function assertPartialCompletionsExist(actual: ITerminalCompletion[] | undefined, expectedPartial: IAssertionTerminalCompletion[], expectedConfig: IAssertionCommandLineConfig) {
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

const testEnv: IProcessEnvironment = {
	HOME: '/home/user',
	USERPROFILE: '/home/user'
};

let homeDir = isWindows ? testEnv['USERPROFILE'] : testEnv['HOME'];
if (!homeDir!.endsWith('/')) {
	homeDir += '/';
}
const standardTildeItem = Object.freeze({ label: '~', detail: homeDir });

suite('TerminalCompletionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let capabilities: TerminalCapabilityStore;
	let validResources: URI[];
	let childResources: { resource: URI; isFile?: boolean; isDirectory?: boolean; isSymbolicLink?: boolean }[];
	let terminalCompletionService: TerminalCompletionService;
	const provider = 'testProvider';

	setup(() => {
		instantiationService = workbenchInstantiationService({
			pathService: () => new TestPathService(URI.file(homeDir ?? '/')),
		}, store);
		const normalizePath = (path: string) => path === '/' ? path : path.replace(/\/+$/, '');
		const doesResourceExist = (resource: URI) => validResources.some(e => normalizePath(e.path) === normalizePath(resource.path)) || childResources.some(e => normalizePath(e.resource.path) === normalizePath(resource.path));
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
			async resolve(resource: URI, options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata> {
				if (!doesResourceExist(resource)) {
					throw new Error('Doesn\'t exist');
				}
				const children = childResources.filter(child => {
					const childFsPath = child.resource.path.replace(/\/$/, '');
					const parentFsPath = resource.path.replace(/\/$/, '');
					return (
						childFsPath.startsWith(parentFsPath) &&
						count(childFsPath, '/') === count(parentFsPath, '/') + 1
					);
				});
				return createFileStat(resource, undefined, undefined, undefined, undefined, children);
			},
			async realpath(resource: URI): Promise<URI | undefined> {
				if (resource.path.includes('symlink-file')) {
					return resource.with({ path: '/target/actual-file.txt' });
				} else if (resource.path.includes('symlink-folder')) {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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

		test('cd ./| should return folder completions', async () => {
			const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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
				{ resource: URI.parse('file:///test/.hiddenFile'), isFile: true },
				{ resource: URI.parse('file:///test/.hiddenFolder/'), isDirectory: true },
				{ resource: URI.parse('file:///test/folder1/'), isDirectory: true },
				{ resource: URI.parse('file:///test/file1.txt'), isFile: true },
			];
		});

		test('./| should handle hidden files and folders', async () => {
			const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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
		let resourceOptions: TerminalCompletionResourceOptions;
		let shellEnvDetection: ShellEnvDetectionCapability;

		setup(() => {
			shellEnvDetection = store.add(new ShellEnvDetectionCapability());
			shellEnvDetection.setEnvironment({
				HOME: '/home',
				USERPROFILE: '/home'
			}, true);
			capabilities.add(TerminalCapability.ShellEnvDetection, shellEnvDetection);

			resourceOptions = {
				cwd: URI.parse('file:///test/folder1'),// Updated to reflect home directory
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
				{ resource: URI.parse('file:///home/vscode/bar.txt'), isFile: true },
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
				const resourceOptions: TerminalCompletionResourceOptions = {
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
				const resourceOptions: TerminalCompletionResourceOptions = {
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
		} else {
			test('/foo/| absolute paths NOT on Windows', async () => {
				const resourceOptions: TerminalCompletionResourceOptions = {
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
				const resourceOptions: TerminalCompletionResourceOptions = {
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
		} else {
			test('./folder | Case sensitivity should resolve correctly on Mac/Unix', async () => {
				const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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
				{ label: './test/../', detail: '/' }
			], { replacementRange: [0, 5] });
		});
		test('test/| should normalize current and parent folders', async () => {
			const resourceOptions: TerminalCompletionResourceOptions = {
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
		let shellEnvDetection: ShellEnvDetectionCapability;

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
			capabilities.add(TerminalCapability.ShellEnvDetection, shellEnvDetection);
		});

		test('cd | should show paths from $CDPATH (relative)', async () => {
			configurationService.setUserConfiguration('terminal.integrated.suggest.cdPath', 'relative');
			const resourceOptions: TerminalCompletionResourceOptions = {
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
			const resourceOptions: TerminalCompletionResourceOptions = {
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

			const resourceOptions: TerminalCompletionResourceOptions = {
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
				const resourceOptions: TerminalCompletionResourceOptions = {
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
					{ resource: URI.file('C:\\Users\\foo\\baz.txt'), isFile: true }
				];
				const result = await terminalCompletionService.resolveResources(resourceOptions, 'C:/Users/foo/', 13, provider, capabilities, WindowsShellType.GitBash);
				assertCompletions(result, [
					{ label: 'C:/Users/foo/', detail: 'C:\\Users\\foo\\' },
					{ label: 'C:/Users/foo/bar/', detail: 'C:\\Users\\foo\\bar\\' },
					{ label: 'C:/Users/foo/baz.txt', detail: 'C:\\Users\\foo\\baz.txt', kind: TerminalCompletionItemKind.File },
				], { replacementRange: [0, 13] }, '/');
			});
			test('resolveResources with cwd as Windows path (relative)', async () => {
				const resourceOptions: TerminalCompletionResourceOptions = {
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
					{ resource: URI.file('C:\\Users\\foo\\baz.txt'), isFile: true }
				];
				const result = await terminalCompletionService.resolveResources(resourceOptions, './', 2, provider, capabilities, WindowsShellType.GitBash);
				assertCompletions(result, [
					{ label: './', detail: 'C:\\Users\\foo\\' },
					{ label: './bar/', detail: 'C:\\Users\\foo\\bar\\' },
					{ label: './baz.txt', detail: 'C:\\Users\\foo\\baz.txt', kind: TerminalCompletionItemKind.File },
					{ label: './../', detail: 'C:\\Users\\' }
				], { replacementRange: [0, 2] }, '/');
			});

			test('resolveResources with cwd as Windows path (absolute)', async () => {
				const resourceOptions: TerminalCompletionResourceOptions = {
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
					{ resource: URI.file('C:\\Users\\foo\\baz.txt'), isFile: true }
				];
				const result = await terminalCompletionService.resolveResources(resourceOptions, '/c/Users/foo/', 13, provider, capabilities, WindowsShellType.GitBash);
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
				const resourceOptions: TerminalCompletionResourceOptions = {
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
	suite('completion label escaping', () => {
		test('| should escape special characters in file/folder names for POSIX shells', async () => {
			const resourceOptions: TerminalCompletionResourceOptions = {
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
				{ resource: URI.parse('file:///test/!special$chars2&'), isFile: true }
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
			public getEnabledProviders(providers: ITerminalCompletionProvider[]): ITerminalCompletionProvider[] {
				return super._getEnabledProviders(providers);
			}
		}

		let testTerminalCompletionService: TestTerminalCompletionService;

		setup(() => {
			testTerminalCompletionService = store.add(instantiationService.createInstance(TestTerminalCompletionService));
		});

		// Mock provider for testing
		function createMockProvider(id: string): ITerminalCompletionProvider {
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
			configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {});

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
			configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
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
			configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
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
			configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
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
