/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../../prompt/jsx-runtime/ */

import * as assert from 'assert';
import dedent from 'ts-dedent';
import { ServicesAccessor } from '../../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { VirtualPrompt } from '../../../../../prompt/src/components/virtualPrompt';
import { DocumentMarker } from '../../../prompt/components/marker';
import { createCompletionRequestData } from '../../../test/completionsPrompt';
import { createLibTestingContext } from '../../../test/context';
import { querySnapshot } from '../../../test/snapshot';
import { createTextDocument, InMemoryNotebookDocument, TestTextDocumentManager } from '../../../test/textDocument';
import { ICompletionsTextDocumentManagerService } from '../../../textDocumentManager';

suite('Document Marker', function () {
	let accessor: ServicesAccessor;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
	});

	test('creates path with relative path', async function () {
		const marker = await renderMarker(accessor, 'file:///path/basename');

		assert.deepStrictEqual(marker, 'Path: basename');
	});

	test('creates language marker with untitled document', async function () {
		const marker = await renderMarker(accessor, 'untitled:uri');

		assert.deepStrictEqual(marker, 'Language: typescript');
	});

	test('creates language marker with relative path present but type is notebook', async function () {
		const textDocument = createTextDocument('vscode-notebook:///mynotebook.ipynb', 'typescript', 0, '');
		(accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager).setNotebookDocument(
			textDocument,
			new InMemoryNotebookDocument([])
		);
		const marker = await renderMarker(accessor, textDocument.uri);

		assert.deepStrictEqual(marker, 'Language: typescript');
	});

	async function renderMarker(accessor: ServicesAccessor, uri: string) {
		const textDocument = createTextDocument(
			uri,
			'typescript',
			0,
			dedent`
				const a = 1;
				function f|
				const b = 2;
			`
		);
		const tdms = accessor.get(ICompletionsTextDocumentManagerService);
		const position = textDocument.positionAt(textDocument.getText().indexOf('|'));
		const virtualPrompt = new VirtualPrompt(<DocumentMarker tdms={tdms} />);
		const pipe = virtualPrompt.createPipe();
		await pipe.pump(createCompletionRequestData(accessor, textDocument, position));
		const snapshot = virtualPrompt.snapshot();
		return querySnapshot(snapshot.snapshot!, 'DocumentMarker.*.Text');
	}
});
