/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { posix, win32 } from '../../../../../base/common/path.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import * as resources from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, IFileService, IFileStat } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, ItemActivation } from '../../../../../platform/quickinput/common/quickInput.js';
import { IOpenDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
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

	suite('resource selection', () => {
		interface ResourceItem extends IQuickPickItem {
			uri: URI;
			isFolder: boolean;
		}

		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const textFile = resources.joinPath(root, 'notes.txt');
		const imageFile = resources.joinPath(root, 'screenshot.png');
		const childFolder = resources.joinPath(root, 'child');

		async function createDialog() {
			await fileService.createFolder(childFolder);
			await fileService.createFile(textFile, VSBuffer.fromString('notes'));
			await fileService.createFile(imageFile, VSBuffer.fromString('image'));
			const instantiationService = workbenchInstantiationService({ fileService: () => fileService }, disposables);
			const quickInputService = instantiationService.get(IQuickInputService);
			const dialog = disposables.add(instantiationService.createInstance(SimpleFileDialog));
			return { dialog, quickInputService };
		}

		async function openDialog(options: Partial<IOpenDialogOptions> = {}) {
			const { dialog, quickInputService } = await createDialog();
			const result = dialog.showOpenDialog({
				defaultUri: root,
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: true,
				...options,
			});
			await timeout(0);
			const picker = quickInputService.currentQuickInput as IQuickPick<ResourceItem>;
			assert.ok(picker && !picker.busy);
			return { picker, result };
		}

		test('returns all checked files through the real quick pick', async () => {
			const { picker, result } = await openDialog();
			picker.selectedItems = picker.items.filter(item => !item.isFolder);
			picker.accept();

			assert.deepStrictEqual({ canSelectMany: picker.canSelectMany, paths: (await result)?.map(uri => uri.path) }, {
				canSelectMany: true,
				paths: [textFile.path, imageFile.path],
			});
		});

		test('returns the active file when no files are checked', async () => {
			const { picker, result } = await openDialog();
			picker.activeItems = picker.items.filter(item => item.uri.path === textFile.path);
			picker.accept();

			assert.deepStrictEqual((await result)?.map(uri => uri.path), [textFile.path]);
		});

		test('preserves single selection when multiple selection is disabled', async () => {
			const { picker, result } = await openDialog({ canSelectMany: false });
			picker.activeItems = picker.items.filter(item => item.uri.path === textFile.path);
			picker.accept();

			assert.deepStrictEqual({ canSelectMany: picker.canSelectMany, paths: (await result)?.map(uri => uri.path) }, {
				canSelectMany: false,
				paths: [textFile.path],
			});
		});

		test('cancelling does not return checked files', async () => {
			const { picker, result } = await openDialog();
			picker.selectedItems = picker.items.filter(item => !item.isFolder);
			picker.hide();

			assert.strictEqual(await result, undefined);
		});

		test('validates every selected file before returning the selection', async () => {
			const { picker, result } = await openDialog();
			picker.selectedItems = picker.items.filter(item => !item.isFolder);
			await fileService.del(imageFile);
			picker.accept();
			await timeout(0);
			const validationMessage = picker.validationMessage;
			picker.selectedItems = picker.items.filter(item => item.uri.path === textFile.path);
			picker.accept();

			assert.deepStrictEqual({ validationMessage, paths: (await result)?.map(uri => uri.path) }, {
				validationMessage: 'Please enter a path that exists.',
				paths: [textFile.path],
			});
		});

		test('folder rows navigate rather than becoming file attachments', async () => {
			const { picker, result } = await openDialog();
			const folder = picker.items.find(item => resources.isEqual(resources.removeTrailingPathSeparator(item.uri), childFolder));
			assert.ok(folder);
			picker.activeItems = [folder];
			picker.accept();
			await timeout(0);
			const navigated = picker.value;
			const labels = picker.items.map(item => item.label);
			picker.hide();

			assert.deepStrictEqual({ pickable: folder.pickable, navigated, labels, result: await result }, {
				pickable: false,
				navigated: '/root/child/',
				labels: ['..'],
				result: undefined,
			});
		});

		test('allows multiple folders when folder selection is enabled', async () => {
			const anotherFolder = resources.joinPath(root, 'another');
			await fileService.createFolder(anotherFolder);
			const { picker, result } = await openDialog({ canSelectFolders: true });
			picker.selectedItems = picker.items.filter(item => item.isFolder && item.pickable);
			picker.accept();

			assert.deepStrictEqual((await result)?.map(uri => uri.path), [anotherFolder.path, childFolder.path]);
		});

		test('save dialogs remain single-select', async () => {
			const { dialog, quickInputService } = await createDialog();
			const result = dialog.showSaveDialog({ defaultUri: resources.joinPath(root, 'new.txt') });
			await timeout(0);
			const picker = quickInputService.currentQuickInput as IQuickPick<ResourceItem>;
			const canSelectMany = picker.canSelectMany;
			picker.hide();

			assert.deepStrictEqual({ canSelectMany, result: await result }, {
				canSelectMany: false,
				result: undefined,
			});
		});
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

	for (const value of ['Q:\\', 'Q:/', 'Q:']) {
		test(`handles typing ${value} from a scoped Windows filesystem root`, async () => {
			const currentFolder = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'windows-host', path: '/' });
			const navigatedFolders: { value: string; path: string }[] = [];
			const filteredValues: string[] = [];
			const dialog = Object.assign(Object.create(SimpleFileDialog.prototype), {
				currentFolder,
				filePickBox: { value, validationMessage: undefined },
				isWindows: true,
				scheme: AGENT_HOST_SCHEME,
				scopedAuthority: 'windows-host',
				separator: '\\',
				userEnteredPathSegment: '',
				autoCompletePathSegment: '',
				setActiveItems: (value: string) => filteredValues.push(value),
				tryUpdateItems: async (value: string, folder: URI) => {
					navigatedFolders.push({ value, path: folder.path });
					return 0;
				},
			});

			await dialog.handleValueChange(value);

			assert.deepStrictEqual({ navigatedFolders, filteredValues }, {
				navigatedFolders: value === 'Q:' ? [] : [{ value, path: '/Q:/' }],
				filteredValues: value === 'Q:' ? [value] : [],
			});
		});
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

	for (const permitted of [true, false]) {
		test(`${permitted ? 'accepts' : 'rejects'} the selected folder independently of denied parent access`, async () => {
			const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
			const folder = resources.joinPath(root, 'granted');
			await fileService.createFolder(folder);
			const requests: string[] = [];
			const guardedFileService = new class extends mock<IFileService>() {
				override async stat(resource: URI) {
					requests.push(resource.path);
					if (resources.isEqual(resource, root) || !permitted) {
						throw createFileSystemProviderError('No permissions', FileSystemProviderErrorCode.NoPermissions);
					}
					return fileService.stat(resource);
				}
			}();
			const result = createFolderOnlyDialog(guardedFileService);
			const accepted = await result.dialog.validate(folder);
			assert.deepStrictEqual({ accepted, prompted: result.promptedUri, requests }, {
				accepted: permitted, prompted: undefined, requests: permitted ? ['/root', '/root/granted'] : ['/root', '/root/granted', '/root'],
			});
		});
	}

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
		const anotherDrive = dialog.remoteUriFrom('D:\\code\\project\\', resource);

		assert.deepStrictEqual({
			path,
			roundTripped: {
				scheme: roundTripped.scheme,
				authority: roundTripped.authority,
				path: roundTripped.path,
			},
			typedDrive: {
				scheme: anotherDrive.scheme,
				authority: anotherDrive.authority,
				path: anotherDrive.path,
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
			typedDrive: {
				scheme: 'vscode-agent-host',
				authority: 'windows-host',
				path: '/D:/code/project/',
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