/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import * as xtabPromptOptions from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { NoNextEditReason, StreamedEdit } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { ILogger } from '../../../platform/log/common/logService';
import { LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { LineRange } from '../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { ResponseTags } from '../common/tags';
import { EditIntentParseMode, parseEditIntentFromStream } from './editIntent';
import { linesWithBackticksRemoved } from './xtabUtils';

// ============================================================================
// Result type
// ============================================================================

export namespace ResponseParseResult {

	export interface EditIntentMetadata {
		readonly intent: xtabPromptOptions.EditIntent;
		readonly parseError?: string;
	}

	/**
	 * The response contains edit-window lines to be fed into *ResponseProcessor.diff*.
	 */
	export class EditWindowLines {
		constructor(
			readonly lines: AsyncIterable<string>,
			readonly editIntentMetadata?: EditIntentMetadata,
		) { }
	}

	/**
	 * The handler has finished — no more processing needed. Carries a {@link NoNextEditReason}.
	 */
	export class Done {
		constructor(readonly reason: NoNextEditReason) { }
	}

	/**
	 * The handler yields edits directly (e.g. INSERT or CustomDiffPatch).
	 * The coordinator should `yield*` the stream.
	 */
	export class DirectEdits {
		constructor(readonly stream: AsyncGenerator<StreamedEdit, NoNextEditReason, void>) { }
	}

	export type t = EditWindowLines | Done | DirectEdits;
}

// ============================================================================
// Handler: EditWindowOnly
// ============================================================================

export function handleEditWindowOnly(linesStream: AsyncIterable<string>): ResponseParseResult.EditWindowLines {
	return new ResponseParseResult.EditWindowLines(linesStream);
}

// ============================================================================
// Handler: CodeBlock
// ============================================================================

export function handleCodeBlock(linesStream: AsyncIterable<string>): ResponseParseResult.EditWindowLines {
	return new ResponseParseResult.EditWindowLines(linesWithBackticksRemoved(linesStream));
}

// ============================================================================
// Handler: EditWindowWithEditIntent / EditWindowWithEditIntentShort
// ============================================================================

export async function handleEditWindowWithEditIntent(
	linesStream: AsyncIterable<string>,
	tracer: ILogger,
	parseMode: EditIntentParseMode,
): Promise<ResponseParseResult.EditWindowLines | ResponseParseResult.Done> {
	const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, tracer, parseMode);

	return new ResponseParseResult.EditWindowLines(
		remainingLinesStream,
		{ intent: editIntent, parseError },
	);
}

// ============================================================================
// Handler: UnifiedWithXml
// ============================================================================

export interface UnifiedXmlInsertContext {
	readonly editWindowLines: string[];
	readonly editWindowLineRange: OffsetRange;
	readonly cursorOriginalLinesOffset: number;
	readonly cursorColumnZeroBased: number;
	readonly editWindow: OffsetRange;
	readonly originalEditWindow: OffsetRange | undefined;
	readonly targetDocument: DocumentId;
	readonly isFromCursorJump: boolean;
}

export async function handleUnifiedWithXml(
	linesStream: AsyncIterable<string>,
	ctx: UnifiedXmlInsertContext,
	documentBeforeEdits: StringText,
	tracer: ILogger,
): Promise<ResponseParseResult.t> {
	const linesIter = linesStream[Symbol.asyncIterator]();
	const firstLine = await linesIter.next();

	if (firstLine.done) {
		return new ResponseParseResult.Done(
			new NoNextEditReason.NoSuggestions(documentBeforeEdits, ctx.editWindow),
		);
	}

	const trimmedFirstLine = firstLine.value.trim();

	if (trimmedFirstLine === ResponseTags.NO_CHANGE.start) {
		return new ResponseParseResult.Done(
			new NoNextEditReason.NoSuggestions(documentBeforeEdits, ctx.editWindow),
		);
	}

	if (trimmedFirstLine === ResponseTags.INSERT.start) {
		return new ResponseParseResult.DirectEdits(
			generateInsertEdits(linesIter, ctx, documentBeforeEdits),
		);
	}

	if (trimmedFirstLine === ResponseTags.EDIT.start) {
		const editLines = generateEditLines(linesIter);
		return new ResponseParseResult.EditWindowLines(editLines);
	}

	return new ResponseParseResult.Done(
		new NoNextEditReason.Unexpected(new Error(`unexpected tag ${trimmedFirstLine}`)),
	);
}

// ============================================================================
// Internal generators for UnifiedWithXml sub-tags
// ============================================================================

async function* generateInsertEdits(
	linesIter: AsyncIterator<string>,
	ctx: UnifiedXmlInsertContext,
	documentBeforeEdits: StringText,
): AsyncGenerator<StreamedEdit, NoNextEditReason, void> {
	const { editWindowLines, editWindowLineRange, cursorOriginalLinesOffset, cursorColumnZeroBased, editWindow, originalEditWindow, targetDocument, isFromCursorJump } = ctx;

	const lineWithCursorContinued = await linesIter.next();
	if (lineWithCursorContinued.done || lineWithCursorContinued.value.includes(ResponseTags.INSERT.end)) {
		return new NoNextEditReason.NoSuggestions(documentBeforeEdits, editWindow);
	}

	const cursorLineContent = editWindowLines[cursorOriginalLinesOffset];
	const edit = new LineReplacement(
		new LineRange(
			editWindowLineRange.start + cursorOriginalLinesOffset + 1 /* 0-based to 1-based */,
			editWindowLineRange.start + cursorOriginalLinesOffset + 2,
		),
		[cursorLineContent.slice(0, cursorColumnZeroBased) + lineWithCursorContinued.value + cursorLineContent.slice(cursorColumnZeroBased)],
	);
	yield { edit, isFromCursorJump, window: editWindow, originalWindow: originalEditWindow, targetDocument };

	const lines: string[] = [];
	let v = await linesIter.next();
	while (!v.done) {
		if (v.value.includes(ResponseTags.INSERT.end)) {
			break;
		} else {
			lines.push(v.value);
		}
		v = await linesIter.next();
	}

	const line = editWindowLineRange.start + cursorOriginalLinesOffset + 2;
	yield {
		edit: new LineReplacement(
			new LineRange(line, line),
			lines,
		),
		isFromCursorJump,
		window: editWindow,
		originalWindow: originalEditWindow,
		targetDocument,
	};

	return new NoNextEditReason.NoSuggestions(documentBeforeEdits, editWindow);
}

async function* generateEditLines(
	linesIter: AsyncIterator<string>,
): AsyncIterable<string> {
	let v = await linesIter.next();
	while (!v.done) {
		if (v.value.includes(ResponseTags.EDIT.end)) {
			return;
		}
		yield v.value;
		v = await linesIter.next();
	}
}
