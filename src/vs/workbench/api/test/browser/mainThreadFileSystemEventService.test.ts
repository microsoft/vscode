/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FileService } from '../../../../platform/files/common/fileService.js';
import { IFileService, IFileStatWithMetadata, IFileSystemWatcher, IWatchOptions, IWatchOptionsWithCorrelation, IWatchOptionsWithoutCorrelation } from '../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
import { MainThreadFileSystemEventService } from '../../browser/mainThreadFileSystemEventService.js';
import { ExtHostFileSystemEventServiceShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadFileSystemEventService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const folder = URI.file('/repo');

	function createService(fileService: IFileService, proxy: Partial<ExtHostFileSystemEventServiceShape>) {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkingCopyFileService, new class extends mock<IWorkingCopyFileService>() {
			override readonly onDidRunWorkingCopyFileOperation = Event.None;
			override addFileOperationParticipant() { return Disposable.None; }
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IBulkEditService, {});
		instantiationService.stub(IProgressService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(IStorageService, {});
		instantiationService.stub(IEnvironmentService, {});
		instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(disposables.add(new FileService(new NullLogService())))));

		return instantiationService.createInstance(MainThreadFileSystemEventService, SingleProxyRPCProtocol(proxy));
	}

	test('ignores watch requests that are outdated when they are ready', async () => {
		const log: string[] = [];
		const stats: DeferredPromise<IFileStatWithMetadata>[] = [];
		const service = createService(new class extends mock<IFileService>() {
			override readonly onDidFilesChange = Event.None;
			override async canHandleResource() { return true; }
			override stat(): Promise<IFileStatWithMetadata> {
				const stat = new DeferredPromise<IFileStatWithMetadata>();
				stats.push(stat);
				return stat.p;
			}
			override watch(resource: URI, options: IWatchOptionsWithCorrelation): IFileSystemWatcher;
			override watch(resource: URI, options?: IWatchOptionsWithoutCorrelation): IDisposable;
			override watch(resource: URI, options?: IWatchOptions): IDisposable {
				const request = `${resource.path} [${options?.excludes}]`;
				log.push(`watch ${request}`);
				return toDisposable(() => log.push(`unwatch ${request}`));
			}
		}, {});
		const directory = upcastPartial<IFileStatWithMetadata>({ isDirectory: true });

		// A newer request of the same session is ready first
		const first = service.$watch('ext', 1, folder, { recursive: true, excludes: [] }, false);
		const second = service.$watch('ext', 1, folder, { recursive: true, excludes: ['out/**/*'] }, false);
		await timeout(0);
		stats[1].complete(directory);
		await second;
		stats[0].complete(directory);
		await first;
		log.push('-- out of order');

		// Unwatched while pending
		const unwatched = service.$watch('ext', 2, folder, { recursive: true, excludes: [] }, false);
		await timeout(0);
		service.$unwatch(2);
		stats[2].complete(directory);
		await unwatched;
		log.push('-- unwatched');

		// Disposed while pending
		const disposed = service.$watch('ext', 3, folder, { recursive: true, excludes: [] }, false);
		await timeout(0);
		service.dispose();
		stats[3].complete(directory);
		await disposed;

		assert.deepStrictEqual(log, [
			'watch /repo [out/**/*]',
			'-- out of order',
			'-- unwatched',
			'unwatch /repo [out/**/*]',
		]);
	});
});
