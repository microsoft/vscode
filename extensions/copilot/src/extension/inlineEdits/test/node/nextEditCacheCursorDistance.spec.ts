/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assert, beforeEach, describe, it } from 'vitest';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { InlineEditRequestLogContext } from '../../../../platform/inlineEdits/common/inlineEditLogContext';
import { MutableObservableWorkspace } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { LogServiceImpl } from '../../../../platform/log/common/logService';
import { NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { URI } from '../../../../util/vs/base/common/uri';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { Position } from '../../../../util/vs/editor/common/core/position';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { NextEditCache } from '../../node/nextEditCache';
import { NextEditFetchRequest } from '../../node/nextEditProvider';

describe('NextEditCache cursor distance check', () => {

	let configService: InMemoryConfigurationService;
	let obsWorkspace: MutableObservableWorkspace;
	let logService: LogServiceImpl;
	let expService: NullExperimentationService;
	let cache: NextEditCache;
	let docId: DocumentId;

	// A multi-line document:
	// Line 1: "line1"
	// Line 2: "line2"
	// ...
	// Line 10: "line10"
	const docContent = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n');
	const docText = new StringText(docContent);

	function makeSource(): NextEditFetchRequest {
		const logContext = new InlineEditRequestLogContext('test', 0, undefined);
		return new NextEditFetchRequest(generateUuid(), logContext, undefined, false);
	}

	/** Get the offset of the start of a 1-indexed line in docContent. */
	function lineStartOffset(lineNumber: number): number {
		return docText.getTransformer().getOffset(new Position(lineNumber, 1));
	}

	function cursorAtLine(lineNumber: number): OffsetRange[] {
		const offset = lineStartOffset(lineNumber);
		return [new OffsetRange(offset, offset)];
	}

	beforeEach(() => {
		configService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		obsWorkspace = new MutableObservableWorkspace();
		logService = new LogServiceImpl([]);
		expService = new NullExperimentationService();

		docId = DocumentId.create(URI.file('/test/cursor-distance.ts').toString());
		obsWorkspace.addDocument({ id: docId, initialValue: docContent });

		cache = new NextEditCache(obsWorkspace, logService, configService, expService);
	});

	// Edit targets line 6 (replaces "line6" with "REPLACED")
	const editStartOffset = docContent.indexOf('line6');
	const editEndOffset = editStartOffset + 'line6'.length;
	const edit = new StringReplacement(new OffsetRange(editStartOffset, editEndOffset), 'REPLACED');

	function cacheEditWithCursorAtLine(cursorLine: number) {
		cache.setKthNextEdit(
			docId,
			docText,
			undefined, // editWindow
			edit,
			0, // subsequentN
			undefined, // nextEdits
			undefined, // userEditSince
			makeSource(),
			{ isFromCursorJump: false, cursorOffset: lineStartOffset(cursorLine) },
		);
	}

	describe('when flag is disabled (default)', () => {
		it('serves cached edit regardless of cursor distance', () => {
			// Cache edit with cursor on line 5 (1 line away from edit on line 6)
			cacheEditWithCursorAtLine(5);

			// Move cursor to line 1 (5 lines away — farther)
			const result = cache.lookupNextEdit(docId, docText, cursorAtLine(1));
			assert(result?.edit, 'should serve cached edit when flag is off');
		});
	});

	describe('when flag is enabled', () => {
		beforeEach(async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsCacheCursorDistanceCheck, true);
		});

		it('serves cached edit when cursor moves closer to the edit', () => {
			// Cache edit with cursor on line 4 (2 lines away from edit on line 6)
			cacheEditWithCursorAtLine(4);

			// Move cursor to line 5 (1 line away — closer)
			const result = cache.lookupNextEdit(docId, docText, cursorAtLine(5));
			assert(result?.edit, 'should serve cached edit when cursor is closer');
		});

		it('serves cached edit when cursor stays at the same distance', () => {
			// Cache edit with cursor on line 4 (2 lines away from edit on line 6)
			cacheEditWithCursorAtLine(4);

			// Move cursor to line 8 (also 2 lines away — same distance, other side)
			const result = cache.lookupNextEdit(docId, docText, cursorAtLine(8));
			assert(result?.edit, 'should serve cached edit at equal distance');
		});

		it('rejects cached edit when cursor moves farther from the edit', () => {
			// Cache edit with cursor on line 5 (1 line away from edit on line 6)
			cacheEditWithCursorAtLine(5);

			// Move cursor to line 1 (5 lines away — farther)
			const result = cache.lookupNextEdit(docId, docText, cursorAtLine(1));
			assert(result?.rejected === true, 'should return cached edit marked as rejected');
		});

		it('marks the cached edit as rejected when cursor moves farther', () => {
			// Cache edit with cursor on line 5 (1 line away from edit on line 6)
			cacheEditWithCursorAtLine(5);

			// Move cursor to line 1 (5 lines away — farther) — triggers rejection
			cache.lookupNextEdit(docId, docText, cursorAtLine(1));

			// Now even looking up from the original close position should show rejected
			const result = cache.lookupNextEdit(docId, docText, cursorAtLine(5));
			assert(result?.rejected === true, 'cached edit should be marked as rejected');
		});

		it('does not apply to subsequent edits (subsequentN > 0)', () => {
			// Cache a subsequent edit (subsequentN = 1) with cursor on line 5
			cache.setKthNextEdit(
				docId,
				docText,
				undefined,
				edit,
				1, // subsequentN > 0
				undefined,
				undefined,
				makeSource(),
				{ isFromCursorJump: false, cursorOffset: lineStartOffset(5) },
			);

			// Move cursor to line 1 (farther) — should still serve because it's subsequent
			const result = cache.lookupNextEdit(docId, docText, cursorAtLine(1));
			assert(result?.edit, 'subsequent edits should not be filtered by cursor distance');
		});

		it('does not apply when cursorOffsetAtCacheTime is not set', () => {
			// Cache edit without cursor offset
			cache.setKthNextEdit(
				docId,
				docText,
				undefined,
				edit,
				0,
				undefined,
				undefined,
				makeSource(),
				{ isFromCursorJump: false }, // no cursorOffset
			);

			// Move cursor to line 1 (farther) — should still serve because no cursor offset recorded
			const result = cache.lookupNextEdit(docId, docText, cursorAtLine(1));
			assert(result?.edit, 'should serve when no cursor offset was recorded at cache time');
		});

		it('serves cached edit when cursor is on the same line as the edit', () => {
			// Cache edit with cursor on line 4 (2 lines away from edit on line 6)
			cacheEditWithCursorAtLine(4);

			// Move cursor to line 6 (0 lines away — on the edit itself)
			const result = cache.lookupNextEdit(docId, docText, cursorAtLine(6));
			assert(result?.edit, 'should serve cached edit when cursor is on the edit line');
		});
	});
});
