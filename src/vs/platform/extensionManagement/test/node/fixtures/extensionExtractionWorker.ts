/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ExtensionType, IExtensionManifest, TargetPlatform } from '../../../../extensions/common/extensions.js';
import { IEnvironmentService } from '../../../../environment/common/environment.js';
import { FileService } from '../../../../files/common/fileService.js';
import { IFileService } from '../../../../files/common/files.js';
import { DiskFileSystemProvider } from '../../../../files/node/diskFileSystemProvider.js';
import { TestInstantiationService } from '../../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import { IProductService } from '../../../../product/common/productService.js';
import { ITelemetryService } from '../../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../uriIdentity/common/uriIdentityService.js';
import { IUserDataProfilesService } from '../../../../userDataProfile/common/userDataProfile.js';
import { ExtensionKey } from '../../../common/extensionManagementUtil.js';
import { IExtensionsProfileScannerService } from '../../../common/extensionsProfileScannerService.js';
import { IExtensionsScannerService } from '../../../common/extensionsScannerService.js';
import { ExtensionsScanner } from '../../../node/extensionManagementService.js';

const testRoot = process.env['VSCODE_EXTRACTION_TEST_ROOT'];
if (!testRoot) {
	throw new Error('Missing extraction test root');
}
const root = URI.file(testRoot);
const disposables = new DisposableStore();
const log = disposables.add(new NullLogService());
const fileService = disposables.add(new FileService(log));
disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(log))));
const instantiation = disposables.add(new TestInstantiationService());
instantiation.stub(IEnvironmentService, {});
instantiation.stub(IFileService, fileService);
instantiation.stub(ILogService, log);
instantiation.stub(ITelemetryService, NullTelemetryService);
instantiation.stub(IProductService, {});
instantiation.stub(IUserDataProfilesService, {});
instantiation.stub(IExtensionsProfileScannerService, {});
instantiation.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
const phase = process.env['VSCODE_EXTRACTION_TEST_PHASE'] ?? 'metadata';
const manifest: IExtensionManifest = { publisher: 'test', name: 'recovery', version: '1.0.0', engines: { vscode: '*' } };

async function pause(location: URI): Promise<void> {
	const resumed = new Promise<void>(resolve => process.once('message', () => resolve()));
	process.send?.({ type: 'paused', phase, location: location.toString() });
	await resumed;
}

instantiation.stub(IExtensionsScannerService, {
	userExtensionsLocation: joinPath(root, 'extensions'),
	updateManifestMetadata: async location => {
		if (phase === 'metadata') {
			await pause(location);
		}
		await fileService.writeFile(joinPath(location, 'metadata-finished'), VSBuffer.fromString('finished'));
	},
	scanExistingExtension: async location => ({
		identifier: { id: 'test.recovery' }, location, manifest, type: ExtensionType.User,
		isBuiltin: false, isValid: true, validations: [], targetPlatform: TargetPlatform.UNDEFINED,
		metadata: undefined, preRelease: false, forceAutoUpdate: false,
	}),
});

class PausingExtensionsScanner extends ExtensionsScanner {
	protected override async rename(source: string, target: string): Promise<void> {
		if (phase === 'rename') {
			await pause(URI.file(source));
		}
		await super.rename(source, target);
	}
}

const scanner = disposables.add(instantiation.createInstance(PausingExtensionsScanner, async () => undefined));
try {
	const extension = await scanner.extractUserExtension(new ExtensionKey({ id: 'test.recovery' }, '1.0.0'), joinPath(root, 'extension.vsix').fsPath, false, CancellationToken.None);
	process.send?.({ type: 'completed', location: extension.location.toString() });
} catch (error) {
	process.send?.({ type: 'error', error: String(error) });
	process.exitCode = 1;
} finally {
	disposables.dispose();
	process.disconnect?.();
}
