/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IFileService, IFileStatWithMetadata, IResolveMetadataFileOptions } from '../../../../../../platform/files/common/files.js';
import { TerminalCompletionService, TerminalResourceRequestConfig } from '../../browser/terminalCompletionService.js';
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

const pathSeparator = isWindows ? '\\' : '/';

interface IAssertionTerminalCompletion {
	label: string;
	detail?: string;
	kind?: TerminalCompletionItemKind;
}

interface IAssertionCommandLineConfig {
	replacementIndex: number;
	replacementLength: number;
}

/**
 * Assert the set of completions exist exactly, including their order.
 */
function assertCompletions(actual: ITerminalCompletion[] | undefined, expected: IAssertionTerminalCompletion[], expectedConfig: IAssertionCommandLineConfig) {
	assert.deepStrictEqual(
		actual?.map(e => ({
			label: e.label,
			detail: e.detail ?? '',
			kind: e.kind ?? TerminalCompletionItemKind.Folder,
			replacementIndex: e.replacementIndex,
			replacementLength: e.replacementLength,
		})), expected.map(e => ({
			label: e.label.replaceAll('/', pathSeparator),
			detail: e.detail ? e.detail.replaceAll('/', pathSeparator) : '',
			kind: e.kind ?? TerminalCompletionItemKind.Folder,
			replacementIndex: expectedConfig.replacementIndex,
			replacementLength: expectedConfig.replacementLength,
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
		replacementIndex: expectedConfig.replacementIndex,
		replacementLength: expectedConfig.replacementLength,
	}));
	for (const expectedItem of expectedMapped) {
		assert.deepStrictEqual(actual.map(e => ({
			label: e.label,
			detail: e.detail ?? '',
			kind: e.kind ?? TerminalCompletionItemKind.Folder,
			replacementIndex: e.replacementIndex,
			replacementLength: e.replacementLength,
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
const standardTidleItem = Object.freeze({ label: '~', detail: homeDir });

suite('TerminalCompletionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let capabilities: TerminalCapabilityStore;
	let validResources: URI[];
	let childResources: { resource: URI; isFile?: boolean; isDirectory?: boolean }[];
	let terminalCompletionService: TerminalCompletionService;
	const provider = 'testProvider';

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, {
			async stat(resource) {
				if (!validResources.map(e => e.path).includes(resource.path)) {
					throw new Error('Doesn\'t exist');
				}
				return createFileStat(resource);
			},
			async resolve(resource: URI, options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata> {
				const children = childResources.filter(child => {
					const childFsPath = child.resource.path.replace(/\/$/, '');
					const parentFsPath = resource.path.replace(/\/$/, '');
					return (
						childFsPath.startsWith(parentFsPath) &&
						count(childFsPath, '/') === count(parentFsPath, '/') + 1
					);
				});
				return createFileStat(resource, undefined, undefined, undefined, children);
			},
		});
		terminalCompletionService = store.add(instantiationService.createInstance(TerminalCompletionService));
		terminalCompletionService.processEnv = testEnv;
		validResources = [];
		childResources = [];
		capabilities = store.add(new TerminalCapabilityStore());
	});

	suite('resolveResources should return undefined', () => {
		test('if cwd is not provided', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = { pathSeparator };
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3, provider, capabilities);
			assert(!result);
		});

		test('if neither filesRequested nor foldersRequested are true', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				pathSeparator
			};
			validResources = [URI.parse('file:///test')];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3, provider, capabilities);
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
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, '', 1, provider, capabilities);

			assertCompletions(result, [
				{ label: '.', detail: '/test/' },
				{ label: './folder1/', detail: '/test/folder1/' },
				{ label: '../', detail: '/' },
				standardTidleItem,
			], { replacementIndex: 1, replacementLength: 0 });
		});

		test('./| should return folder completions', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './', 3, provider, capabilities);

			assertCompletions(result, [
				{ label: './', detail: '/test/' },
				{ label: './folder1/', detail: '/test/folder1/' },
				{ label: './../', detail: '/' },
			], { replacementIndex: 1, replacementLength: 2 });
		});

		test('cd ./| should return folder completions', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ./', 5, provider, capabilities);

			assertCompletions(result, [
				{ label: './', detail: '/test/' },
				{ label: './folder1/', detail: '/test/folder1/' },
				{ label: './../', detail: '/' },
			], { replacementIndex: 3, replacementLength: 2 });
		});
		test('cd ./f| should return folder completions', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ./f', 6, provider, capabilities);

			assertCompletions(result, [
				{ label: './', detail: '/test/' },
				{ label: './folder1/', detail: '/test/folder1/' },
				{ label: './../', detail: '/' },
			], { replacementIndex: 3, replacementLength: 3 });
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
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				filesRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './', 2, provider, capabilities);

			assertCompletions(result, [
				{ label: './', detail: '/test/' },
				{ label: './.hiddenFile', detail: '/test/.hiddenFile', kind: TerminalCompletionItemKind.File },
				{ label: './.hiddenFolder/', detail: '/test/.hiddenFolder/' },
				{ label: './folder1/', detail: '/test/folder1/' },
				{ label: './file1.txt', detail: '/test/file1.txt', kind: TerminalCompletionItemKind.File },
				{ label: './../', detail: '/' },
			], { replacementIndex: 0, replacementLength: 2 });
		});

		test('./h| should handle hidden files and folders', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				filesRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './h', 3, provider, capabilities);

			assertCompletions(result, [
				{ label: './', detail: '/test/' },
				{ label: './.hiddenFile', detail: '/test/.hiddenFile', kind: TerminalCompletionItemKind.File },
				{ label: './.hiddenFolder/', detail: '/test/.hiddenFolder/' },
				{ label: './folder1/', detail: '/test/folder1/' },
				{ label: './file1.txt', detail: '/test/file1.txt', kind: TerminalCompletionItemKind.File },
				{ label: './../', detail: '/' },
			], { replacementIndex: 0, replacementLength: 3 });
		});
	});

	suite('~ -> $HOME', () => {
		let resourceRequestConfig: TerminalResourceRequestConfig;
		let shellEnvDetection: ShellEnvDetectionCapability;

		setup(() => {
			shellEnvDetection = store.add(new ShellEnvDetectionCapability());
			shellEnvDetection.setEnvironment({
				HOME: '/home',
				USERPROFILE: '/home'
			}, true);
			capabilities.add(TerminalCapability.ShellEnvDetection, shellEnvDetection);

			resourceRequestConfig = {
				cwd: URI.parse('file:///test/folder1'),// Updated to reflect home directory
				filesRequested: true,
				foldersRequested: true,
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
			assertPartialCompletionsExist(await terminalCompletionService.resolveResources(resourceRequestConfig, '~', 1, provider, capabilities), [
				{ label: '~', detail: '/home/' },
			], { replacementIndex: 0, replacementLength: 1 });
		});

		test('~/| should return folder completions relative to $HOME', async () => {
			assertCompletions(await terminalCompletionService.resolveResources(resourceRequestConfig, '~/', 2, provider, capabilities), [
				{ label: '~/', detail: '/home/' },
				{ label: '~/vscode/', detail: '/home/vscode/' },
			], { replacementIndex: 0, replacementLength: 2 });
		});

		test('~/vscode/| should return folder completions relative to $HOME/vscode', async () => {
			assertCompletions(await terminalCompletionService.resolveResources(resourceRequestConfig, '~/vscode/', 9, provider, capabilities), [
				{ label: '~/vscode/', detail: '/home/vscode/' },
				{ label: '~/vscode/foo/', detail: '/home/vscode/foo/' },
				{ label: '~/vscode/bar.txt', detail: '/home/vscode/bar.txt', kind: TerminalCompletionItemKind.File },
			], { replacementIndex: 0, replacementLength: 9 });
		});
	});

	suite('resolveResources edge cases and advanced scenarios', () => {
		setup(() => {
			validResources = [];
			childResources = [];
		});

		if (isWindows) {
			test('C:/Foo/| absolute paths on Windows', async () => {
				const resourceRequestConfig: TerminalResourceRequestConfig = {
					cwd: URI.parse('file:///C:'),
					foldersRequested: true,
					pathSeparator
				};
				validResources = [URI.parse('file:///C:/Foo')];
				childResources = [
					{ resource: URI.parse('file:///C:/Foo/Bar'), isDirectory: true, isFile: false },
					{ resource: URI.parse('file:///C:/Foo/Baz.txt'), isDirectory: false, isFile: true }
				];
				const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'C:/Foo/', 7, provider, capabilities);

				assertCompletions(result, [
					{ label: 'C:/Foo/', detail: 'C:/Foo/' },
					{ label: 'C:/Foo/Bar/', detail: 'C:/Foo/Bar/' },
				], { replacementIndex: 0, replacementLength: 7 });
			});
			test('c:/foo/| case insensitivity on Windows', async () => {
				const resourceRequestConfig: TerminalResourceRequestConfig = {
					cwd: URI.parse('file:///c:'),
					foldersRequested: true,
					pathSeparator
				};
				validResources = [URI.parse('file:///c:/foo')];
				childResources = [
					{ resource: URI.parse('file:///c:/foo/Bar'), isDirectory: true, isFile: false }
				];
				const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'c:/foo/', 7, provider, capabilities);

				assertCompletions(result, [
					// Note that the detail is normalizes drive letters to capital case intentionally
					{ label: 'c:/foo/', detail: 'C:/foo/' },
					{ label: 'c:/foo/Bar/', detail: 'C:/foo/Bar/' },
				], { replacementIndex: 0, replacementLength: 7 });
			});
		} else {
			test('/foo/| absolute paths NOT on Windows', async () => {
				const resourceRequestConfig: TerminalResourceRequestConfig = {
					cwd: URI.parse('file:///'),
					foldersRequested: true,
					pathSeparator
				};
				validResources = [URI.parse('file:///foo')];
				childResources = [
					{ resource: URI.parse('file:///foo/Bar'), isDirectory: true, isFile: false },
					{ resource: URI.parse('file:///foo/Baz.txt'), isDirectory: false, isFile: true }
				];
				const result = await terminalCompletionService.resolveResources(resourceRequestConfig, '/foo/', 5, provider, capabilities);

				assertCompletions(result, [
					{ label: '/foo/', detail: '/foo/' },
					{ label: '/foo/Bar/', detail: '/foo/Bar/' },
				], { replacementIndex: 0, replacementLength: 5 });
			});
		}

		if (isWindows) {
			test('.\\folder | Case insensitivity should resolve correctly on Windows', async () => {
				const resourceRequestConfig: TerminalResourceRequestConfig = {
					cwd: URI.parse('file:///C:/test'),
					foldersRequested: true,
					pathSeparator: '\\'
				};

				validResources = [URI.parse('file:///C:/test')];
				childResources = [
					{ resource: URI.parse('file:///C:/test/FolderA/'), isDirectory: true },
					{ resource: URI.parse('file:///C:/test/anotherFolder/'), isDirectory: true }
				];

				const result = await terminalCompletionService.resolveResources(resourceRequestConfig, '.\\folder', 8, provider, capabilities);

				assertCompletions(result, [
					{ label: '.\\', detail: 'C:\\test\\' },
					{ label: '.\\FolderA\\', detail: 'C:\\test\\FolderA\\' },
					{ label: '.\\anotherFolder\\', detail: 'C:\\test\\anotherFolder\\' },
					{ label: '.\\..\\', detail: 'C:\\' },
				], { replacementIndex: 0, replacementLength: 8 });
			});
		} else {
			test('./folder | Case sensitivity should resolve correctly on Mac/Unix', async () => {
				const resourceRequestConfig: TerminalResourceRequestConfig = {
					cwd: URI.parse('file:///test'),
					foldersRequested: true,
					pathSeparator: '/'
				};
				validResources = [URI.parse('file:///test')];
				childResources = [
					{ resource: URI.parse('file:///test/FolderA/'), isDirectory: true },
					{ resource: URI.parse('file:///test/foldera/'), isDirectory: true }
				];

				const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './folder', 8, provider, capabilities);

				assertCompletions(result, [
					{ label: './', detail: '/test/' },
					{ label: './FolderA/', detail: '/test/FolderA/' },
					{ label: './foldera/', detail: '/test/foldera/' },
					{ label: './../', detail: '/' }
				], { replacementIndex: 0, replacementLength: 8 });
			});

		}
		test('| Empty input should resolve to current directory', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			validResources = [URI.parse('file:///test')];
			childResources = [
				{ resource: URI.parse('file:///test/folder1/'), isDirectory: true },
				{ resource: URI.parse('file:///test/folder2/'), isDirectory: true }
			];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, '', 0, provider, capabilities);

			assertCompletions(result, [
				{ label: '.', detail: '/test/' },
				{ label: './folder1/', detail: '/test/folder1/' },
				{ label: './folder2/', detail: '/test/folder2/' },
				{ label: '../', detail: '/' },
				standardTidleItem,
			], { replacementIndex: 0, replacementLength: 0 });
		});

		test('./| should handle large directories with many results gracefully', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			validResources = [URI.parse('file:///test')];
			childResources = Array.from({ length: 1000 }, (_, i) => ({
				resource: URI.parse(`file:///test/folder${i}/`),
				isDirectory: true
			}));
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './', 2, provider, capabilities);

			assert(result);
			// includes the 1000 folders + ./ and ./../
			assert.strictEqual(result?.length, 1002);
			assert.strictEqual(result[0].label, `.${pathSeparator}`);
			assert.strictEqual(result.at(-1)?.label, `.${pathSeparator}..${pathSeparator}`);
		});

		test('./folder| should include current folder with trailing / is missing', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			validResources = [URI.parse('file:///test')];
			childResources = [
				{ resource: URI.parse('file:///test/folder1/'), isDirectory: true },
				{ resource: URI.parse('file:///test/folder2/'), isDirectory: true }
			];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './folder1', 10, provider, capabilities);

			assertCompletions(result, [
				{ label: './', detail: '/test/' },
				{ label: './folder1/', detail: '/test/folder1/' },
				{ label: './folder2/', detail: '/test/folder2/' },
				{ label: './../', detail: '/' }
			], { replacementIndex: 1, replacementLength: 9 });
		});

		test('folder/| should normalize current and parent folders', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			validResources = [
				URI.parse('file:///'),
				URI.parse('file:///test'),
				URI.parse('file:///test/folder1'),
				URI.parse('file:///test/folder2'),
			];
			childResources = [
				{ resource: URI.parse('file:///test/folder1/'), isDirectory: true },
				{ resource: URI.parse('file:///test/folder2/'), isDirectory: true }
			];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'test/', 5, provider, capabilities);

			assertCompletions(result, [
				{ label: './test/', detail: '/test/' },
				{ label: './test/folder1/', detail: '/test/folder1/' },
				{ label: './test/folder2/', detail: '/test/folder2/' },
				{ label: './test/../', detail: '/' }
			], { replacementIndex: 0, replacementLength: 5 });
		});
	});

	suite('cdpath', () => {
		let shellEnvDetection: ShellEnvDetectionCapability;

		setup(() => {
			validResources = [URI.parse('file:///test')];
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
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				filesRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3, provider, capabilities);

			assertPartialCompletionsExist(result, [
				{ label: 'folder1', detail: 'CDPATH /cdpath_value/folder1/' },
			], { replacementIndex: 3, replacementLength: 0 });
		});

		test('cd | should show paths from $CDPATH (absolute)', async () => {
			configurationService.setUserConfiguration('terminal.integrated.suggest.cdPath', 'absolute');
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				filesRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3, provider, capabilities);

			assertPartialCompletionsExist(result, [
				{ label: '/cdpath_value/folder1/', detail: 'CDPATH' },
			], { replacementIndex: 3, replacementLength: 0 });
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

			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse(`${uriPathPrefix}test`),
				foldersRequested: true,
				filesRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3, provider, capabilities);

			const finalPrefix = isWindows ? 'C:\\' : '/';
			assertPartialCompletionsExist(result, [
				{ label: 'folder1', detail: `CDPATH ${finalPrefix}cdpath1_value/folder1/` },
				{ label: 'folder2', detail: `CDPATH ${finalPrefix}cdpath1_value/folder2/` },
				{ label: 'folder1', detail: `CDPATH ${finalPrefix}cdpath2_value/inner_dir/folder1/` },
				{ label: 'folder2', detail: `CDPATH ${finalPrefix}cdpath2_value/inner_dir/folder2/` },
			], { replacementIndex: 3, replacementLength: 0 });
		});
	});
});
