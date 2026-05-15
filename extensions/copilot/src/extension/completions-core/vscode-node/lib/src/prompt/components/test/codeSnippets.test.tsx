/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../../prompt/jsx-runtime/ */

import { CompletionRequestData } from '../../completionsPromptFactory/componentsCompletionsPromptFactory';
import { CodeSnippetWithId } from '../../contextProviders/contextItemSchemas';
import { CodeSnippets } from '../codeSnippets';

import * as assert from 'assert';
import dedent from 'ts-dedent';
import { CancellationTokenSource } from 'vscode-languageserver-protocol';
import { ServicesAccessor } from '../../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { PromptSnapshotNode } from '../../../../../prompt/src/components/components';
import { VirtualPrompt } from '../../../../../prompt/src/components/virtualPrompt';
import { extractNodesWitPath } from '../../../../../prompt/src/test/components/testHelpers';
import { TelemetryWithExp } from '../../../telemetry';
import { createLibTestingContext } from '../../../test/context';
import { querySnapshot } from '../../../test/snapshot';
import { createTextDocument, TestTextDocumentManager } from '../../../test/textDocument';
import { ICompletionsTextDocumentManagerService } from '../../../textDocumentManager';

suite('Code Snippets Component', function () {
	let accessor: ServicesAccessor;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
	});

	test('Renders nothing if there are no code snippets', async function () {
		try {
			const snapshot = await renderCodeSnippets(accessor);
			querySnapshot(snapshot.snapshot!, 'CodeSnippets');
		} catch (e) {
			assert.ok((e as Error).message.startsWith('No children found at path segment '));
		}
	});

	test('Renders nothing if the code snippets array is empty', async function () {
		try {
			const snapshot = await renderCodeSnippets(accessor, []);
			querySnapshot(snapshot.snapshot!, 'CodeSnippets');
		} catch (e) {
			assert.ok((e as Error).message.startsWith('No children found at path segment '));
		}
	});

	test('Renders a single code snippet', async function () {
		const codeSnippets: CodeSnippetWithId[] = [
			{
				uri: 'file:///path/something.ts',
				value: dedent`
					function foo() {
						return 1;
					}
				`,
				id: '1',
				type: 'CodeSnippet',
			},
		];

		const snapshot = await renderCodeSnippets(accessor, codeSnippets);

		const chunks = querySnapshot(snapshot.snapshot!, 'CodeSnippets[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(chunks.length, 1);
		const chunk = querySnapshot(snapshot.snapshot!, 'CodeSnippets[0].Chunk[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(chunk.length, 2);
		assert.deepStrictEqual(chunk[1].props?.key, '1');
		assert.deepStrictEqual(chunk[1].props?.source, codeSnippets[0]);
		// Assert content
		assert.deepStrictEqual(
			querySnapshot(snapshot.snapshot!, 'CodeSnippets[0].Chunk[0].Text'),
			'Compare this snippet from something.ts:'
		);
		assert.deepStrictEqual(
			querySnapshot(snapshot.snapshot!, 'CodeSnippets[0].Chunk["1"].Text'),
			'function foo() {\n\treturn 1;\n}'
		);
	});

	test('Renders snippet from subfolder', async function () {
		const codeSnippets: CodeSnippetWithId[] = [
			{
				uri: 'file:///c%3A/root/same.ts',
				value: dedent`
					function bar() {
						return 1;
					}
				`,
				id: '1',
				type: 'CodeSnippet',
			},
			{
				uri: 'file:///c%3A/root/subfolder/something.ts',
				value: dedent`
					function foo() {
						return 1;
					}
				`,
				id: '2',
				type: 'CodeSnippet',
			},
		];

		const tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		tdm.init([{ uri: 'file:///c:/root' }]);

		const snapshot = await renderCodeSnippets(accessor, codeSnippets);
		const chunks = querySnapshot(snapshot.snapshot!, 'CodeSnippets[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(chunks.length, 2);

		const firstChunk = querySnapshot(snapshot.snapshot!, 'CodeSnippets[0].Chunk[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(firstChunk.length, 2);
		assert.deepStrictEqual(firstChunk[0].children?.[0].value, 'Compare this snippet from subfolder/something.ts:');
		assert.deepStrictEqual(firstChunk[1].props?.key, '2');
		assert.deepStrictEqual(firstChunk[1].props?.source, codeSnippets[1]);

		const secondChunk = querySnapshot(snapshot.snapshot!, 'CodeSnippets[1].Chunk[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(secondChunk.length, 2);
		assert.deepStrictEqual(secondChunk[0].children?.[0].value, 'Compare this snippet from same.ts:');
		assert.deepStrictEqual(secondChunk[1].props?.key, '1');
		assert.deepStrictEqual(secondChunk[1].props?.source, codeSnippets[0]);
	});

	test('Renders multiple code snippets', async function () {
		const codeSnippets: CodeSnippetWithId[] = [
			{
				uri: 'file:///something.ts',
				value: dedent`
					function foo() {
						return 1;
					}
				`,
				id: '1',
				type: 'CodeSnippet',
			},
			{
				uri: 'file:///somethingElse.ts',
				value: dedent`
					function bar() {
						return 'two';
					}
				`,
				id: '2',
				type: 'CodeSnippet',
			},
		];

		const snapshot = await renderCodeSnippets(accessor, codeSnippets);

		const snippets = querySnapshot(snapshot.snapshot!, 'CodeSnippets[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(snippets.length, 2);

		const firstChunk = querySnapshot(snapshot.snapshot!, 'CodeSnippets[0].Chunk[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(firstChunk[0].children?.[0].value, 'Compare this snippet from somethingElse.ts:');
		assert.deepStrictEqual(firstChunk[1].props?.key, '2');
		assert.deepStrictEqual(firstChunk[1].props?.source, codeSnippets[1]);

		const secondChunk = querySnapshot(snapshot.snapshot!, 'CodeSnippets[1].Chunk[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(secondChunk[0].children?.[0].value, 'Compare this snippet from something.ts:');
		assert.deepStrictEqual(secondChunk[1].props?.key, '1');
		assert.deepStrictEqual(secondChunk[1].props?.source, codeSnippets[0]);
	});

	test('Merges together snippets with the same URI', async function () {
		const codeSnippets: CodeSnippetWithId[] = [
			{
				uri: 'file:///something.ts',
				value: dedent`
					function foo() {
						return 1;
					}
				`,
				id: '1',
				type: 'CodeSnippet',
			},
			{
				uri: 'file:///something.ts',
				value: dedent`
					function bar() {
						return 'two';
					}
				`,
				id: '2',
				type: 'CodeSnippet',
			},
		];

		const snapshot = await renderCodeSnippets(accessor, codeSnippets);
		const result = querySnapshot(snapshot.snapshot!, 'CodeSnippets[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(result.length, 1);

		const chunk = querySnapshot(snapshot.snapshot!, 'CodeSnippets[0].Chunk[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(chunk.length, 4);
		assert.deepStrictEqual(chunk[0].children?.[0].value, 'Compare these snippets from something.ts:');
		assert.deepStrictEqual(chunk[1].props?.key, '1');
		assert.deepStrictEqual(chunk[1].props?.source, codeSnippets[0]);
		assert.deepStrictEqual(chunk[2].children?.[0].value, '---');
		assert.deepStrictEqual(chunk[3].props?.key, '2');
		assert.deepStrictEqual(chunk[3].props?.source, codeSnippets[1]);
	});

	test('Sorts snippets by ascending score of importance', async function () {
		const codeSnippets: CodeSnippetWithId[] = [
			{
				uri: 'file:///something.ts',
				value: dedent`
					function foo() {
						return 1;
					}
				`,
				importance: 10,
				id: '1',
				type: 'CodeSnippet',
			},
			{
				uri: 'file:///something.ts',
				value: dedent`
					function bar() {
						return 'two';
					}
				`,
				importance: 5,
				id: '2',
				type: 'CodeSnippet',
			},
			{
				uri: 'file:///somethingElse.ts',
				value: dedent`
					function baz() {
						return 'three';
					}
				`,
				importance: 7,
				id: '3',
				type: 'CodeSnippet',
			},
		];

		const snapshot = await renderCodeSnippets(accessor, codeSnippets);

		const result = querySnapshot(snapshot.snapshot!, 'CodeSnippets[*]') as PromptSnapshotNode[];
		assert.deepStrictEqual(result.length, 2);

		assert.deepStrictEqual(extractNodesWitPath(snapshot.snapshot!), [
			'$[0].CodeSnippets',
			'$[0].CodeSnippets[0].Chunk',
			'$[0].CodeSnippets[0].Chunk[0].Text',
			'$[0].CodeSnippets[0].Chunk[0].Text[0]',
			'$[0].CodeSnippets[0].Chunk["3"].Text',
			'$[0].CodeSnippets[0].Chunk["3"].Text[0]',
			'$[0].CodeSnippets[1].Chunk',
			'$[0].CodeSnippets[1].Chunk[0].Text',
			'$[0].CodeSnippets[1].Chunk[0].Text[0]',
			'$[0].CodeSnippets[1].Chunk["1"].Text',
			'$[0].CodeSnippets[1].Chunk["1"].Text[0]',
			'$[0].CodeSnippets[1].Chunk[2].Text',
			'$[0].CodeSnippets[1].Chunk[2].Text[0]',
			'$[0].CodeSnippets[1].Chunk["2"].Text',
			'$[0].CodeSnippets[1].Chunk["2"].Text[0]',
		]);
	});
});

async function renderCodeSnippets(accessor: ServicesAccessor, codeSnippets?: CodeSnippetWithId[]) {
	const document = createTextDocument(
		'file:///path/foo.ts',
		'typescript',
		0,
		dedent`
		const a = 1;
		function f|
		const b = 2;
	`
	);
	const position = document.positionAt(document.getText().indexOf('|'));

	const tdms = accessor.get(ICompletionsTextDocumentManagerService);
	const virtualPrompt = new VirtualPrompt(<CodeSnippets tdms={tdms} />);
	const pipe = virtualPrompt.createPipe();

	const completionRequestData: CompletionRequestData = {
		document,
		position,
		telemetryData: TelemetryWithExp.createEmptyConfigForTesting(),
		cancellationToken: new CancellationTokenSource().token,
		maxPromptTokens: 1000,
		data: undefined,
		codeSnippets,
	};

	await pipe.pump(completionRequestData);
	return virtualPrompt.snapshot();
}
