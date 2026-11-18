/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ResourceFileEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileType, IFileService, IStat } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { IUndoRedoService, UndoRedoGroup } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService } from '../../../../test/common/workbenchTestServices.js';
import { BulkFileEdits } from '../../../bulkEdit/browser/bulkFileEdits.js';
import { BrowserFileUpload, canMergeFolders, getMergeFileEdits } from '../../browser/fileImportExport.js';
import { IExplorerService } from '../../browser/files.js';
import { ExplorerItem } from '../../common/explorerModel.js';

const symbolicLink = '/target/folder/link';

/**
 * Reports {@link symbolicLink} as a symbolic link to the folder stored at that path.
 */
class SymbolicLinkFileSystemProvider extends InMemoryFileSystemProvider {
	override async stat(resource: URI): Promise<IStat> {
		const stat = await super.stat(resource);
		return resource.path === symbolicLink ? { ...stat, type: stat.type | FileType.SymbolicLink } : stat;
	}
}

interface IUploadEntry {
	name: string;
	isFile: boolean;
	isDirectory: boolean;
	file(resolve: (file: File) => void, reject: () => void): void;
	createReader(): { readEntries(resolve: (entries: IUploadEntry[]) => void, reject: () => void): void };
}

suite('Files - Merge folders', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const uri = (path: string) => URI.from({ scheme: Schemas.inMemory, path });

	async function createFileService(paths: string[]): Promise<FileService> {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new SymbolicLinkFileSystemProvider())));
		for (const path of paths) {
			await fileService.writeFile(uri(path), VSBuffer.fromString(path));
		}

		return fileService;
	}

	async function readTree(fileService: IFileService, resource: URI): Promise<string[]> {
		const stat = await fileService.resolve(resource);
		if (!stat.isDirectory) {
			return [`${resource.path} = ${(await fileService.readFile(resource)).value.toString()}`];
		}

		const entries = stat.children?.length ? [] : [`${resource.path}/`];
		for (const child of stat.children ?? []) {
			entries.push(...await readTree(fileService, child.resource));
		}

		return entries.sort();
	}

	const fixture = [
		'/source/folder/a.txt',
		'/source/folder/new/b.txt',
		'/source/folder/fileInTarget/d.txt',
		'/source/folder/link/e.txt',
		'/source/folder/sub/c.txt',
		'/source/file.txt',
		'/target/folder/a.txt',
		'/target/folder/fileInTarget',
		'/target/folder/link/f.txt',
		'/target/folder/sub/existing.txt',
		'/target/file.txt',
		'/target/other.txt'
	];
	const sources = [uri('/source/folder'), uri('/source/file.txt')];

	test('merges folders that exist in the target and replaces everything else', async () => {
		const fileService = await createFileService(fixture);
		const toSnapshot = (edits: ResourceFileEdit[]) => edits.map(edit => ({ from: edit.oldResource?.path, to: edit.newResource?.path, options: edit.options }));

		assert.deepStrictEqual({
			canMerge: [
				await canMergeFolders(fileService, uri('/source/folder'), uri('/target/folder')),
				await canMergeFolders(fileService, uri('/source/folder/fileInTarget'), uri('/target/folder/fileInTarget')),
				await canMergeFolders(fileService, uri('/source/folder/link'), uri(symbolicLink)),
				await canMergeFolders(fileService, uri('/source/file.txt'), uri('/target/file.txt'))
			],
			move: toSnapshot(await getMergeFileEdits(fileService, sources, uri('/target'), false)),
			copy: toSnapshot(await getMergeFileEdits(fileService, sources, uri('/target'), true))
		}, {
			canMerge: [true, false, false, false],
			move: [
				{ from: '/source/folder/a.txt', to: '/target/folder/a.txt', options: { overwrite: true, copy: false } },
				{ from: '/source/folder/new', to: '/target/folder/new', options: { overwrite: true, copy: false } },
				{ from: '/source/folder/fileInTarget', to: '/target/folder/fileInTarget', options: { overwrite: true, copy: false } },
				{ from: '/source/folder/link', to: '/target/folder/link', options: { overwrite: true, copy: false } },
				{ from: '/source/folder/sub/c.txt', to: '/target/folder/sub/c.txt', options: { overwrite: true, copy: false } },
				{ from: '/source/folder/sub', to: undefined, options: { folder: true, skipTrashBin: true } },
				{ from: '/source/folder', to: undefined, options: { folder: true, skipTrashBin: true } },
				{ from: '/source/file.txt', to: '/target/file.txt', options: { overwrite: true, copy: false } }
			],
			copy: [
				{ from: '/source/folder/a.txt', to: '/target/folder/a.txt', options: { overwrite: true, copy: true } },
				{ from: '/source/folder/new', to: '/target/folder/new', options: { overwrite: true, copy: true } },
				{ from: '/source/folder/fileInTarget', to: '/target/folder/fileInTarget', options: { overwrite: true, copy: true } },
				{ from: '/source/folder/link', to: '/target/folder/link', options: { overwrite: true, copy: true } },
				{ from: '/source/folder/sub/c.txt', to: '/target/folder/sub/c.txt', options: { overwrite: true, copy: true } },
				{ from: '/source/file.txt', to: '/target/file.txt', options: { overwrite: true, copy: true } }
			]
		});
	});

	test('applying the merge edits of a move removes the emptied source folders', async () => {
		const fileService = await createFileService(fixture);
		const instantiationService = workbenchInstantiationService({ fileService: () => fileService }, store);
		const edits = await getMergeFileEdits(fileService, sources, uri('/target'), false);

		await instantiationService.createInstance(BulkFileEdits, 'Move', 'move', new UndoRedoGroup(), undefined, false, Progress.None, CancellationToken.None, edits).apply();

		assert.deepStrictEqual({
			canUndo: instantiationService.get(IUndoRedoService).canUndo(uri('/source/folder')),
			tree: await readTree(fileService, uri('/'))
		}, {
			canUndo: true,
			tree: [
				'/source/',
				'/target/file.txt = /source/file.txt',
				'/target/folder/a.txt = /source/folder/a.txt',
				'/target/folder/fileInTarget/d.txt = /source/folder/fileInTarget/d.txt',
				'/target/folder/link/e.txt = /source/folder/link/e.txt',
				'/target/folder/new/b.txt = /source/folder/new/b.txt',
				'/target/folder/sub/c.txt = /source/folder/sub/c.txt',
				'/target/folder/sub/existing.txt = /target/folder/sub/existing.txt',
				'/target/other.txt = /target/other.txt'
			]
		});
	});

	test('merging a browser upload replaces nested entries that cannot be merged', async () => {
		const fileService = await createFileService([
			'/target/folder/a.txt',
			'/target/folder/keep.txt',
			'/target/folder/fileToFolder',
			'/target/folder/folderToFile/x.txt',
			'/target/folder/link/f.txt',
			'/target/folder/sub/existing.txt'
		]);
		const instantiationService = workbenchInstantiationService({ fileService: () => fileService }, store);
		const replaced: string[] = [];
		instantiationService.stub(IExplorerService, {
			applyBulkEdit: async edits => {
				for (const { oldResource } of edits) {
					if (oldResource) {
						replaced.push(oldResource.path);
						await fileService.del(oldResource, { recursive: true });
					}
				}
			}
		});

		const configurationService = new TestConfigurationService();
		const target = new ExplorerItem(uri('/target'), fileService, configurationService, NullFilesConfigurationService, undefined, true);
		target.addChild(new ExplorerItem(uri('/target/folder'), fileService, configurationService, NullFilesConfigurationService, target, true));

		const file = (name: string): IUploadEntry => ({
			name, isFile: true, isDirectory: false,
			file: resolve => resolve(new File([`uploaded ${name}`], name)),
			createReader: () => { throw new Error('Not a folder'); }
		});
		const folder = (name: string, children: IUploadEntry[]): IUploadEntry => ({
			name, isFile: false, isDirectory: true,
			file: (_resolve, reject) => reject(),
			createReader: () => {
				let done = false;
				return { readEntries: resolve => { resolve(done ? [] : children); done = true; } };
			}
		});
		const entry = folder('folder', [
			file('a.txt'),
			file('folderToFile'),
			file('new.txt'),
			folder('fileToFolder', [file('z.txt')]),
			folder('link', [file('g.txt')]),
			folder('sub', [file('w.txt')])
		]);
		const event = new DragEvent('drop');
		Object.defineProperty(event, 'dataTransfer', { value: { items: [{ webkitGetAsEntry: () => entry }] } });

		await instantiationService.createInstance(BrowserFileUpload).upload(target, event);

		assert.deepStrictEqual({ replaced: replaced.sort(), tree: await readTree(fileService, uri('/target')) }, {
			replaced: ['/target/folder/fileToFolder', '/target/folder/folderToFile', '/target/folder/link'],
			tree: [
				'/target/folder/a.txt = uploaded a.txt',
				'/target/folder/fileToFolder/z.txt = uploaded z.txt',
				'/target/folder/folderToFile = uploaded folderToFile',
				'/target/folder/keep.txt = /target/folder/keep.txt',
				'/target/folder/link/g.txt = uploaded g.txt',
				'/target/folder/new.txt = uploaded new.txt',
				'/target/folder/sub/existing.txt = /target/folder/sub/existing.txt',
				'/target/folder/sub/w.txt = uploaded w.txt'
			]
		});
	});
});
