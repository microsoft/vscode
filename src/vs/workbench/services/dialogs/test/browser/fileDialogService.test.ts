/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../base/common/network.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { HTMLFileSystemProvider } from '../../../../../platform/files/browser/htmlFileSystemProvider.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { FileDialogService } from '../../browser/fileDialogService.js';

suite('Browser FileDialogService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let pickerWindow: Window & typeof globalThis;
	let dialog: FileDialogService;
	let handles: FileSystemFileHandle[];
	let pickerOptions: OpenFilePickerOptions | undefined;
	let pickerError: Error | undefined;

	class TestFileDialogService extends FileDialogService {
		protected override getFilePickerWindow(): Window & typeof globalThis {
			return pickerWindow;
		}
	}

	function fileHandle(name: string): FileSystemFileHandle {
		return new class extends mock<FileSystemFileHandle>() {
			override readonly kind = 'file';
			override readonly name = name;
		}();
	}

	function showOpenFilePicker(options?: OpenFilePickerOptions & { multiple?: false }): Promise<[FileSystemFileHandle]>;
	function showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
	async function showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]> {
		pickerOptions = options;
		if (pickerError) {
			throw pickerError;
		}
		return handles;
	}

	setup(() => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new HTMLFileSystemProvider(undefined, 'test', new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		const instantiationService = workbenchInstantiationService({ fileService: () => fileService }, disposables);
		dialog = instantiationService.createInstance(TestFileDialogService);
		handles = [fileHandle('notes.txt'), fileHandle('screenshot.png')];
		pickerOptions = undefined;
		pickerError = undefined;
		pickerWindow = upcastPartial<Window & typeof globalThis>({
			showOpenFilePicker,
			showDirectoryPicker: async () => new class extends mock<FileSystemDirectoryHandle>() {
				override readonly kind = 'directory';
				override readonly name = 'folder';
			}(),
		});
	});

	test('enables multiple selection and registers every selected file', async () => {
		const result = await dialog.showOpenDialog({ canSelectFiles: true, canSelectMany: true });

		assert.deepStrictEqual({ multiple: pickerOptions?.multiple, startIn: pickerOptions?.startIn, paths: result?.map(uri => uri.path) }, {
			multiple: true,
			startIn: 'documents',
			paths: ['/notes.txt', '/screenshot.png'],
		});
	});

	for (const canSelectMany of [false, undefined]) {
		test(`preserves single-file selection when canSelectMany is ${canSelectMany}`, async () => {
			handles = [fileHandle('notes.txt')];
			const result = await dialog.showOpenDialog({ canSelectFiles: true, canSelectMany });

			assert.deepStrictEqual({ multiple: pickerOptions?.multiple, paths: result?.map(uri => uri.path) }, {
				multiple: false,
				paths: ['/notes.txt'],
			});
		});
	}

	test('returns no files when the browser picker is cancelled', async () => {
		pickerError = new DOMException('Cancelled', 'AbortError');

		assert.strictEqual(await dialog.showOpenDialog({ canSelectFiles: true, canSelectMany: true }), undefined);
	});

	test('preserves directory selection', async () => {
		const result = await dialog.showOpenDialog({ canSelectFiles: false, canSelectFolders: true });

		assert.deepStrictEqual({ pickerOptions, paths: result?.map(uri => uri.path) }, {
			pickerOptions: undefined,
			paths: ['/folder'],
		});
	});
});
