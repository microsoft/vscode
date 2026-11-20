/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestStorageService } from '../../../workbench/test/common/workbenchTestServices.js';
import { EmbeddedEditorMemory } from '../../electron-browser/embeddedEditor.js';

suite('EmbeddedEditorMemory', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('remembers the folders of the editor window for the next run until it is left', () => {
		const storage = disposables.add(new TestStorageService());
		new EmbeddedEditorMemory(storage).remember([
			{ folderUri: URI.file('/repo') },
			{ folderUri: URI.parse('vscode-remote://ssh-remote+host/work'), label: 'work [SSH: host]' },
		]);

		const restarted = new EmbeddedEditorMemory(storage);
		const folders = restarted.folders?.map(folder => ({ folderUri: folder.folderUri.toString(), label: folder.label }));
		restarted.forget();

		assert.deepStrictEqual({ folders, afterForget: new EmbeddedEditorMemory(storage).folders }, {
			folders: [
				{ folderUri: 'file:///repo', label: undefined },
				{ folderUri: 'vscode-remote://ssh-remote%2Bhost/work', label: 'work [SSH: host]' },
			],
			afterForget: undefined,
		});
	});
});
