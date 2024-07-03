/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ChecksumService } from 'vs/platform/checksum/node/checksumService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { NullLogService } from 'vs/platform/log/common/log';

suite('Checksum Service', () => {

	let diskFileSystemProvider: DiskFileSystemProvider;
	let fileService: IFileService;

	setup(() => {
		const logService = new NullLogService();
		fileService = new FileService(logService);

		diskFileSystemProvider = new DiskFileSystemProvider(logService);
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);
	});

	teardown(() => {
		diskFileSystemProvider.dispose();
		fileService.dispose();
	});

	test('checksum', async () => {
		const checksumService = new ChecksumService(fileService);

		const checksum = await checksumService.checksum(URI.file(FileAccess.asFileUri('vs/platform/checksum/test/node/fixtures/lorem.txt').fsPath));
		assert.ok(checksum === 'd/9bMU0ydNCmc/hg8ItWeiLT/ePnf7gyPRQVGpd6tRI' || checksum === 'eJeeTIS0dzi8MZY+nHhjPBVtNbmGqxfVvgEOB4sqVIc'); // depends on line endings git config
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
