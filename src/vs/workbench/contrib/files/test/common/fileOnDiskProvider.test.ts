/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileOnDiskContentProvider, resourceToFileOnDisk } from 'vs/workbench/contrib/files/common/files';
import { snapshotToString } from 'vs/workbench/services/textfile/common/textfiles';

suite('Files - FileOnDiskContentProvider', () => {

	let instantiationService: IInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService();
	});

	test('provideTextContent', async () => {
		const provider = instantiationService.createInstance(FileOnDiskContentProvider);

		const content = await provider.provideTextContent(resourceToFileOnDisk('conflictResolution', URI.parse('testFileOnDiskContentProvider://foo')));

		assert.equal(snapshotToString(content.createSnapshot()), 'Hello Html');
	});
});
