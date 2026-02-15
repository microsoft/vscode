/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ChatAttachmentResolveService } from '../../browser/attachments/chatAttachmentResolveService.js';
import { createFileStat } from '../../../../test/common/workbenchTestServices.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';

suite('ChatAttachmentResolveService', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let service: ChatAttachmentResolveService;

	/**
	 * Map from directory URI string to children, simulating a file tree.
	 * Populated per-test to control the mock directory structure.
	 */
	let directoryTree: Map<string, { resource: URI; isFile: boolean; isDirectory: boolean }[]>;

	/**
	 * Set of file URI strings that should be treated as valid images
	 * by the mocked resolveImageEditorAttachContext.
	 */
	let imageFileUris: Set<string>;

	setup(() => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		directoryTree = new Map();
		imageFileUris = new Set();

		// Stub IFileService with resolve() that uses the directoryTree map
		instantiationService.stub(IFileService, {
			resolve: async (resource: URI): Promise<IFileStatWithMetadata> => {
				const children = directoryTree.get(resource.toString());
				if (children !== undefined) {
					return createFileStat(resource, false, false, true, false, children);
				}
				// Treat as a file
				return createFileStat(resource, false, true, false);
			}
		});

		instantiationService.stub(IEditorService, {});
		instantiationService.stub(ITextModelService, {});
		instantiationService.stub(IExtensionService, {});
		instantiationService.stub(IDialogService, {});

		service = instantiationService.createInstance(ChatAttachmentResolveService);

		// Override resolveImageEditorAttachContext to avoid DOM dependencies (canvas, Image, etc.)
		// and return a predictable image entry for files in the imageFileUris set.
		service.resolveImageEditorAttachContext = async (resource: URI): Promise<IChatRequestVariableEntry | undefined> => {
			if (imageFileUris.has(resource.toString())) {
				return {
					id: resource.toString(),
					name: resource.path.split('/').pop()!,
					value: new Uint8Array([1, 2, 3]),
					kind: 'image',
				};
			}
			return undefined;
		};
	});

	test('returns empty array for empty directory', async () => {
		const dirUri = URI.file('/test/empty-dir');
		directoryTree.set(dirUri.toString(), []);

		const result = await service.resolveDirectoryImages(dirUri);
		assert.deepStrictEqual(result, []);
	});

	test('returns image entries for image files in directory', async () => {
		const dirUri = URI.file('/test/images-dir');
		const pngUri = URI.file('/test/images-dir/photo.png');
		const jpgUri = URI.file('/test/images-dir/photo.jpg');
		const txtUri = URI.file('/test/images-dir/readme.txt');

		directoryTree.set(dirUri.toString(), [
			{ resource: pngUri, isFile: true, isDirectory: false },
			{ resource: jpgUri, isFile: true, isDirectory: false },
			{ resource: txtUri, isFile: true, isDirectory: false },
		]);
		imageFileUris.add(pngUri.toString());
		imageFileUris.add(jpgUri.toString());

		const result = await service.resolveDirectoryImages(dirUri);
		assert.strictEqual(result.length, 2);
		assert.ok(result.every(e => e.kind === 'image'));
		const names = result.map(e => e.name).sort();
		assert.deepStrictEqual(names, ['photo.jpg', 'photo.png']);
	});

	test('ignores non-image files', async () => {
		const dirUri = URI.file('/test/text-dir');
		const txtUri = URI.file('/test/text-dir/file.txt');
		const tsUri = URI.file('/test/text-dir/index.ts');

		directoryTree.set(dirUri.toString(), [
			{ resource: txtUri, isFile: true, isDirectory: false },
			{ resource: tsUri, isFile: true, isDirectory: false },
		]);

		const result = await service.resolveDirectoryImages(dirUri);
		assert.deepStrictEqual(result, []);
	});

	test('recursively discovers images in subdirectories', async () => {
		const rootUri = URI.file('/test/root');
		const subDirUri = URI.file('/test/root/subdir');
		const deepDirUri = URI.file('/test/root/subdir/deep');

		const rootPng = URI.file('/test/root/logo.png');
		const subPng = URI.file('/test/root/subdir/banner.webp');
		const deepJpg = URI.file('/test/root/subdir/deep/photo.jpeg');
		const deepTxt = URI.file('/test/root/subdir/deep/notes.txt');

		directoryTree.set(rootUri.toString(), [
			{ resource: rootPng, isFile: true, isDirectory: false },
			{ resource: subDirUri, isFile: false, isDirectory: true },
		]);
		directoryTree.set(subDirUri.toString(), [
			{ resource: subPng, isFile: true, isDirectory: false },
			{ resource: deepDirUri, isFile: false, isDirectory: true },
		]);
		directoryTree.set(deepDirUri.toString(), [
			{ resource: deepJpg, isFile: true, isDirectory: false },
			{ resource: deepTxt, isFile: true, isDirectory: false },
		]);

		imageFileUris.add(rootPng.toString());
		imageFileUris.add(subPng.toString());
		imageFileUris.add(deepJpg.toString());

		const result = await service.resolveDirectoryImages(rootUri);
		assert.strictEqual(result.length, 3);
		assert.ok(result.every(e => e.kind === 'image'));
		const names = result.map(e => e.name).sort();
		assert.deepStrictEqual(names, ['banner.webp', 'logo.png', 'photo.jpeg']);
	});

	test('handles unreadable directory gracefully', async () => {
		const dirUri = URI.file('/test/unreadable');
		// Override resolve to throw for this URI
		instantiationService.stub(IFileService, {
			resolve: async (resource: URI): Promise<IFileStatWithMetadata> => {
				if (resource.toString() === dirUri.toString()) {
					throw new Error('Permission denied');
				}
				return createFileStat(resource, false, true, false);
			}
		});
		// Re-create service with the new stub
		service = instantiationService.createInstance(ChatAttachmentResolveService);
		service.resolveImageEditorAttachContext = async (resource: URI): Promise<IChatRequestVariableEntry | undefined> => {
			if (imageFileUris.has(resource.toString())) {
				return {
					id: resource.toString(),
					name: resource.path.split('/').pop()!,
					value: new Uint8Array([1, 2, 3]),
					kind: 'image',
				};
			}
			return undefined;
		};

		const result = await service.resolveDirectoryImages(dirUri);
		assert.deepStrictEqual(result, []);
	});

	test('handles mixed directory with images and non-images', async () => {
		const dirUri = URI.file('/test/mixed');
		const gifUri = URI.file('/test/mixed/animation.gif');
		const jsUri = URI.file('/test/mixed/script.js');
		const bmpUri = URI.file('/test/mixed/icon.bmp');

		directoryTree.set(dirUri.toString(), [
			{ resource: gifUri, isFile: true, isDirectory: false },
			{ resource: jsUri, isFile: true, isDirectory: false },
			{ resource: bmpUri, isFile: true, isDirectory: false },
		]);
		imageFileUris.add(gifUri.toString());
		imageFileUris.add(bmpUri.toString());
		// bmp is NOT in CHAT_ATTACHABLE_IMAGE_MIME_TYPES (only png, jpg, jpeg, gif, webp)
		// so it should be skipped by the regex even though it would resolve successfully

		const result = await service.resolveDirectoryImages(dirUri);
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].name, 'animation.gif');
	});
});
