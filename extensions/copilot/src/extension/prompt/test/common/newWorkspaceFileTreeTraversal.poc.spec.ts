/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { convertFileTreeToChatResponseFileTree, listFilesInResponseFileTree } from '../../common/fileTreeParser';

/**
 * Regression test for the "Create Workspace" path-traversal vulnerability.
 *
 * A malicious or prompt-injected model response could embed `..` segments in the
 * generated markdown file tree. When the tree was copied into the user-selected
 * parent folder, `path.relative` + `Uri.joinPath` resolved those segments and let
 * the write escape the generated workspace folder (e.g. overwriting a sibling's
 * `package.json`).
 *
 * The parser now drops any node whose name is a traversal/separator segment, so
 * the escaping path is never produced. (A second, independent containment check
 * in `createWorkspace` guards the actual file write as defense in depth.)
 */
suite('newWorkspace file tree traversal (PoC)', () => {
	const generatePreviewURI = (filename: string) => URI.file(`/preview/${filename}`);

	test('parser does not emit traversal paths from a malicious tree', () => {
		// The PoC tree embeds a `..` directory that points at the parent folder.
		const fileStructure = `
project
├── package.json
├── ..
│   └── package.json
└── safe.txt
		`;

		const { chatResponseTree } = convertFileTreeToChatResponseFileTree(fileStructure, generatePreviewURI);
		const files = listFilesInResponseFileTree(chatResponseTree.value);

		// No produced path may contain a `..` (or other) traversal segment.
		for (const file of files) {
			expect(file.split('/')).not.toContain('..');
			expect(file.split('/')).not.toContain('.');
		}

		// The legitimate, in-tree files are still produced.
		expect(files).toContain('project/package.json');
		expect(files).toContain('project/safe.txt');
	});

	test('parser rejects a malicious project root name', () => {
		const fileStructure = `
..
├── package.json
└── safe.txt
		`;

		expect(() => convertFileTreeToChatResponseFileTree(fileStructure, generatePreviewURI)).toThrow();
	});
});
