/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IFileStat, IFileStatWithMetadata, IResolveFileOptions, IResolveMetadataFileOptions } from '../../../../../../platform/files/common/files.js';
import { TerminalCompletionService, TerminalCompletionItemKind, TerminalResourceRequestConfig } from '../../browser/terminalCompletionService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestFileService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import assert from 'assert';
import { isWindows } from '../../../../../../base/common/platform.js';

class TestFileService2 extends TestFileService {
	private _children: IFileStat[] = [];
	constructor() {
		super();
	}
	setChildren(children: IFileStat[]) {
		this._children = children;
	}
	override async resolve(resource: URI, _options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	override async resolve(resource: URI, _options?: IResolveFileOptions): Promise<IFileStat>;
	override async resolve(resource: URI, _options?: IResolveFileOptions): Promise<IFileStat> {
		const result = await super.resolve(resource, _options);
		result.children = this._children;
		return result;
	}
}

suite('TerminalCompletionService', () => {
	const pathSeparator = isWindows ? '\\' : '/';
	let fileService: TestFileService2;
	let configurationService: IConfigurationService;
	let terminalCompletionService: TerminalCompletionService;
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	setup(() => {
		fileService = new TestFileService2();
		configurationService = new TestConfigurationService();
		terminalCompletionService = new TerminalCompletionService(configurationService, fileService);
		store.add(terminalCompletionService);
		store.add(fileService);
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
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3);
			assert(!result);
		});
	});

	suite('resolveResources should return folder completions', () => {
		test('cd ', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			await fileService.createFolder(URI.parse('file:///test/'));
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false, isSymbolicLink: false, mtime: 0, size: 0, children: [] };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true, isSymbolicLink: true, mtime: 0, size: 0, children: [] };
			fileService.setChildren([childFolder, childFile]);
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ', 3);
			assert(!!result);
			assert(result.length === 1);
			const label = `.${pathSeparator}folder1${pathSeparator}`;
			assert.deepEqual(result![0], {
				label,
				kind: TerminalCompletionItemKind.Folder,
				isDirectory: true,
				isFile: false,
				replacementIndex: 3,
				replacementLength: label.length
			});
		});
		test('cd .', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			await fileService.createFolder(URI.parse('file:///test/'));
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false, isSymbolicLink: false, mtime: 0, size: 0, children: [] };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true, isSymbolicLink: true, mtime: 0, size: 0, children: [] };
			fileService.setChildren([childFolder, childFile]);
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd .', 4);
			assert(!!result);
			assert(result.length === 1);
			const label = `${pathSeparator}folder1${pathSeparator}`;
			assert.deepEqual(result![0], {
				label,
				kind: TerminalCompletionItemKind.Folder,
				isDirectory: true,
				isFile: false,
				replacementIndex: 3,
				replacementLength: label.length - 1
			});
		});
		test('cd ./', async () => {
			const resourceRequestConfig: TerminalResourceRequestConfig = {
				cwd: URI.parse('file:///test'),
				foldersRequested: true,
				pathSeparator
			};
			await fileService.createFolder(URI.parse('file:///test/'));
			const childFolder = { resource: URI.parse('file:///test/folder1/'), name: 'folder1', isDirectory: true, isFile: false, isSymbolicLink: false, mtime: 0, size: 0, children: [] };
			const childFile = { resource: URI.parse('file:///test/file1.txt'), name: 'file1.txt', isDirectory: false, isFile: true, isSymbolicLink: true, mtime: 0, size: 0, children: [] };
			fileService.setChildren([childFolder, childFile]);
			const result = await terminalCompletionService.resolveResources(resourceRequestConfig, 'cd ./', 5);
			assert(!!result);
			assert(result.length === 1);
			const label = `${pathSeparator}folder1${pathSeparator}`;
			assert.deepEqual(result![0], {
				label,
				kind: TerminalCompletionItemKind.Folder,
				isDirectory: true,
				isFile: false,
				replacementIndex: 4,
				replacementLength: label.length - 2
			});
		});
	});
});
