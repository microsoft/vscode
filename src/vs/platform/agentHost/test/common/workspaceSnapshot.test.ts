/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { renderWorkspaceSnapshot, renderWorkspaceSnapshotStructure, type IWorkspaceSnapshot } from '../../common/workspaceSnapshot.js';

suite('workspaceSnapshot', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('renders each root as a tree, marks truncation, and wraps the result as a host instruction', () => {
		const snapshot: IWorkspaceSnapshot = {
			roots: [
				{ heading: '/a', lines: ['README.md', 'src/', '\tmain.ts'], truncated: true },
				{ heading: '/b', lines: ['notes.md'], truncated: false },
			],
		};
		const structure = '/a\nREADME.md\nsrc/\n\tmain.ts\n...\n\n/b\nnotes.md';
		assert.deepStrictEqual({ structure: renderWorkspaceSnapshotStructure(snapshot), instruction: renderWorkspaceSnapshot(snapshot), empty: renderWorkspaceSnapshot({ roots: [] }) }, {
			structure,
			instruction: `<workspace_info>\nInitial workspace structure (file names only):\n\`\`\`text\n${structure}\n\`\`\`\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>`,
			empty: undefined,
		});
	});
});
