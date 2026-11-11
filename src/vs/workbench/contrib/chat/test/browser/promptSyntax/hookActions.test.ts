/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { isHookResourceInWorkspace } from '../../../browser/promptSyntax/hookActions.js';

suite('hookActions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('restricts hook resources to the selected workspace folder', () => {
		const firstWorkspace = URI.file('/workspace/first');
		const secondWorkspace = URI.file('/workspace/second');
		const firstFolder = { uri: firstWorkspace, name: 'First', index: 0, toResource: (path: string) => URI.joinPath(firstWorkspace, path) };
		const secondFolder = { uri: secondWorkspace, name: 'Second', index: 1, toResource: (path: string) => URI.joinPath(secondWorkspace, path) };
		const workspaceService = new class extends mock<IWorkspaceContextService>() {
			override getWorkspaceFolder(resource: URI) {
				return resource.path.startsWith(firstWorkspace.path) ? firstFolder : resource.path.startsWith(secondWorkspace.path) ? secondFolder : null;
			}
		}();

		assert.deepStrictEqual({
			first: isHookResourceInWorkspace(URI.joinPath(firstWorkspace, '.github/hooks/hooks.json'), firstWorkspace, workspaceService),
			second: isHookResourceInWorkspace(URI.joinPath(secondWorkspace, '.github/hooks/hooks.json'), firstWorkspace, workspaceService),
			unscoped: isHookResourceInWorkspace(URI.joinPath(secondWorkspace, '.github/hooks/hooks.json'), undefined, workspaceService),
		}, {
			first: true,
			second: false,
			unscoped: true,
		});
	});
});
