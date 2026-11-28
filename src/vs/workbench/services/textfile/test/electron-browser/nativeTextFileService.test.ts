/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy, stub } from 'sinon';
import { ITextFileService } from '../../common/textfiles.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { TextFileEditorModelManager } from '../../common/textFileEditorModelManager.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNativeTextFileServiceWithEncodingOverrides, TestServiceAccessor, workbenchInstantiationService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { IWorkingCopyFileService, WorkingCopyFileService } from '../../../workingCopy/common/workingCopyFileService.js';
import { WorkingCopyService } from '../../../workingCopy/common/workingCopyService.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TextFileEditorModel } from '../../common/textFileEditorModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';

suite('Files - NativeTextFileService', function () {
	const disposables = new DisposableStore();

	let service: ITextFileService;
	let instantiationService: IInstantiationService;
	let fileService: IFileService;
	let dialogService: TestDialogService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);

		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));

		const fileProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileProvider));

		const collection = new ServiceCollection();
		collection.set(IFileService, fileService);
		dialogService = new TestDialogService();
		collection.set(IDialogService, dialogService);
		collection.set(IWorkingCopyFileService, disposables.add(new WorkingCopyFileService(fileService, disposables.add(new WorkingCopyService()), instantiationService, disposables.add(new UriIdentityService(fileService)))));

		service = disposables.add(instantiationService.createChild(collection).createInstance(TestNativeTextFileServiceWithEncodingOverrides));
		collection.set(ITextFileService, service);
		disposables.add(<TextFileEditorModelManager>service.files);
	});

	teardown(() => {
		for (const model of service.files.models) {
			model.dispose();
		}
		disposables.clear();
	});

	for (const targetKind of ['text', 'binary', 'too large']) {
		for (const confirmed of [false, true]) {
			test(`save - associated untitled file confirms ${targetKind} overwrite (${confirmed ? 'accepted' : 'cancelled'})`, async function () {
				const target = toResource.call(this, '/path/target.txt');
				const untitled = disposables.add(await service.untitled.resolve({ associatedResource: target, initialValue: 'unsaved changes' }));
				const originalContents = targetKind === 'binary' ? 'existing\0binary\0content' : 'existing text content';
				await fileService.writeFile(target, VSBuffer.fromString(originalContents));

				if (targetKind === 'too large') {
					const readStream = stub(service, 'readStream').callThrough();
					disposables.add(toDisposable(() => readStream.restore()));
					readStream.onFirstCall().rejects(new FileOperationError('File is too large', FileOperationResult.FILE_TOO_LARGE));
				}

				dialogService.setConfirmResult({ confirmed });
				const confirm = spy(dialogService, 'confirm');
				disposables.add(toDisposable(() => confirm.restore()));

				const result = await service.save(untitled.resource);

				assert.deepStrictEqual({
					result: result?.toString(),
					contents: (await fileService.readFile(target)).value.toString(),
					dirty: untitled.isDirty(),
					sourceContents: untitled.textEditorModel?.getValue(),
					confirmations: confirm.callCount
				}, {
					result: confirmed ? target.toString() : undefined,
					contents: confirmed ? 'unsaved changes' : originalContents,
					dirty: !confirmed,
					sourceContents: confirmed ? '' : 'unsaved changes',
					confirmations: 1
				});
			});
		}
	}

	test('shutdown joins on pending saves', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		await model.resolve();

		let pendingSaveAwaited = false;
		model.save().then(() => pendingSaveAwaited = true);

		const accessor = instantiationService.createInstance(TestServiceAccessor);
		accessor.lifecycleService.fireShutdown();

		assert.ok(accessor.lifecycleService.shutdownJoiners.length > 0);
		await Promise.all(accessor.lifecycleService.shutdownJoiners);

		assert.strictEqual(pendingSaveAwaited, true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
