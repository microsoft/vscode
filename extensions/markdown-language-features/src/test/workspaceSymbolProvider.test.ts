/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import MDDocumentSymbolProvider from '../features/documentSymbolProvider';
import MarkdownWorkspaceSymbolProvider, { WorkspaceMarkdownDocumentProvider } from '../features/workspaceSymbolProvider';
import { createNewMarkdownEngine } from './engine';


suite('markdown.WorkspaceSymbolProvider', () => {
	test('Should not return anything for empty workspace', async () => {
		const provider = new MarkdownWorkspaceSymbolProvider(new MDDocumentSymbolProvider(createNewMarkdownEngine()), new class implements WorkspaceMarkdownDocumentProvider {
			async getAllMarkdownDocuments() {
				return [];
			}
		});

		assert.deepEqual(await provider.provideWorkspaceSymbols(''), []);
	});
});
