/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IFileService, IFileStatWithMetadata, IResolveMetadataFileOptions } from '../../../../../../platform/files/common/files.js';
import { TerminalCompletionService, TerminalCompletionItemKind, TerminalResourceRequestConfig, ITerminalCompletion } from '../../browser/terminalCompletionService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import assert from 'assert';
import { isWindows } from '../../../../../../base/common/platform.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { createFileStat } from '../../../../../test/common/workbenchTestServices.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

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
			detail: e.detail ?? '',
			kind: e.kind ?? TerminalCompletionItemKind.Folder,
			replacementIndex: expectedConfig.replacementIndex,
			replacementLength: expectedConfig.replacementLength,
		}))
	);
}

suite('TerminalCompletionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let validResources: URI[];
	let childResources: { resource: URI; isFile?: boolean; isDirectory?: boolean }[];
	let terminalCompletionService: TerminalCompletionService;
	const provider: string = 'testProvider';

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
				return createFileStat(resource, undefined, undefined, undefined, childResources);
			}
		});
		terminalCompletionService = store.add(instantiationService.createInstance(TerminalCompletionService));
		validResources = [];
		childResources = [];
	});

	suite('resolveResources should return undefined', () => {
		test('if cwd is not provided', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3, provider);
			assert(!result);
		});

		test('if neither filesRequested nor foldersRequested are true', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				pathSeparator
			};
			validResources = [URI.parse('file:///test')];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3, provider);
			assert(!result);
		});
	});

	suite('resolveResources should return folder completions', () => {
		setup(() => {
			validResources = [URI.parse('file:///test')];
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true };
			childResources = [childFolder, childFile];
		});

		test('|', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, '', 1, provider);

			assertCompletions(result, [
				{ label: `.`, detail: 'test' },
				{ label: `./folder1/` },
				{ label: `../` }
			], { replacementIndex: 1, replacementLength: 0 });
		});

		test('.|', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, '.', 2, provider);

			assertCompletions(result, [
				{ label: `.`, detail: 'test' },
				{ label: `./folder1/` },
				{ label: `../` }
			], { replacementIndex: 1, replacementLength: 1 });
		});

		test('./|', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './', 3, provider);

			assertCompletions(result, [
				{ label: `./`, detail: 'test' },
				{ label: `./folder1/` },
				{ label: `./../` }
			], { replacementIndex: 1, replacementLength: 2 });
		});

		test('cd |', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3, provider);

			assertCompletions(result, [
				{ label: `.`, detail: 'test' },
				{ label: `./folder1/` },
				{ label: `../` }
			], { replacementIndex: 3, replacementLength: 0 });
		});

		test('cd .|', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd .', 4, provider);

			assertCompletions(result, [
				{ label: `.`, detail: 'test' },
				{ label: `./folder1/` },
				{ label: `../` }
			], { replacementIndex: 3, replacementLength: 1 });
		});

		test('cd ./|', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ./', 5, provider);

			assertCompletions(result, [
				{ label: `./`, detail: 'test' },
				{ label: `./folder1/` },
				{ label: `./../` }
			], { replacementIndex: 3, replacementLength: 2 });
		});

		test('cd ./f|', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ./f', 6, provider);

			assertCompletions(result, [
				{ label: `./`, detail: 'test' },
				{ label: `./folder1/` },
				{ label: `./../` }
			], { replacementIndex: 3, replacementLength: 3 });
		});

		test('cd ./folder1/|', async () => {
			childResources = [];
			validResources = [URI.parse('file:///test/folder1/')];
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test/folder1'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ./folder1/', 13, provider);

			assertCompletions(result, [
				{ label: `./folder1/`, detail: 'folder1' },
				{ label: `./folder1/../`, detail: 'test' }
			], { replacementIndex: 3, replacementLength: 10 });
		});
	});

	suite('resolveResources should handle directory completion requests correctly', () => {
		setup(() => {
			validResources = [URI.parse('file:///test')];
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false };
			const childFile = { resource: URI.parse('file:///test/a-lengthy-file'), name: 'a-lengthy-file', isDirectory: false, isFile: true };
			const childFile2 = { resource: URI.parse('file:///test/b'), name: 'b', isDirectory: false, isFile: true };
			childResources = [childFolder, childFile, childFile2];
		});

		test('../| should show ../../', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				filesRequested: false,
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, '../', 3, provider);

			assertCompletions(result, [
				{ label: `../`, detail: 'test' },
				{ label: `../folder1/` },
				{ label: `../../` }
			], { replacementIndex: 0, replacementLength: 3 });
		});

		test('./| should show files in alphabetical order', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				filesRequested: true,
				foldersRequested: false,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './', 2, provider);

			assertCompletions(result, [
				{ label: `./a-lengthy-file`, kind: TerminalCompletionItemKind.File },
				{ label: `./b`, kind: TerminalCompletionItemKind.File },
			], { replacementIndex: 0, replacementLength: 2 });
		});

		test('cd ./folder1/../ should not show duplicate cd ./folder1/../ entries', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				filesRequested: false,
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ./folder1/../', 16, provider);

			assertCompletions(result, [
				{ label: `./folder1/../`, detail: 'test' },
				{ label: `./folder1/../folder1/` },
				{ label: `./folder1/../../` }
			], { replacementIndex: 3, replacementLength: 13 });
		});

		test('./folder1/| should return results for nested folders', async () => {
			validResources = [URI.parse('file:///test')];
			childResources = [
				{ resource: URI.parse('file:///test/folder1/nestedFolder/'), isDirectory: true },
				{ resource: URI.parse('file:///test/folder1/nestedFolder2/'), isDirectory: true }
			];
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './folder1/', 10, provider);

			assertCompletions(result, [
				{ label: `./folder1/`, detail: 'test' },
				{ label: `./folder1/nestedFolder/` },
				{ label: `./folder1/nestedFolder2/` },
				{ label: `./folder1/../` }
			], { replacementIndex: 0, replacementLength: 10 });
		});
	});
	suite('resolveResources should handle file and folder completion requests correctly', () => {
		test('./| should handle hidden files and folders', async () => {
			validResources = [URI.parse('file:///test')];
			childResources = [
				{ resource: URI.parse('file:///test/.hiddenFile'), isFile: true },
				{ resource: URI.parse('file:///test/.hiddenFolder/'), isDirectory: true }
			];
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				filesRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './', 2, provider);

			assertCompletions(result, [
				{ label: `./`, detail: 'test' },
				{ label: `./.hiddenFile`, kind: TerminalCompletionItemKind.File },
				{ label: `./.hiddenFolder/`, kind: TerminalCompletionItemKind.Folder },
				{ label: `./../`, kind: TerminalCompletionItemKind.Folder }
			], { replacementIndex: 0, replacementLength: 2 });
		});

		test('./folder1/f| should return results for files', async () => {
			validResources = [URI.parse('file:///test')];
			childResources = [
				{ resource: URI.parse('file:///test/folder1/file1'), isFile: true },
				{ resource: URI.parse('file:///test/folder1/file2'), isFile: true }
			];
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: false,
				filesRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './folder1/n', 11, provider);

			assertCompletions(result, [
				{ label: `./folder1/file1`, kind: TerminalCompletionItemKind.File },
				{ label: `./folder1/file2`, kind: TerminalCompletionItemKind.File },
			], { replacementIndex: 0, replacementLength: 11 });
		});


		test('./| should handle root directory correctly', async () => {
			validResources = [URI.parse('file:///')];
			childResources = [
				{ resource: URI.parse('file:///folder1/'), isDirectory: true },
				{ resource: URI.parse('file:///file1.txt'), isFile: true }
			];
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///'),
				foldersRequested: true,
				filesRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './', 2, provider);

			assertCompletions(result, [
				{ label: `./` },
				{ label: `./folder1/`, kind: TerminalCompletionItemKind.Folder },
				{ label: `./file1.txt`, kind: TerminalCompletionItemKind.File },
				{ label: `./../`, kind: TerminalCompletionItemKind.Folder }
			], { replacementIndex: 0, replacementLength: 2 });
		});

		test('./| should prioritize current directory in completions', async () => {
			validResources = [URI.parse('file:///test')];
			childResources = [
				{ resource: URI.parse('file:///test/folder1/'), isDirectory: true },
				{ resource: URI.parse('file:///test/folder2/'), isDirectory: true }
			];
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './', 2, provider);

			assertCompletions(result, [
				{ label: `./`, detail: 'test' },
				{ label: `./folder1/` },
				{ label: `./folder2/` },
				{ label: `./../`, kind: TerminalCompletionItemKind.Folder }
			], { replacementIndex: 0, replacementLength: 2 });
		});
	});
});
