/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { Schemas } from 'vs/base/common/network';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { TestNativeTextFileServiceWithEncodingOverrides, TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/electron-sandbox/workbenchTestServices';
import { IWorkingCopyFileService, WorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { WorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from 'vs/base/test/common/utils';

suite('Files - NativeTextFileService', function () {
	const disposables = new DisposableStore();

	let service: ITextFileService;
	let instantiationService: IInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);

		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));

		const fileProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileProvider));

		const collection = new ServiceCollection();
		collection.set(IFileService, fileService);
		collection.set(IWorkingCopyFileService, disposables.add(new WorkingCopyFileService(fileService, disposables.add(new WorkingCopyService()), instantiationService, disposables.add(new UriIdentityService(fileService)))));

		service = disposables.add(instantiationService.createChild(collection).createInstance(TestNativeTextFileServiceWithEncodingOverrides));
		disposables.add(<TextFileEditorModelManager>service.files);
	});

	teardown(() => {
		disposables.clear();
	});

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
