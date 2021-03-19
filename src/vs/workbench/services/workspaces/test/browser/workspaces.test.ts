/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IWorkspaceTrustService, workspaceTrustStateToString } from 'vs/platform/workspace/common/workspaceTrust';
import { getWorkspaceIdentifier, getSingleFolderWorkspaceIdentifier } from 'vs/workbench/services/workspaces/browser/workspaces';
import { WorkspaceTrustService } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('Workspaces', () => {
	test('workspace identifiers are stable', function () {

		// workspace identifier
		assert.strictEqual(getWorkspaceIdentifier(URI.parse('vscode-remote:/hello/test')).id, '474434e4');

		// single folder identifier
		assert.strictEqual(getSingleFolderWorkspaceIdentifier(URI.parse('vscode-remote:/hello/test'))?.id, '474434e4');
	});
});

suite('Workspace Trust', () => {
	let workspaceTrustService: IWorkspaceTrustService;
	setup(() => {
		const instantiationService: TestInstantiationService = <TestInstantiationService>workbenchInstantiationService();
		workspaceTrustService = instantiationService.createInstance(WorkspaceTrustService);
	});

	teardown(() => {

	});

	test('Sample Test', function () {
		assert.strictEqual(workspaceTrustStateToString(workspaceTrustService.getWorkspaceTrustState()), 'Trusted');
	});
});
