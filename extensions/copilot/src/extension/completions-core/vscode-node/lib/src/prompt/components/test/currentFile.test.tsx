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
import { CurrentFile } from '../../../prompt/components/currentFile';
import { createCompletionRequestData } from '../../../test/completionsPrompt';
import { createLibTestingContext } from '../../../test/context';
import { querySnapshot } from '../../../test/snapshot';
import { createTextDocument } from '../../../test/textDocument';

suite('Completions Prompt Renderer', function () {
	let accessor: ServicesAccessor;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
	});

	test('uses full before cursor if within limit', async function () {
		const snapshot = await createSnapshot(1000);

		const value = querySnapshot(snapshot.snapshot!, 'CurrentFile[0].f[0].BeforeCursor[0].Text') as string;
		assert.deepStrictEqual(value, 'const a = 1;\nfunction f');
	});

	test('trims before cursor if exceeding limit', async function () {
		const snapshot = await createSnapshot(2);

		const value = querySnapshot(snapshot.snapshot!, 'CurrentFile[0].f[0].BeforeCursor[0].Text') as string;
		assert.deepStrictEqual(value, 'nction f');
	});

	test('uses full after cursor if within limit', async function () {
		const snapshot = await createSnapshot(1000);

		const value = querySnapshot(snapshot.snapshot!, 'CurrentFile[0].f[1].AfterCursor[0].Text') as string;
		assert.deepStrictEqual(value, 'const b = 2;');
	});

	test('trims after cursor if exceeding limit', async function () {
		const snapshot = await createSnapshot(2);

		const value = querySnapshot(snapshot.snapshot!, 'CurrentFile[0].f[1].AfterCursor[0].Text') as string;
		assert.deepStrictEqual(value, 'const ');
	});

	const createSnapshot = async (maxPromptTokens: number) => {
		const textDocument = createTextDocument(
			'file:///path/basename',
			'typescript',
			0,
			dedent`
				const a = 1;
				function f|
				const b = 2;
			`
		);
		const position = textDocument.positionAt(textDocument.getText().indexOf('|'));
		const virtualPrompt = new VirtualPrompt(<CurrentFile />);
		const pipe = virtualPrompt.createPipe();
		const data = createCompletionRequestData(
			accessor,
			textDocument,
			position,
			undefined,
			undefined,
			false,
			undefined,
			maxPromptTokens
		);

		await pipe.pump(data);

		return virtualPrompt.snapshot();
	};
});
