/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ITextFileService } from '../../common/textfiles.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TextFileEditorModelManager } from '../../common/textFileEditorModelManager.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNativeTextFileServiceWithEncodingOverrides, TestServiceAccessor, workbenchInstantiationService } from '../../../../test/electron-sandbox/workbenchTestServices.js';
import { IWorkingCopyFileService, WorkingCopyFileService } from '../../../workingCopy/common/workingCopyFileService.js';
import { WorkingCopyService } from '../../../workingCopy/common/workingCopyService.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TextFileEditorModel } from '../../common/textFileEditorModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';

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
