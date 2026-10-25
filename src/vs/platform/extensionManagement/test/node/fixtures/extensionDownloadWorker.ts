/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { INativeEnvironmentService } from '../../../../environment/common/environment.js';
import { FileService } from '../../../../files/common/fileService.js';
import { IFileService } from '../../../../files/common/files.js';
import { DiskFileSystemProvider } from '../../../../files/node/diskFileSystemProvider.js';
import { TestInstantiationService } from '../../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import { ITelemetryService } from '../../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../uriIdentity/common/uriIdentityService.js';
import { IExtensionGalleryService, IGalleryExtension, InstallOperation } from '../../../common/extensionManagement.js';
import { ExtensionsDownloader } from '../../../node/extensionDownloader.js';
import { IExtensionSignatureVerificationService } from '../../../node/extensionSignatureVerificationService.js';

const rootPath = process.env.VSCODE_DOWNLOAD_TEST_ROOT;
assert.ok(rootPath);
const root = URI.file(rootPath);
const phase = process.env.VSCODE_DOWNLOAD_TEST_PHASE;
const resume = new DeferredPromise<void>();
process.once('message', () => resume.complete());
const pause = async (location: URI) => {
	process.send?.({ type: 'paused', location: location.toString() });
	await resume.p;
};
class DownloadWorker extends ExtensionsDownloader {
	protected override async rename(source: URI, target: URI): Promise<void> {
		if (phase === 'rename') {
			await pause(source);
		}
		await super.rename(source, target);
	}
}

const disposables = new DisposableStore();
try {
	const logService = disposables.add(new NullLogService());
	const fileService = disposables.add(new FileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(INativeEnvironmentService, { extensionsDownloadLocation: joinPath(root, 'CachedExtensionVSIXs') });
	instantiationService.stub(IFileService, fileService);
	instantiationService.stub(ILogService, logService);
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
	instantiationService.stub(IExtensionSignatureVerificationService, {});
	instantiationService.stub(IExtensionGalleryService, { download: async (_extension, location) => {
		const contents = await fs.readFile(joinPath(root, 'fixture.vsix').fsPath);
		if (phase === 'download') {
			await fs.writeFile(location.fsPath, contents.subarray(0, Math.floor(contents.length / 2)));
			await pause(location);
		}
		await fs.writeFile(location.fsPath, contents);
	} });
	const downloader = disposables.add(instantiationService.createInstance(DownloadWorker));
	const extension = { identifier: { id: 'test.recovery' }, publisher: 'test', name: 'recovery', version: '1.0.0', properties: {}, isSigned: false } as IGalleryExtension;
	await downloader.download(extension, InstallOperation.Install, false);
	process.send?.({ type: 'completed' });
} catch (error) {
	process.send?.({ type: 'error', error: String(error) });
	process.exitCode = 1;
} finally {
	disposables.dispose();
	process.disconnect?.();
}
