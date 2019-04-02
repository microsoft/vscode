/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FileService2 } from 'vs/workbench/services/files2/common/fileService2';
import { URI } from 'vs/base/common/uri';
import { IFileSystemProviderRegistrationEvent, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { IDisposable } from 'vs/base/common/lifecycle';
import { NullFileSystemProvider } from 'vs/workbench/test/workbenchTestServices';
import { NullLogService } from 'vs/platform/log/common/log';

suite('File Service 2', () => {

	test('provider registration', async () => {
		const service = new FileService2(new NullLogService());
		const resource = URI.parse('test://foo/bar');

		assert.equal(service.canHandleResource(resource), false);

		const registrations: IFileSystemProviderRegistrationEvent[] = [];
		service.onDidChangeFileSystemProviderRegistrations(e => {
			registrations.push(e);
		});

		let registrationDisposable: IDisposable | undefined = undefined;
		let callCount = 0;
		service.onWillActivateFileSystemProvider(e => {
			callCount++;

			if (e.scheme === 'test' && callCount === 1) {
				e.join(new Promise(resolve => {
					registrationDisposable = service.registerProvider('test', new NullFileSystemProvider());

					resolve();
				}));
			}
		});

		await service.activateProvider('test');

		assert.equal(service.canHandleResource(resource), true);

		assert.equal(registrations.length, 1);
		assert.equal(registrations[0].scheme, 'test');
		assert.equal(registrations[0].added, true);
		assert.ok(registrationDisposable);

		await service.activateProvider('test');
		assert.equal(callCount, 2); // activation is called again

		assert.equal(service.hasCapability(resource, FileSystemProviderCapabilities.Readonly), true);
		assert.equal(service.hasCapability(resource, FileSystemProviderCapabilities.FileOpenReadWriteClose), false);

		registrationDisposable!.dispose();

		assert.equal(service.canHandleResource(resource), false);

		assert.equal(registrations.length, 2);
		assert.equal(registrations[1].scheme, 'test');
		assert.equal(registrations[1].added, false);
	});
});