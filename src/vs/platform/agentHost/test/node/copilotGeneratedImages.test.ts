/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { appendGeneratedImagePaths, getGeneratedImageFileName, getGeneratedImages, saveGeneratedImages } from '../../node/copilot/copilotGeneratedImages.js';

/** A 1x1 PNG, and the name the Copilot CLI's own tests expect for it. */
const GENERATED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAABHNCSVQICAgIfAhkiAAAAAFzUkdCAK7OHOkAAAANSURBVAiZY2BgYPgPAAEEAQB9ssjfAAAAAElFTkSuQmCC';
const GENERATED_PNG_FILE_NAME = 'image-dc2f9147f39d1c93.png';
const GENERATED_PNG_ID = `sha256:${createHash('sha256').update(Buffer.from(GENERATED_PNG, 'base64')).digest('hex')}`;

/** The native image tool's result for one image, as the runtime passes it to SDK post-tool-use hooks. */
function imageToolResult(overrides: { imageId?: string; mimeType?: string; content?: unknown } = {}) {
	return {
		resultType: 'success',
		textResultForLlm: `Image generated successfully.\nimage_id: ${overrides.imageId ?? GENERATED_PNG_ID}`,
		contents: [overrides.content ?? { type: 'image', data: GENERATED_PNG, mimeType: 'image/png' }],
		structuredContent: { imageGeneration: { images: [{ contentIndex: 0, mimeType: overrides.mimeType ?? 'image/png', width: 1, height: 1, imageId: overrides.imageId ?? GENERATED_PNG_ID }] } },
	};
}

suite('Copilot generated images', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionDirectory = URI.file('/home/.copilot/session-state/session-1');
	const savedPath = URI.joinPath(sessionDirectory, 'images', GENERATED_PNG_FILE_NAME);

	function createFileService(): FileService {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		return fileService;
	}

	test('reads only images whose bytes match their image ID, named as the Copilot CLI names them', () => {
		const read = (toolResult: unknown) => getGeneratedImages(toolResult).map(image => ({ imageId: image.imageId, mimeType: image.mimeType, fileName: getGeneratedImageFileName(image), bytes: image.bytes.byteLength }));

		assert.deepStrictEqual({
			image: read(imageToolResult()),
			otherImageId: read(imageToolResult({ imageId: `sha256:${'0'.repeat(64)}` })),
			unsupportedType: read(imageToolResult({ mimeType: 'image/svg+xml', content: { type: 'image', data: GENERATED_PNG, mimeType: 'image/svg+xml' } })),
			typeMismatch: read(imageToolResult({ content: { type: 'image', data: GENERATED_PNG, mimeType: 'image/jpeg' } })),
			notAnImage: read(imageToolResult({ content: { type: 'text', text: GENERATED_PNG } })),
			withoutMetadata: read({ resultType: 'success', textResultForLlm: 'ok', contents: [{ type: 'image', data: GENERATED_PNG, mimeType: 'image/png' }] }),
			notAResult: read('Image generated successfully.'),
		}, {
			image: [{ imageId: GENERATED_PNG_ID, mimeType: 'image/png', fileName: GENERATED_PNG_FILE_NAME, bytes: Buffer.from(GENERATED_PNG, 'base64').byteLength }],
			otherImageId: [],
			unsupportedType: [],
			typeMismatch: [],
			notAnImage: [],
			withoutMetadata: [],
			notAResult: [],
		});
	});

	test('saves an image in the session folder, reuses the same image, and leaves a different file alone', async () => {
		const fileService = createFileService();
		const images = getGeneratedImages(imageToolResult());
		await fileService.createFolder(sessionDirectory);

		const first = await saveGeneratedImages(images, sessionDirectory, fileService, new NullLogService());
		const savedBytes = (await fileService.readFile(savedPath)).value.equals(images[0].bytes);
		const again = await saveGeneratedImages(images, sessionDirectory, fileService, new NullLogService());
		await fileService.writeFile(savedPath, VSBuffer.fromString('someone else\'s file'));
		const occupied = await saveGeneratedImages(images, sessionDirectory, fileService, new NullLogService());

		assert.deepStrictEqual({ first, savedBytes, again, occupied, occupiedContent: (await fileService.readFile(savedPath)).value.toString() }, {
			first: [{ imageId: GENERATED_PNG_ID, path: savedPath.fsPath }],
			savedBytes: true,
			again: [{ imageId: GENERATED_PNG_ID, path: savedPath.fsPath }],
			occupied: [],
			occupiedContent: 'someone else\'s file',
		});
	});

	test('does not recreate a deleted session folder', async () => {
		const fileService = createFileService();

		const saved = await saveGeneratedImages(getGeneratedImages(imageToolResult()), sessionDirectory, fileService, new NullLogService());

		assert.deepStrictEqual({ saved, created: await fileService.exists(sessionDirectory) }, { saved: [], created: false });
	});

	test('adds each saved path after its image ID line, or at the end when the line is missing', () => {
		const saved = [{ imageId: 'sha256:first', path: '/images/first.png' }, { imageId: 'sha256:second', path: '/images/second.png' }];

		assert.deepStrictEqual({
			both: appendGeneratedImagePaths('Image generated successfully.\nimage_id: sha256:first\nimage_id: sha256:second', saved),
			missingLine: appendGeneratedImagePaths('Image generated successfully.\nimage_id: sha256:first', saved),
			unsaved: appendGeneratedImagePaths('Image generated successfully.\nimage_id: sha256:other', []),
		}, {
			both: 'Image generated successfully.\nimage_id: sha256:first\npath: /images/first.png\nimage_id: sha256:second\npath: /images/second.png',
			missingLine: 'Image generated successfully.\nimage_id: sha256:first\npath: /images/first.png\nimage_id: sha256:second\npath: /images/second.png',
			unsaved: 'Image generated successfully.\nimage_id: sha256:other',
		});
	});
});
