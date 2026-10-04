/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { posix, win32 } from '../../../../../base/common/path.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import * as resources from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, IFileService, IFileStat } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ItemActivation } from '../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SimpleFileDialog } from '../../browser/simpleFileDialog.js';

suite('SimpleFileDialog', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;
	let provider: InMemoryFileSystemProvider;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, provider));
	});

	function createFolderOnlyDialog(fileService: IFileService, options: { isWindows?: boolean } = {}) {
		let promptedUri: URI | undefined;
		const dialog = Object.assign(Object.create(SimpleFileDialog.prototype), {
			fileService,
			filePickBox: { validationMessage: undefined },
			requiresTrailing: false,
			allowFolderSelection: true,
			allowFileSelection: false,
			isWindows: options.isWindows ?? false,
			yesNoPrompt: async (uri: URI) => {
				promptedUri = uri;
				return true;
			}
		});

		return { dialog, get promptedUri() { return promptedUri; } };
	}

	test('creates nested missing folders from a folder-only open dialog', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFolder = resources.joinPath(root, 'folderA');
		const nestedFolder = resources.joinPath(existingFolder, 'newFolder1', 'newFolder2');

		await fileService.createFolder(existingFolder);

		const result = createFolderOnlyDialog(fileService);

		assert.strictEqual(await result.dialog.validate(nestedFolder), true);
		assert.strictEqual(result.promptedUri?.toString(), nestedFolder.toString());
		assert.strictEqual(await fileService.exists(nestedFolder), true);
	});

	test('does not create a missing folder below a readonly parent', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFolder = resources.joinPath(root, 'folderA');
		const nestedFolder = resources.joinPath(existingFolder, 'newFolder');

		await fileService.createFolder(existingFolder);
		provider.setReadOnly(true);

		const result = createFolderOnlyDialog(fileService);

		assert.strictEqual(await result.dialog.validate(nestedFolder), false);
		assert.strictEqual(result.promptedUri, undefined);
		assert.strictEqual(await fileService.exists(nestedFolder), false);
	});

	test('does not create a missing folder below a file', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFile = resources.joinPath(root, 'file.txt');
		const nestedFolder = resources.joinPath(existingFile, 'newFolder');

		await fileService.createFile(existingFile, VSBuffer.fromString('contents'));

		const result = createFolderOnlyDialog(fileService);

		assert.strictEqual(await result.dialog.validate(nestedFolder), false);
		assert.strictEqual(result.promptedUri, undefined);
		assert.strictEqual(await fileService.exists(nestedFolder), false);
	});

	test('does not create a missing folder with an invalid path segment', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFolder = resources.joinPath(root, 'folderA');
		const nestedFolder = resources.joinPath(existingFolder, 'bad:name', 'newFolder');

		await fileService.createFolder(existingFolder);

		const result = createFolderOnlyDialog(fileService, { isWindows: true });

		assert.strictEqual(await result.dialog.validate(nestedFolder), false);
		assert.strictEqual(result.promptedUri, undefined);
		assert.strictEqual(await fileService.exists(nestedFolder), false);
	});

	test('does not create a missing folder when parent lookup fails for reasons other than missing files', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFolder = resources.joinPath(root, 'folderA');
		const protectedFolder = resources.joinPath(existingFolder, 'protected');
		const nestedFolder = resources.joinPath(protectedFolder, 'newFolder');

		await fileService.createFolder(existingFolder);

		const guardedFileService = {
			...fileService,
			stat: async (resource: URI) => {
				if (resource.toString() === protectedFolder.toString()) {
					throw createFileSystemProviderError('No permissions', FileSystemProviderErrorCode.NoPermissions);
				}
				return fileService.stat(resource);
			},
			createFolder: (resource: URI) => fileService.createFolder(resource)
		} as IFileService;

		const result = createFolderOnlyDialog(guardedFileService);

		assert.strictEqual(await result.dialog.validate(nestedFolder), false);
		assert.strictEqual(result.promptedUri, undefined);
		assert.strictEqual(await fileService.exists(nestedFolder), false);
	});

	test('matches a direct child synchronously before accepting a folder', async () => {
		const folder = URI.file('/root/folder');
		const folderItem = { label: 'folder', uri: folder, isFolder: true };
		const filePickBox = {
			value: '/root/fol',
			valueSelection: undefined as [number, number] | undefined,
			activeItems: [] as { label: string; uri: URI; isFolder: boolean }[],
			selectedItems: [] as { label: string; uri: URI; isFolder: boolean }[],
			items: [folderItem],
			validationMessage: undefined,
			busy: false
		};
		let insertedValue: string | undefined;
		let triedToUpdateItems = false;

		const dialog = Object.assign(Object.create(SimpleFileDialog.prototype), {
			filePickBox,
			currentFolder: URI.file('/root'),
			userEnteredPathSegment: '',
			autoCompletePathSegment: '',
			updatingPromise: undefined,
			trailing: undefined,
			separator: '/',
			isWindows: false,
			scheme: Schemas.file,
			onBusyChangeEmitter: { fire: () => { } },
			insertText: (wholeValue: string) => insertedValue = wholeValue,
			tryUpdateItems: async () => {
				triedToUpdateItems = true;
				return 3;
			},
			validate: async () => false
		}) as {
			handleValueChange(value: string): Promise<void>;
			onDidAccept(): Promise<URI | undefined>;
		};

		const valueChange = dialog.handleValueChange(filePickBox.value);
		filePickBox.selectedItems = filePickBox.activeItems;
		await dialog.onDidAccept();
		await valueChange;

		assert.deepStrictEqual({ insertedValue, triedToUpdateItems }, {
			insertedValue: '/root/folder',
			triedToUpdateItems: false
		});
	});

	test('updates items when navigating from root into a child folder', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/' });
		const folder = URI.from({ scheme: Schemas.inMemory, path: '/folder/' });
		const filePickBox = {
			value: '/folder/',
			validationMessage: undefined
		};
		let update: { value: string; folder: URI } | undefined;

		const dialog = Object.assign(Object.create(SimpleFileDialog.prototype), {
			filePickBox,
			currentFolder: root,
			userEnteredPathSegment: '',
			autoCompletePathSegment: 'folder',
			separator: '/',
			isWindows: false,
			scheme: Schemas.inMemory,
			tryUpdateItems: async (value: string, folder: URI) => {
				update = { value, folder };
				return 0;
			},
			setActiveItems: () => { }
		}) as {
			handleValueChange(value: string): Promise<void>;
		};

		await dialog.handleValueChange(filePickBox.value);

		assert.deepStrictEqual(update && { value: update.value, folder: update.folder.toString() }, {
			value: '/folder/',
			folder: folder.toString()
		});
	});

	test('uses authority-specific Windows semantics for scoped file systems', async () => {
		const resource = URI.parse('vscode-agent-host://windows-host/c:/Users/test/project');
		const semanticRequests: string[] = [];
		const dialog = Object.assign(Object.create(SimpleFileDialog.prototype), {
			scheme: 'vscode-agent-host',
			scopedAuthority: 'windows-host',
			remoteAuthority: undefined,
			labelService: {
				getSeparator: () => {
					throw new Error('Scoped paths must not use display separators');
				},
			},
			pathService: {
				getOperatingSystem: async (uri: URI) => {
					semanticRequests.push(`os:${uri.toString()}`);
					return OperatingSystem.Windows;
				},
				getPath: async (uri: URI) => {
					semanticRequests.push(`path:${uri.toString()}`);
					return win32;
				},
			},
		}) as unknown as {
			resolvePathFormatting(): Promise<void>;
			pathFromUri(uri: URI, endWithSeparator?: boolean): string;
			remoteUriFrom(path: string, hintUri?: URI): URI;
			separator: string;
			isWindows: boolean;
		};
		await dialog.resolvePathFormatting();
		const path = dialog.pathFromUri(resource, true);
		const roundTripped = dialog.remoteUriFrom(path, resource);

		assert.deepStrictEqual({
			path,
			roundTripped: {
				scheme: roundTripped.scheme,
				authority: roundTripped.authority,
				path: roundTripped.path,
			},
			separator: dialog.separator,
			isWindows: dialog.isWindows,
			semanticRequests,
		}, {
			path: 'C:\\Users\\test\\project\\',
			roundTripped: {
				scheme: 'vscode-agent-host',
				authority: 'windows-host',
				path: '/C:/Users/test/project/',
			},
			separator: '\\',
			isWindows: true,
			semanticRequests: [
				'os:vscode-agent-host://windows-host/',
				'path:vscode-agent-host://windows-host/',
			],
		});
	});

	test('uses POSIX semantics for scoped file systems', async () => {
		const resource = URI.parse('vscode-agent-host://linux-host/Users/test/project');
		const dialog = Object.assign(Object.create(SimpleFileDialog.prototype), {
			scheme: 'vscode-agent-host',
			scopedAuthority: 'linux-host',
			remoteAuthority: undefined,
			labelService: {
				getSeparator: () => {
					throw new Error('Scoped paths must not use display separators');
				},
			},
			pathService: {
				getOperatingSystem: async () => OperatingSystem.Linux,
				getPath: async () => posix,
			},
		}) as unknown as {
			resolvePathFormatting(): Promise<void>;
			pathFromUri(uri: URI, endWithSeparator?: boolean): string;
			separator: string;
			isWindows: boolean;
		};
		await dialog.resolvePathFormatting();

		assert.deepStrictEqual({
			path: dialog.pathFromUri(resource, true),
			separator: dialog.separator,
			isWindows: dialog.isWindows,
		}, {
			path: '/Users/test/project/',
			separator: '/',
			isWindows: false,
		});
	});

	test('falls back to POSIX formatting when scoped semantics are unknown', async () => {
		const dialog = Object.assign(Object.create(SimpleFileDialog.prototype), {
			scheme: 'vscode-agent-host',
			scopedAuthority: 'unknown-host',
			remoteAuthority: undefined,
			labelService: {
				getSeparator: () => {
					throw new Error('Scoped paths must not use display separators');
				},
			},
			pathService: {
				getOperatingSystem: async () => undefined,
				getPath: async () => undefined,
			},
		}) as unknown as {
			resolvePathFormatting(): Promise<void>;
			separator: string;
			isWindows: boolean;
		};
		await dialog.resolvePathFormatting();

		assert.deepStrictEqual({
			separator: dialog.separator,
			isWindows: dialog.isWindows,
		}, {
			separator: '/',
			isWindows: false,
		});
	});

	test('does not let a canceled slow folder update overwrite a newer folder', async () => {
		const slowFolder = URI.file('/slow');
		const fastFolder = URI.file('/fast');

		let resolveSlow!: (stat: IFileStat) => void;
		const slowResolve = new Promise<IFileStat>(resolve => resolveSlow = resolve);

		function folderStat(resource: URI): IFileStat {
			return {
				resource,
				name: resources.basename(resource),
				isFile: false,
				isDirectory: true,
				isSymbolicLink: false,
				mtime: 0,
				ctime: 0,
				etag: '',
				size: 0,
				readonly: false,
				locked: false,
				children: []
			};
		}

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IFileService, 'resolve', (resource: URI) => resources.isEqual(resource, slowFolder) ? slowResolve : Promise.resolve(folderStat(resource)));

		const dialog = disposables.add(instantiationService.createInstance(SimpleFileDialog)) as unknown as {
			updateItems(newFolder: URI, force?: boolean, trailing?: string): Promise<boolean>;
			currentFolder: URI;
			filePickBox: {
				value: string;
				valueSelection: undefined;
				items: readonly unknown[];
				itemActivation: ItemActivation | undefined;
				busy: boolean;
				inputHasFocus(): boolean;
			};
			createItems(): Promise<readonly unknown[]>;
		};
		dialog.filePickBox = {
			value: '',
			valueSelection: undefined,
			items: [],
			itemActivation: undefined,
			busy: false,
			inputHasFocus: () => false
		};
		dialog.currentFolder = URI.file('/');
		dialog.createItems = async () => [];

		const slowUpdate = dialog.updateItems(slowFolder, true).catch(() => undefined);
		await dialog.updateItems(fastFolder, true);

		assert.strictEqual(dialog.currentFolder.toString(), resources.addTrailingPathSeparator(fastFolder).toString());
		assert.strictEqual(dialog.filePickBox.value, '/fast/');

		resolveSlow(folderStat(slowFolder));
		await slowUpdate;

		assert.strictEqual(dialog.currentFolder.toString(), resources.addTrailingPathSeparator(fastFolder).toString());
		assert.strictEqual(dialog.filePickBox.value, '/fast/');
	});
});