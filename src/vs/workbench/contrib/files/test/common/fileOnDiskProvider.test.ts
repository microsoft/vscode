/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { workbenchInstantiationService, TestFileService } from 'vs/workbench/test/workbenchTestServices';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextFileContentProvider } from 'vs/workbench/contrib/files/common/files';
import { snapshotToString } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';

class ServiceAccessor {
	constructor(
		@IFileService public fileService: TestFileService
	) {
	}
}

suite('Files - FileOnDiskContentProvider', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('provideTextContent', async () => {
		const provider = instantiationService.createInstance(TextFileContentProvider);
		const uri = URI.parse('testFileOnDiskContentProvider://foo');

		const content = await provider.provideTextContent(uri.with({ scheme: 'conflictResolution', query: JSON.stringify({ scheme: uri.scheme }) }));

		assert.equal(snapshotToString(content.createSnapshot()), 'Hello Html');
		assert.equal(accessor.fileService.getLastReadFileUri().toString(), uri.toString());
	});
});
