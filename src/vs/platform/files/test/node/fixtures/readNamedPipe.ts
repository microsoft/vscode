/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { consumeStream } from '../../../../../base/common/stream.js';
import { URI } from '../../../../../base/common/uri.js';
import { NullLogService } from '../../../../log/common/log.js';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../../../common/files.js';
import { DiskFileSystemProvider } from '../../../node/diskFileSystemProvider.js';

const [method, filePath] = process.argv.slice(2);
const provider = new DiskFileSystemProvider(new NullLogService());

try {
	assert.ok(filePath);
	const resource = URI.file(filePath);

	await assert.rejects(async () => {
		switch (method) {
			case 'open': {
				const handle = await provider.open(resource, { create: false });
				await provider.close(handle);
				break;
			}
			case 'readFile':
				await provider.readFile(resource);
				break;
			case 'readFileStream':
				await consumeStream(provider.readFileStream(resource, {}, CancellationToken.None), () => undefined);
				break;
			default:
				assert.fail(`Unexpected read method: ${method}`);
		}
	}, error => error instanceof Error && toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.Unavailable);
} finally {
	provider.dispose();
}
