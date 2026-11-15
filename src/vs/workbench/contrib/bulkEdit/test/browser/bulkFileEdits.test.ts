/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ResourceFileEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { WorkspaceFileEditOptions } from '../../../../../editor/common/languages.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileType, IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { IUndoRedoElement, IUndoRedoService, UndoRedoGroup } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { mock } from '../../../../test/common/workbenchTestServices.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ICopyOperation, ICreateFileOperation, ICreateOperation, IDeleteOperation, IFileOperationUndoRedoInfo, IWorkingCopyFileService } from '../../../../services/workingCopy/common/workingCopyFileService.js';
import { BulkFileEdits } from '../../browser/bulkFileEdits.js';

suite('BulkFileEdits', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function applyDelete(types: readonly FileType[], options?: WorkspaceFileEditOptions) {
		const files = types.map((type, index) => ({
			resource: URI.file(`/workspace/entry-${index}`),
			name: `entry-${index}`,
			isFile: (type & FileType.File) !== 0,
			isDirectory: (type & FileType.Directory) !== 0,
			isSymbolicLink: (type & FileType.SymbolicLink) !== 0,
			mtime: 0,
			ctime: 0,
			etag: '',
			size: 3,
			readonly: false,
			locked: false,
			executable: false,
			children: undefined,
			value: VSBuffer.fromByteArray([index, 128, 255])
		}));

		function getFile(resource: URI) {
			const file = files.find(file => isEqual(file.resource, resource));
			assert.ok(file);
			return file;
		}

		const operations: { kind: 'read' | 'delete' | 'create' | 'createFolder'; resource: string; contents?: number[] }[] = [];
		const fileService = new class extends mock<IFileService>() {
			override async resolve(resource: URI): Promise<IFileStatWithMetadata> {
				return getFile(resource);
			}

			override hasCapability(): boolean {
				return false;
			}

			override async readFile(resource: URI): Promise<IFileContent> {
				operations.push({ kind: 'read', resource: resource.path });
				return getFile(resource);
			}
		};

		const workingCopyFileService = new class extends mock<IWorkingCopyFileService>() {
			override async delete(deletes: IDeleteOperation[]): Promise<void> {
				for (const { resource } of deletes) {
					operations.push({ kind: 'delete', resource: resource.path });
				}
			}

			override async create(creates: ICreateFileOperation[]): Promise<readonly IFileStatWithMetadata[]> {
				for (const { resource, contents } of creates) {
					assert.ok(contents instanceof VSBuffer);
					operations.push({ kind: 'create', resource: resource.path, contents: Array.from(contents.buffer) });
				}
				return [];
			}

			override async createFolder(creates: ICreateOperation[]): Promise<readonly IFileStatWithMetadata[]> {
				for (const { resource } of creates) {
					operations.push({ kind: 'createFolder', resource: resource.path });
				}
				return [];
			}
		};

		let undoElement: IUndoRedoElement | undefined;
		const undoRedoService = new class extends mock<IUndoRedoService>() {
			override pushElement(element: IUndoRedoElement): void {
				undoElement = element;
			}
		};
		const textFileService = new class extends mock<ITextFileService>() {
			override async getEncodedReadable(): Promise<never> {
				assert.fail('Undo must restore the original contents, not create an empty file');
			}
		};

		const instantiationService = store.add(new InstantiationService(new ServiceCollection(
			[IConfigurationService, new TestConfigurationService()],
			[IFileService, fileService],
			[ILogService, new NullLogService()],
			[ITextFileService, textFileService],
			[IUndoRedoService, undoRedoService],
			[IWorkingCopyFileService, workingCopyFileService],
		), true));
		const edits = files.map(file => new ResourceFileEdit(file.resource, undefined, { recursive: true, folder: file.isDirectory, ...options }));
		const bulkFileEdits = instantiationService.createInstance(
			BulkFileEdits,
			'Delete',
			'delete',
			new UndoRedoGroup(),
			undefined,
			false,
			Progress.None,
			CancellationToken.None,
			edits
		);

		await bulkFileEdits.apply();
		assert.ok(undoElement);
		await undoElement.undo();

		return operations;
	}

	test('delete skips undo contents for non-regular files', async () => {
		assert.deepStrictEqual(await applyDelete([FileType.Unknown]), [
			{ kind: 'delete', resource: '/workspace/entry-0' }
		]);
	});

	test('delete preserves undo contents for regular files', async () => {
		assert.deepStrictEqual(await applyDelete([FileType.File]), [
			{ kind: 'read', resource: '/workspace/entry-0' },
			{ kind: 'delete', resource: '/workspace/entry-0' },
			{ kind: 'create', resource: '/workspace/entry-0', contents: [0, 128, 255] }
		]);
	});

	test('undo restores only regular files in a mixed deletion', async () => {
		assert.deepStrictEqual(await applyDelete([FileType.File, FileType.Unknown, FileType.File]), [
			{ kind: 'read', resource: '/workspace/entry-0' },
			{ kind: 'read', resource: '/workspace/entry-2' },
			{ kind: 'delete', resource: '/workspace/entry-0' },
			{ kind: 'delete', resource: '/workspace/entry-1' },
			{ kind: 'delete', resource: '/workspace/entry-2' },
			{ kind: 'create', resource: '/workspace/entry-0', contents: [0, 128, 255] },
			{ kind: 'create', resource: '/workspace/entry-2', contents: [2, 128, 255] }
		]);
	});

	test('delete does not restore non-regular files when the folder option is set', async () => {
		assert.deepStrictEqual(await applyDelete([FileType.Unknown], { folder: true }), [
			{ kind: 'delete', resource: '/workspace/entry-0' }
		]);
	});

	test('delete preserves undo for empty folders', async () => {
		assert.deepStrictEqual(await applyDelete([FileType.Directory]), [
			{ kind: 'delete', resource: '/workspace/entry-0' },
			{ kind: 'createFolder', resource: '/workspace/entry-0' }
		]);
	});

	test('delete skips undo contents exceeding the size limit', async () => {
		assert.deepStrictEqual(await applyDelete([FileType.File], { maxSize: 2 }), [
			{ kind: 'delete', resource: '/workspace/entry-0' }
		]);
	});

	test('cancelled copy registers undo for completed files', async () => {
		const files = [0, 1, 2].map(index => ({
			resource: URI.file(`/workspace/copy-${index}`),
			name: `copy-${index}`,
			isFile: true,
			isDirectory: false,
			isSymbolicLink: false,
			mtime: 0,
			ctime: 0,
			etag: '',
			size: 3,
			readonly: false,
			locked: false,
			executable: false,
			children: undefined,
			value: VSBuffer.fromByteArray([index])
		}));

		function getFile(resource: URI) {
			const file = files.find(file => isEqual(file.resource, resource));
			assert.ok(file);
			return file;
		}

		const operations: { kind: 'copy' | 'read' | 'delete'; resource: string }[] = [];
		const fileService = new class extends mock<IFileService>() {
			override async resolve(resource: URI): Promise<IFileStatWithMetadata> {
				return getFile(resource);
			}

			override hasCapability(): boolean {
				return false;
			}

			override async readFile(resource: URI): Promise<IFileContent> {
				operations.push({ kind: 'read', resource: resource.path });
				return getFile(resource);
			}
		};

		const workingCopyFileService = new class extends mock<IWorkingCopyFileService>() {
			override async copy(copies: ICopyOperation[], _token: CancellationToken, _undoInfo?: IFileOperationUndoRedoInfo, onDidCompleteOperation?: (stat: IFileStatWithMetadata) => void): Promise<readonly IFileStatWithMetadata[]> {
				// complete all but the last copy, then get cancelled
				for (const copy of copies.slice(0, -1)) {
					operations.push({ kind: 'copy', resource: copy.file.target.path });
					onDidCompleteOperation?.(getFile(copy.file.target));
				}

				throw new CancellationError();
			}

			override async delete(deletes: IDeleteOperation[]): Promise<void> {
				for (const { resource } of deletes) {
					operations.push({ kind: 'delete', resource: resource.path });
				}
			}
		};

		let undoElement: IUndoRedoElement | undefined;
		const undoRedoService = new class extends mock<IUndoRedoService>() {
			override pushElement(element: IUndoRedoElement): void {
				undoElement = element;
			}
		};

		const instantiationService = store.add(new InstantiationService(new ServiceCollection(
			[IConfigurationService, new TestConfigurationService()],
			[IFileService, fileService],
			[ILogService, new NullLogService()],
			[ITextFileService, new class extends mock<ITextFileService>() { }],
			[IUndoRedoService, undoRedoService],
			[IWorkingCopyFileService, workingCopyFileService],
		), true));

		const edits = files.map(file => new ResourceFileEdit(URI.file(`/elsewhere${file.resource.path}`), file.resource, { copy: true }));
		const bulkFileEdits = instantiationService.createInstance(
			BulkFileEdits,
			'Copy',
			'copy',
			new UndoRedoGroup(),
			undefined,
			false,
			Progress.None,
			CancellationToken.None,
			edits
		);

		await assert.rejects(() => bulkFileEdits.apply(), error => isCancellationError(error));

		assert.ok(undoElement);
		await undoElement.undo();

		assert.deepStrictEqual(operations, [
			{ kind: 'copy', resource: '/workspace/copy-0' },
			{ kind: 'copy', resource: '/workspace/copy-1' },
			{ kind: 'read', resource: '/workspace/copy-0' },
			{ kind: 'read', resource: '/workspace/copy-1' },
			{ kind: 'delete', resource: '/workspace/copy-0' },
			{ kind: 'delete', resource: '/workspace/copy-1' }
		]);
	});
});
