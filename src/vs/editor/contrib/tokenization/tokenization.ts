/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { StopWatch } from 'vs/base/common/stopwatch';
import { StandardTokenType } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { parse } from 'vs/editor/common/modes/tokenization/typescript';

class ForceRetokenizeAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.forceRetokenize',
			label: nls.localize('forceRetokenize', "Developer: Force Retokenize"),
			alias: 'Developer: Force Retokenize',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}
		const model = editor.getModel();
		// model.resetTokenization();
		const sw = new StopWatch(true);
		model.forceTokenization(model.getLineCount());
		sw.stop();
		console.log(`tokenization took ${sw.elapsed()}`);

		if (!true) {
			const expected = extractTokenTypes(model);

			const sw2 = new StopWatch(true);
			const actual = parse(model.getValue());
			sw2.stop();
			console.log(`classification took ${sw2.elapsed()}`);

			let expectedIndex = 0, expectedCount = expected.length / 3;
			let actualIndex = 0, actualCount = actual.length / 3;
			outer: while (expectedIndex < expectedCount && actualIndex < actualCount) {
				const expectedOffset = expected[3 * expectedIndex];
				const expectedLength = expected[3 * expectedIndex + 1];
				const expectedType = expected[3 * expectedIndex + 2];
				const actualOffset = actual[3 * actualIndex];
				const actualLength = actual[3 * actualIndex + 1];
				const actualType = actual[3 * actualIndex + 2];

				// TS breaks up comments or begins them before (in case of whitespace)...
				if (actualType === StandardTokenType.Comment && expectedOffset <= actualOffset && expectedType === actualType) {
					const actualEndOffset = actualOffset + actualLength;
					while (expectedIndex < expectedCount && expected[3 * expectedIndex] + expected[3 * expectedIndex + 1] <= actualEndOffset) {
						// console.log(`(Fuzzy match):`);
						// console.log(`--- Expected: ${model.getPositionAt(expected[3 * expectedIndex])} - ${expected[3 * expectedIndex]}, ${expected[3 * expectedIndex + 1]}, ${expected[3 * expectedIndex + 2]}`);
						// console.log(`--- Actual: ${model.getPositionAt(actualOffset)} - ${actualOffset}, ${actualLength}, ${actualType}`);
						expectedIndex++;
					}
					actualIndex++;
					continue;
				}

				// TS identifies regexes as strings and begins them before (in case of whitespace)...
				if (actualType === StandardTokenType.RegEx && expectedOffset <= actualOffset && expectedType === StandardTokenType.String) {
					const actualEndOffset = actualOffset + actualLength;
					while (expectedIndex < expectedCount && expected[3 * expectedIndex] + expected[3 * expectedIndex + 1] <= actualEndOffset) {
						expectedIndex++;
					}
					actualIndex++;
					continue;
				}

				if (actualType === StandardTokenType.String && expectedType === actualType) {
					const actualEndOffset = actualOffset + actualLength;
					while (expectedIndex < expectedCount && expected[3 * expectedIndex] + expected[3 * expectedIndex + 1] <= actualEndOffset) {
						// console.log(`(Fuzzy match):`);
						// console.log(`--- Expected: ${model.getPositionAt(expected[3 * expectedIndex])} - ${expected[3 * expectedIndex]}, ${expected[3 * expectedIndex + 1]}, ${expected[3 * expectedIndex + 2]}`);
						// console.log(`--- Actual: ${model.getPositionAt(actualOffset)} - ${actualOffset}, ${actualLength}, ${actualType}`);
						expectedIndex++;
					}
					actualIndex++;
					continue;
				}

				if (expectedOffset === actualOffset && expectedLength === actualLength && expectedType === actualType) {
					expectedIndex++;
					actualIndex++;
					continue;
				}

				const expectedPosition = model.getPositionAt(expectedOffset);
				console.error(`Missmatch at position: ${expectedPosition}`);
				console.error(`Expected: ${model.getPositionAt(expectedOffset)} - ${expectedOffset}, ${expectedLength}, ${expectedType}`);
				console.error(`Actual: ${model.getPositionAt(actualOffset)} - ${actualOffset}, ${actualLength}, ${actualType}`);
				break;
			}

			if (expectedIndex !== expectedCount || actualIndex !== actualCount) {
				console.error(`Missmatch at the end`);
			}

			console.log(`Finished comparison!`);
		}
	}
}

function extractTokenTypes(model: ITextModel): number[] {
	const eolLength = model.getEOL().length;
	let result: number[] = [];
	let resultLen: number = 0;
	let lastTokenType: StandardTokenType = StandardTokenType.Other;
	let lastEndOffset: number = 0;
	let offset = 0;
	for (let lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
		const lineTokens = model.getLineTokens(lineNumber);
		const lineText = lineTokens.getLineContent();

		for (let i = 0, len = lineTokens.getCount(); i < len; i++) {
			const tokenType = lineTokens.getStandardTokenType(i);
			if (tokenType === StandardTokenType.Other) {
				continue;
			}

			const startOffset = offset + lineTokens.getStartOffset(i);
			const endOffset = offset + lineTokens.getEndOffset(i);
			const length = endOffset - startOffset;

			if (length === 0) {
				continue;
			}

			if (lastTokenType === tokenType && lastEndOffset === startOffset) {
				result[resultLen - 2] += length;
				lastEndOffset += length;
				continue;
			}

			result[resultLen++] = startOffset;
			result[resultLen++] = length;
			result[resultLen++] = tokenType;

			lastTokenType = tokenType;
			lastEndOffset = endOffset;
		}

		offset += lineText.length + eolLength;
	}

	return result;
}

registerEditorAction(ForceRetokenizeAction);
