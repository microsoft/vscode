/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { WorkspaceTrustState } from 'vs/platform/workspace/common/workspaceTrust';
import { WorkspaceTrustStorageService } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';


suite('WorkspaceTrustStorageService', () => {
	let testObject: WorkspaceTrustStorageService;
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IStorageService, new TestStorageService());
		instantiationService.stub(IFileService, new FileService(new NullLogService()));
	});

	teardown(() => testObject.dispose());

	test('empty storage', () => {
		testObject = instantiationService.createInstance(WorkspaceTrustStorageService);
		assert.strictEqual(testObject.getTrustStateInfo().uriTrustInfo.length, 0);
	});

	test('set trusted/untrusted folders', () => {
		testObject = instantiationService.createInstance(WorkspaceTrustStorageService);
		testObject.setTrustedFolders([URI.parse('file:///trustedFolder1'), URI.parse('file:///trustedFolder2')]);
		testObject.setTrustedFolders([URI.parse('file:///trustedFolder3')]);
		testObject.setUntrustedFolders([URI.parse('file:///untrustedFolder')]);

		const uriTrustInfo = testObject.getTrustStateInfo().uriTrustInfo;
		assert.strictEqual(uriTrustInfo.filter(uri => uri.trustState === WorkspaceTrustState.Trusted), 3);
		assert.strictEqual(uriTrustInfo.filter(uri => uri.trustState === WorkspaceTrustState.Untrusted), 1);
	});
});
