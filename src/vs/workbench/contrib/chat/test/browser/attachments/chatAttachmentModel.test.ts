/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ISharedWebContentExtractorService } from '../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { ChatAttachmentModel } from '../../../browser/attachments/chatAttachmentModel.js';
import { IChatAttachmentResolveService } from '../../../browser/attachments/chatAttachmentResolveService.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { getChatBinaryReference } from '../../../common/model/chatSessionResources.js';
import { createTestChatSessionResources } from '../../common/model/chatSessionResourceLocks.js';

suite('ChatAttachmentModel binary ownership', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const resolveAfterDisposal of [false, true]) {
		test(`folder resolution does not retain disposed images (late=${resolveAfterDisposal})`, async () => {
			const files = disposables.add(new FileService(new NullLogService()));
			disposables.add(files.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
			const resources = disposables.add(createTestChatSessionResources(files));
			const directory = URI.file('/session.resources');
			const prepared = await resources.prepare({ value: new Uint8Array([0, 128, 255]) }, directory);
			resources.confirmWrite(directory, prepared.hashes);
			const image = resources.restore(prepared.value, directory).value;
			const resolved = new DeferredPromise<IChatRequestVariableEntry[]>();
			const services = disposables.add(new TestInstantiationService());
			services.stub(IFileService, files);
			services.stub(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { });
			services.stub(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() {
				override resolveDirectoryImages(): Promise<IChatRequestVariableEntry[]> {
					return resolved.p;
				}
			});
			const model = disposables.add(services.createInstance(ChatAttachmentModel));
			model.addContext({ kind: 'image', id: 'image', name: 'image.png', value: image });
			model.addFolder(URI.file('/folder'));
			await getChatBinaryReference(image)!.ready();
			if (resolveAfterDisposal) {
				model.dispose();
			}
			await resolved.complete([]);
			if (!resolveAfterDisposal) {
				model.dispose();
			}
			assert.deepStrictEqual({
				collected: await resources.collect(directory, new Set()),
				exists: await files.exists(directory),
			}, { collected: true, exists: false });
		});
	}

	test('disposed attachment models ignore synchronous mutations and clears', () => {
		const services = disposables.add(new TestInstantiationService());
		services.stub(IFileService, new class extends mock<IFileService>() { });
		services.stub(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { });
		services.stub(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() { });
		const model = disposables.add(services.createInstance(ChatAttachmentModel));
		model.dispose();
		model.addFolder(URI.file('/folder'));
		model.clear();
		model.clear(true);
		assert.strictEqual(model.size, 0);
	});
});
