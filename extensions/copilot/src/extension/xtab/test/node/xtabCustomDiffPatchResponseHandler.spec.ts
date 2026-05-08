/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { NoNextEditReason, StreamedEdit } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { AsyncIterUtils } from '../../../../util/common/asyncIterableUtils';
import { AsyncIterableSource } from '../../../../util/vs/base/common/async';
import { Position } from '../../../../util/vs/editor/common/core/position';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { ensureDependenciesAreSet } from '../../../../util/vs/editor/common/core/text/positionToOffset';
import { FetchStreamError } from '../../common/fetchStreamError';
import { CurrentDocument } from '../../common/xtabCurrentDocument';
import { XtabCustomDiffPatchResponseHandler } from '../../node/xtabCustomDiffPatchResponseHandler';

async function consumeHandleResponse(
	...args: Parameters<typeof XtabCustomDiffPatchResponseHandler.handleResponse>
): Promise<{ edits: StreamedEdit[]; returnValue: NoNextEditReason }> {
	const gen = XtabCustomDiffPatchResponseHandler.handleResponse(...args);
	const edits: StreamedEdit[] = [];
	for (; ;) {
		const result = await gen.next();
		if (result.done) {
			return { edits, returnValue: result.value };
		}
		edits.push(result.value);
	}
}

describe('XtabCustomDiffPatchResponseHandler', () => {

	beforeEach(() => {
		ensureDependenciesAreSet();
	});

	async function collectPatches(patchText: string): Promise<string> {
		const linesStream = AsyncIterUtils.fromArray(patchText.split('\n'));
		const patches = await AsyncIterUtils.toArray(XtabCustomDiffPatchResponseHandler.extractEdits(linesStream));
		return patches.map(p => p.toString()).join('\n');
	}

	it('should parse a simple patch correctly', async () => {
		const patchText = `file1.txt:10
-Old line 1
-Old line 2
+New line 1
+New line 2`;
		const patches = await collectPatches(patchText);
		expect(patches).toEqual(patchText);
	});

	it('should parse a simple patch correctly despite trailing newline', async () => {
		const patchText = `file1.txt:10
-Old line 1
-Old line 2
+New line 1
+New line 2
`;
		const patches = await collectPatches(patchText);
		expect(patches).toEqual(patchText.trim());
	});

	it('should parse a simple patch correctly', async () => {
		const patchText = `/absolutePath/to/my_file.ts:1
-Old line 1
+New line 1
+New line 2
relative/path/to/another_file.js:42
-Removed line
+Added line`;
		const patches = await collectPatches(patchText);
		expect(patches).toEqual(patchText);
	});

	it('discard a patch if no valid header', async () => {
		const patchText = `myFile.ts:
+New line 1
+New line 2
another_file.js:32
-Removed line
+Added line`;
		const patches = await collectPatches(patchText);
		expect(patches).toMatchInlineSnapshot(`
			"another_file.js:32
			-Removed line
			+Added line"
		`);
	});

	it('discard a patch if no valid header - 2', async () => {
		const patchText = `myFile.ts:42
+New line 1
+New line 2
another_file.js:
-Removed line
+Added line`;
		const patches = await collectPatches(patchText);
		expect(patches).toMatchInlineSnapshot(`
			"myFile.ts:42
			+New line 1
			+New line 2"
		`);
	});

	it('discard a patch has no removed lines', async () => {
		const patchText = `myFile.ts:42
+New line 1
+New line 2`;
		const patches = await collectPatches(patchText);
		expect(patches).toMatchInlineSnapshot(`
			"myFile.ts:42
			+New line 1
			+New line 2"
		`);
	});

	it('discard a patch has no new lines', async () => {
		const patchText = `myFile.ts:42
-Old line 1
-Old line 2`;
		const patches = await collectPatches(patchText);
		expect(patches).toMatchInlineSnapshot(`
			"myFile.ts:42
			-Old line 1
			-Old line 2"
		`);
	});

	it('no-op diff', async () => {
		const patchText = `myFile.ts:42
-Old line 1
+Old line 1`;
		const patches = await collectPatches(patchText);
		expect(patches).toMatchInlineSnapshot(`
			"myFile.ts:42
			-Old line 1
			+Old line 1"
		`);
	});

	it('stops yielding edits when stream rejects with FetchStreamError', async () => {
		const cancellationReason = new NoNextEditReason.GotCancelled('afterFetchCall');
		const docId = DocumentId.create('file:///file.ts');
		const documentBeforeEdits = new CurrentDocument(new StringText('old\n'), new Position(1, 1));

		// Emit the first patch completely, then reject with FetchStreamError
		async function* makeStream(): AsyncGenerator<string> {
			yield '/file.ts:0';
			yield '-old';
			yield '+new';
			yield '/file.ts:5';
			yield '-another old';
			yield '+another new';
			throw new FetchStreamError(cancellationReason);
		}

		const { edits, returnValue } = await consumeHandleResponse(
			makeStream(),
			documentBeforeEdits,
			docId,
			undefined,
			undefined,
			new TestLogService(),
		);

		expect(edits).toHaveLength(1);
		expect(returnValue).toEqual(cancellationReason);
	});

	it('returns FetchStreamError reason when stream rejects before any patches', async () => {
		const cancellationReason = new NoNextEditReason.GotCancelled('afterFetchCall');
		const docId = DocumentId.create('file:///file.ts');
		const documentBeforeEdits = new CurrentDocument(new StringText('old\n'), new Position(1, 1));

		const source = new AsyncIterableSource<string>();
		source.reject(new FetchStreamError(cancellationReason));

		const { edits, returnValue } = await consumeHandleResponse(
			source.asyncIterable,
			documentBeforeEdits,
			docId,
			undefined,
			undefined,
			new TestLogService(),
		);

		expect(edits).toHaveLength(0);
		expect(returnValue).toBe(cancellationReason);
	});
});
