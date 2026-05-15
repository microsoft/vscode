/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { workspace } from 'vscode';
import { ExtensionTextDocumentManager } from '../../../platform/workspace/vscode/workspaceServiceImpl';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionTestingServices } from './services';

suite('extension text document manager', () => {
	test('no workspace folders by default', () => {
		const accessor = createExtensionTestingServices().createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const manager = instantiationService.createInstance(ExtensionTextDocumentManager);

		const folders = manager.getWorkspaceFolders();

		assert.deepStrictEqual(folders, []);
	});

	test('workspace folders', () => {
		const accessor = createExtensionTestingServices().createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const manager = instantiationService.createInstance(ExtensionTextDocumentManager);

		sinon.stub(workspace, 'workspaceFolders').value([
			{
				uri: URI.file('/path/to/folder1'),
				name: 'folder1',
				index: 0,
			},
			{
				uri: URI.file('/path/to/folder2'),

				name: 'folder2',
				index: 1,
			},
		]);

		const folders = manager.getWorkspaceFolders();

		assert.deepStrictEqual(folders, [URI.parse('file:///path/to/folder1'), URI.parse('file:///path/to/folder2')]);
	});
});
