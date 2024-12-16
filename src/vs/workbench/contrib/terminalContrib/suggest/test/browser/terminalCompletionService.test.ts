/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IFileService, IFileStatWithMetadata, IResolveMetadataFileOptions } from '../../../../../../platform/files/common/files.js';
import { TerminalCompletionService, TerminalCompletionItemKind, TerminalResourceRequestConfig } from '../../browser/terminalCompletionService.js';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import assert from 'assert';
import { isWindows } from '../../../../../../base/common/platform.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { createFileStat } from '../../../../../test/common/workbenchTestServices.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

suite('TerminalCompletionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let validResources: URI[];
	let childResources: { resource: URI; isFile?: boolean; isDirectory?: boolean }[];
	const pathSeparator = isWindows ? '\\' : '/';
	let terminalCompletionService: TerminalCompletionService;

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

	teardown(() => {
		sinon.restore();
	});

	suite('resolveResources should return undefined', () => {
		test('if cwd is not provided', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				pathSeparator
			};
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3);
			assert(!result);
		});

		test('if neither filesRequested nor foldersRequested are true', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				pathSeparator
			};
			validResources = [URI.parse('file:///test')];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3);
			assert(!result);
		});
	});

	suite('resolveResources should return folder completions', () => {
		test('', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			validResources = [URI.parse('file:///test')];
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true };
			childResources = [childFolder, childFile];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, '', 1);
			assert(!!result);
			assert(result.length === 1);
			assert.deepEqual(result![0], {
				label: `.${pathSeparator}folder1${pathSeparator}`,
				kind: TerminalCompletionItemKind.Folder,
				isDirectory: true,
				isFile: false,
				replacementIndex: 1,
				replacementLength: 1
			});
		});
		test('.', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			validResources = [URI.parse('file:///test')];
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true };
			childResources = [childFolder, childFile];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, '.', 2);
			assert(!!result);
			assert(result.length === 1);
			assert.deepEqual(result![0], {
				label: `.${pathSeparator}folder1${pathSeparator}`,
				kind: TerminalCompletionItemKind.Folder,
				isDirectory: true,
				isFile: false,
				replacementIndex: 1,
				replacementLength: 1
			});
		});
		test('./', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			validResources = [URI.parse('file:///test')];
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true };
			childResources = [childFolder, childFile];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, './', 3);
			assert(!!result);
			assert(result.length === 1);
			assert.deepEqual(result![0], {
				label: `.${pathSeparator}folder1${pathSeparator}`,
				kind: TerminalCompletionItemKind.Folder,
				isDirectory: true,
				isFile: false,
				replacementIndex: 1,
				replacementLength: 2
			});
		});
		test('cd ', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			validResources = [URI.parse('file:///test')];
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true };
			childResources = [childFolder, childFile];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3);
			assert(!!result);
			assert(result.length === 1);
			assert.deepEqual(result![0], {
				label: `.${pathSeparator}folder1${pathSeparator}`,
				kind: TerminalCompletionItemKind.Folder,
				isDirectory: true,
				isFile: false,
				replacementIndex: 3,
				replacementLength: 3
			});
		});
		test('cd .', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			validResources = [URI.parse('file:///test/')];
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true };
			childResources = [childFolder, childFile];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd .', 4);
			assert(!!result);
			assert(result.length === 1);
			assert.deepEqual(result![0], {
				label: `.${pathSeparator}folder1${pathSeparator}`,
				kind: TerminalCompletionItemKind.Folder,
				isDirectory: true,
				isFile: false,
				replacementIndex: 3,
				replacementLength: 1 // replacing .
			});
		});
		test('cd ./', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true };
			childResources = [childFolder, childFile];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ./', 5);
			assert(!!result);
			assert(result.length === 1);
			assert.deepEqual(result![0], {
				label: `.${pathSeparator}folder1${pathSeparator}`,
				kind: TerminalCompletionItemKind.Folder,
				isDirectory: true,
				isFile: false,
				replacementIndex: 3,
				replacementLength: 2 // replacing ./
			});
		});
		test('cd ./f', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true };
			childResources = [childFolder, childFile];
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ./f', 6);
			assert(!!result);
			assert(result.length === 1);
			assert.deepEqual(result![0], {
				label: `.${pathSeparator}folder1${pathSeparator}`,
				kind: TerminalCompletionItemKind.Folder,
				isDirectory: true,
				isFile: false,
				replacementIndex: 3,
				replacementLength: 3 // replacing ./f
			});
		});
	});
});
