/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { EditIntent } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { NoNextEditReason, StreamedEdit } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { ILogger } from '../../../../platform/log/common/logService';
import { AsyncIterUtils } from '../../../../util/common/asyncIterableUtils';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { FetchStreamError } from '../../common/fetchStreamError';
import { EditIntentParseMode } from '../../node/editIntent';
import {
	handleCodeBlock,
	handleEditWindowOnly,
	handleEditWindowWithEditIntent,
	handleUnifiedWithXml,
	ResponseParseResult,
	UnifiedXmlInsertContext,
} from '../../node/responseFormatHandlers';

// ============================================================================
// Helpers
// ============================================================================

function createMockLogger(): ILogger {
	return {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		critical: vi.fn(),
		flush: vi.fn(),
		createSubLogger: () => createMockLogger(),
		withContext: () => createMockLogger(),
	} as unknown as ILogger;
}

function makeInsertContext(overrides?: Partial<UnifiedXmlInsertContext>): UnifiedXmlInsertContext {
	return {
		editWindowLines: ['line0', 'cursor_line', 'line2'],
		editWindowLineRange: new OffsetRange(10, 13),
		cursorOriginalLinesOffset: 1,
		cursorColumnZeroBased: 6,
		editWindow: new OffsetRange(0, 100),
		originalEditWindow: undefined,
		targetDocument: DocumentId.create('file:///test.ts'),
		isFromCursorJump: false,
		...overrides,
	};
}

function makeDocBeforeEdits(): StringText {
	return new StringText('line0\ncursor_line\nline2');
}

async function collectLines(iter: AsyncIterable<string>): Promise<string[]> {
	return AsyncIterUtils.toArray(iter);
}

/**
 * Creates an async iterable that yields `items` and then throws `error`.
 */
async function* asyncIterableWithError(items: string[], error: Error): AsyncGenerator<string> {
	for (const item of items) {
		yield item;
	}
	throw error;
}

async function consumeDirectEdits(
	stream: AsyncGenerator<StreamedEdit, NoNextEditReason, void>,
): Promise<{ edits: StreamedEdit[]; returnValue: NoNextEditReason }> {
	const edits: StreamedEdit[] = [];
	for (; ;) {
		const result = await stream.next();
		if (result.done) {
			return { edits, returnValue: result.value };
		}
		edits.push(result.value);
	}
}

// ============================================================================
// handleEditWindowOnly
// ============================================================================

describe('handleEditWindowOnly', () => {
	it('passes lines through unchanged', async () => {
		const input = ['line1', 'line2', 'line3'];
		const result = handleEditWindowOnly(AsyncIterUtils.fromArray(input));

		expect(result).toBeInstanceOf(ResponseParseResult.EditWindowLines);
		expect(await collectLines(result.lines)).toEqual(input);
		expect(result.editIntentMetadata).toBeUndefined();
	});

	it('handles empty stream', async () => {
		const result = handleEditWindowOnly(AsyncIterUtils.fromArray([]));
		expect(await collectLines(result.lines)).toEqual([]);
	});
});

// ============================================================================
// handleCodeBlock
// ============================================================================

describe('handleCodeBlock', () => {
	it('strips opening and closing backtick fences', async () => {
		const input = ['```typescript', 'const x = 1;', 'const y = 2;', '```'];
		const result = handleCodeBlock(AsyncIterUtils.fromArray(input));

		expect(result).toBeInstanceOf(ResponseParseResult.EditWindowLines);
		expect(await collectLines(result.lines)).toEqual(['const x = 1;', 'const y = 2;']);
	});

	it('passes through when no backticks', async () => {
		const input = ['const x = 1;', 'const y = 2;'];
		const result = handleCodeBlock(AsyncIterUtils.fromArray(input));

		expect(await collectLines(result.lines)).toEqual(input);
	});

	it('handles empty stream', async () => {
		const result = handleCodeBlock(AsyncIterUtils.fromArray([]));
		expect(await collectLines(result.lines)).toEqual([]);
	});
});

// ============================================================================
// handleEditWindowWithEditIntent
// ============================================================================

describe('handleEditWindowWithEditIntent', () => {
	it('parses tag-based intent and returns EditWindowLines with metadata', async () => {
		const input = ['<|edit_intent|>high<|/edit_intent|>', 'line1', 'line2'];
		const result = await handleEditWindowWithEditIntent(
			AsyncIterUtils.fromArray(input),
			createMockLogger(),
			EditIntentParseMode.Tags,
		);

		expect(result).toBeInstanceOf(ResponseParseResult.EditWindowLines);
		const ewl = result as ResponseParseResult.EditWindowLines;
		expect(ewl.editIntentMetadata?.intent).toBe(EditIntent.High);
		expect(ewl.editIntentMetadata?.parseError).toBeUndefined();
		expect(await collectLines(ewl.lines)).toEqual(['line1', 'line2']);
	});

	it('parses short-name intent', async () => {
		const input = ['L', 'line1'];
		const result = await handleEditWindowWithEditIntent(
			AsyncIterUtils.fromArray(input),
			createMockLogger(),
			EditIntentParseMode.ShortName,
		);

		expect(result).toBeInstanceOf(ResponseParseResult.EditWindowLines);
		const ewl = result as ResponseParseResult.EditWindowLines;
		expect(ewl.editIntentMetadata?.intent).toBe(EditIntent.Low);
	});

	it('propagates FetchStreamError through the remaining line stream', async () => {
		const failureReason = new NoNextEditReason.GotCancelled('test');
		const result = await handleEditWindowWithEditIntent(
			asyncIterableWithError(
				['<|edit_intent|>high<|/edit_intent|>', 'line1'],
				new FetchStreamError(failureReason),
			),
			createMockLogger(),
			EditIntentParseMode.Tags,
		);

		expect(result).toBeInstanceOf(ResponseParseResult.EditWindowLines);
		const ewl = result as ResponseParseResult.EditWindowLines;
		await expect(collectLines(ewl.lines)).rejects.toThrow(FetchStreamError);
	});

	it('returns EditWindowLines with parseError on malformed intent', async () => {
		const input = ['no intent here', 'line1'];
		const result = await handleEditWindowWithEditIntent(
			AsyncIterUtils.fromArray(input),
			createMockLogger(),
			EditIntentParseMode.Tags,
		);

		expect(result).toBeInstanceOf(ResponseParseResult.EditWindowLines);
		const ewl = result as ResponseParseResult.EditWindowLines;
		expect(ewl.editIntentMetadata?.parseError).toBeDefined();
		// Default to High on parse error — first line is re-emitted as content
		expect(ewl.editIntentMetadata?.intent).toBe(EditIntent.High);
		expect(await collectLines(ewl.lines)).toEqual(['no intent here', 'line1']);
	});
});

// ============================================================================
// handleUnifiedWithXml
// ============================================================================

describe('handleUnifiedWithXml', () => {
	it('<NO_CHANGE> returns Done(NoSuggestions)', async () => {
		const result = await handleUnifiedWithXml(
			AsyncIterUtils.fromArray(['<NO_CHANGE>']),
			makeInsertContext(),
			makeDocBeforeEdits(),
			createMockLogger(),
		);

		expect(result).toBeInstanceOf(ResponseParseResult.Done);
		expect((result as ResponseParseResult.Done).reason).toBeInstanceOf(NoNextEditReason.NoSuggestions);
	});

	it('empty response returns Done(NoSuggestions)', async () => {
		const result = await handleUnifiedWithXml(
			AsyncIterUtils.fromArray([]),
			makeInsertContext(),
			makeDocBeforeEdits(),
			createMockLogger(),
		);

		expect(result).toBeInstanceOf(ResponseParseResult.Done);
		expect((result as ResponseParseResult.Done).reason).toBeInstanceOf(NoNextEditReason.NoSuggestions);
	});

	it('unknown tag returns Done(Unexpected)', async () => {
		const result = await handleUnifiedWithXml(
			AsyncIterUtils.fromArray(['<UNKNOWN_TAG>']),
			makeInsertContext(),
			makeDocBeforeEdits(),
			createMockLogger(),
		);

		expect(result).toBeInstanceOf(ResponseParseResult.Done);
		expect((result as ResponseParseResult.Done).reason).toBeInstanceOf(NoNextEditReason.Unexpected);
	});

	it('FetchStreamError on first line read rejects handleUnifiedWithXml', async () => {
		const failureReason = new NoNextEditReason.GotCancelled('test');
		await expect(handleUnifiedWithXml(
			asyncIterableWithError([], new FetchStreamError(failureReason)),
			makeInsertContext(),
			makeDocBeforeEdits(),
			createMockLogger(),
		)).rejects.toThrow(FetchStreamError);
	});

	describe('<EDIT>', () => {
		it('returns EditWindowLines with correct lines, stops at </EDIT>', async () => {
			const result = await handleUnifiedWithXml(
				AsyncIterUtils.fromArray(['<EDIT>', 'edited_line0', 'edited_cursor_line', 'edited_line2', '</EDIT>']),
				makeInsertContext(),
				makeDocBeforeEdits(),
				createMockLogger(),
			);

			expect(result).toBeInstanceOf(ResponseParseResult.EditWindowLines);
			const ewl = result as ResponseParseResult.EditWindowLines;
			expect(await collectLines(ewl.lines)).toEqual(['edited_line0', 'edited_cursor_line', 'edited_line2']);
		});

		it('handles stream ending without </EDIT> tag', async () => {
			const result = await handleUnifiedWithXml(
				AsyncIterUtils.fromArray(['<EDIT>', 'line1', 'line2']),
				makeInsertContext(),
				makeDocBeforeEdits(),
				createMockLogger(),
			);

			expect(result).toBeInstanceOf(ResponseParseResult.EditWindowLines);
			const ewl = result as ResponseParseResult.EditWindowLines;
			expect(await collectLines(ewl.lines)).toEqual(['line1', 'line2']);
		});

		it('stream error terminates edit lines mid-stream', async () => {
			const failureReason = new NoNextEditReason.GotCancelled('test');

			const result = await handleUnifiedWithXml(
				asyncIterableWithError(
					['<EDIT>', 'line1'],
					new FetchStreamError(failureReason),
				),
				makeInsertContext(),
				makeDocBeforeEdits(),
				createMockLogger(),
			);

			expect(result).toBeInstanceOf(ResponseParseResult.EditWindowLines);
			const ewl = result as ResponseParseResult.EditWindowLines;
			await expect(collectLines(ewl.lines)).rejects.toThrow(FetchStreamError);
		});
	});

	describe('<INSERT>', () => {
		it('returns DirectEdits yielding correct edits', async () => {
			const ctx = makeInsertContext();
			const result = await handleUnifiedWithXml(
				AsyncIterUtils.fromArray(['<INSERT>', 'inserted_text', '</INSERT>']),
				ctx,
				makeDocBeforeEdits(),
				createMockLogger(),
			);

			expect(result).toBeInstanceOf(ResponseParseResult.DirectEdits);
			const { edits, returnValue } = await consumeDirectEdits((result as ResponseParseResult.DirectEdits).stream);

			// First edit: cursor line replacement with inserted text spliced in
			// cursor_line with cursorColumnZeroBased=6: 'cursor' + 'inserted_text' + '_line'
			expect(edits.length).toBeGreaterThanOrEqual(1);
			expect(edits[0].edit.newLines).toEqual(['cursorinserted_text_line']);

			// Second edit: empty insertion (no additional lines between INSERT tags)
			expect(edits[1].edit.newLines).toEqual([]);

			expect(returnValue).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('returns DirectEdits with multi-line insert', async () => {
			const ctx = makeInsertContext();
			const result = await handleUnifiedWithXml(
				AsyncIterUtils.fromArray(['<INSERT>', 'first', 'second', 'third', '</INSERT>']),
				ctx,
				makeDocBeforeEdits(),
				createMockLogger(),
			);

			expect(result).toBeInstanceOf(ResponseParseResult.DirectEdits);
			const { edits } = await consumeDirectEdits((result as ResponseParseResult.DirectEdits).stream);

			expect(edits).toHaveLength(2);
			// First edit splices 'first' into cursor line: 'cursor' + 'first' + '_line'
			expect(edits[0].edit.newLines).toEqual(['cursorfirst_line']);
			// Second edit inserts remaining lines
			expect(edits[1].edit.newLines).toEqual(['second', 'third']);
		});

		it('returns NoSuggestions when INSERT is immediately closed', async () => {
			const result = await handleUnifiedWithXml(
				AsyncIterUtils.fromArray(['<INSERT>', '</INSERT>']),
				makeInsertContext(),
				makeDocBeforeEdits(),
				createMockLogger(),
			);

			expect(result).toBeInstanceOf(ResponseParseResult.DirectEdits);
			const { edits, returnValue } = await consumeDirectEdits((result as ResponseParseResult.DirectEdits).stream);
			expect(edits).toHaveLength(0);
			expect(returnValue).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('stream error propagates through direct edits', async () => {
			const failureReason = new NoNextEditReason.GotCancelled('test');

			const result = await handleUnifiedWithXml(
				asyncIterableWithError(
					['<INSERT>', 'inserted_text'],
					new FetchStreamError(failureReason),
				),
				makeInsertContext(),
				makeDocBeforeEdits(),
				createMockLogger(),
			);

			expect(result).toBeInstanceOf(ResponseParseResult.DirectEdits);
			// The stream should throw FetchStreamError when trying to read after the second item
			await expect(consumeDirectEdits((result as ResponseParseResult.DirectEdits).stream)).rejects.toThrow(FetchStreamError);
		});
	});
});
