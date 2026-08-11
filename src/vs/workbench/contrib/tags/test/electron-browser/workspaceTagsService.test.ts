/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getNodeModuleTags } from '../../electron-browser/workspaceTagsService.js';

suite('Telemetry - WorkspaceTagsService', () => {

	test('Azure npm package tags', function () {
		assert.deepStrictEqual({
			'@azure-rest/ai-inference': getNodeModuleTags('@azure-rest/ai-inference'),
			'@azure/arm-appservice': getNodeModuleTags('@azure/arm-appservice'),
			'@azure/communication-chat': getNodeModuleTags('@azure/communication-chat'),
			'@azure/monitor-query': getNodeModuleTags('@azure/monitor-query'),
			'@azure/provisioning': getNodeModuleTags('@azure/provisioning'),
		}, {
			'@azure-rest/ai-inference': ['@azure-rest/ai-inference', '@azure', '@azure-rest/'],
			'@azure/arm-appservice': ['@azure/arm-appservice', '@azure', '@azure/', '@azure/arm'],
			'@azure/communication-chat': ['@azure/communication-chat', '@azure', '@azure/', '@azure/communication'],
			'@azure/monitor-query': ['@azure', '@azure/', '@azure/monitor'],
			'@azure/provisioning': ['@azure', '@azure/', '@azure/provisioning'],
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
