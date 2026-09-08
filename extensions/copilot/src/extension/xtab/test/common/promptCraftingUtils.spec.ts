/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { Schemas } from '../../../../util/vs/base/common/network';
import { URI } from '../../../../util/vs/base/common/uri';
import { resolveUniquePath, toUniquePath } from '../../common/promptCraftingUtils';

describe('NES document paths', () => {
	const workspaceRoot = URI.file('/workspace');

	it.each([
		{ path: 'src/file.cs', encoded: 'src/file.cs' },
		{ path: 'Weekly Material/Week 8/Player.cs', encoded: 'Weekly%20Material/Week%208/Player.cs' },
		{ path: 'src/literal%20escape.cs', encoded: 'src/literal%2520escape.cs' },
		{ path: 'src/name#with?delimiters:1.cs', encoded: 'src/name%23with%3Fdelimiters%3A1.cs' },
		{ path: 'src/tab\tand\nnewline.cs', encoded: 'src/tab%09and%0Anewline.cs' },
		{ path: 'src/\u6587\u4ef6-\u{1f680}.cs', encoded: 'src/%E6%96%87%E4%BB%B6-%F0%9F%9A%80.cs' },
	])('round-trips $path without changing document identity', ({ path, encoded }) => {
		const document = DocumentId.create(URI.joinPath(workspaceRoot, path).toString());
		const uniquePath = toUniquePath(document, workspaceRoot.path);

		expect({
			uniquePath,
			document: resolveUniquePath(uniquePath, workspaceRoot).unwrap(),
		}).toEqual({ uniquePath: encoded, document });
	});

	it('round-trips an absolute path without a workspace', () => {
		const document = DocumentId.create(URI.file('/outside/space folder/file.cs').toString());
		const uniquePath = toUniquePath(document, undefined);

		expect({
			uniquePath,
			document: resolveUniquePath(uniquePath, undefined).unwrap(),
		}).toEqual({ uniquePath: '/outside/space%20folder/file.cs', document });
	});

	it('preserves the workspace authority for relative paths', () => {
		const root = URI.from({ scheme: Schemas.file, authority: 'server', path: '/share/project' });
		const document = DocumentId.create(URI.joinPath(root, 'space folder/file.cs').toString());

		expect(resolveUniquePath(toUniquePath(document, root.path), root).unwrap()).toBe(document);
	});

	it('keeps a notebook cell fragment distinct from a literal hash in the path', () => {
		const uri = URI.joinPath(workspaceRoot, 'notebook #1.ipynb').with({
			scheme: Schemas.vscodeNotebookCell,
			fragment: 'ch000001',
		});
		const document = DocumentId.create(uri.toString());
		const uniquePath = toUniquePath(document, workspaceRoot.path);

		expect({
			uniquePath,
			document: resolveUniquePath(uniquePath, workspaceRoot).unwrap(),
		}).toEqual({ uniquePath: 'notebook%20%231.ipynb#ch000001', document });
	});

	it('round-trips escaped notebook fragments', () => {
		const uri = URI.joinPath(workspaceRoot, 'notebook.ipynb').with({
			scheme: Schemas.vscodeNotebookCell,
			fragment: 'cell #1%',
		});
		const document = DocumentId.create(uri.toString());
		const uniquePath = toUniquePath(document, workspaceRoot.path);

		expect({
			uniquePath,
			document: resolveUniquePath(uniquePath, workspaceRoot).unwrap(),
		}).toEqual({ uniquePath: 'notebook.ipynb#cell%20%231%25', document });
	});

	it.each(['', 'file%.cs', 'file%2.cs', 'file%GG.cs', 'file%FF.cs', 'notebook.ipynb#cell%'])('rejects invalid path token %j', path => {
		expect(resolveUniquePath(path, workspaceRoot).isError()).toBe(true);
	});

	it('rejects a relative path without a workspace', () => {
		expect(resolveUniquePath('space%20folder/file.cs', undefined).isError()).toBe(true);
	});
});
