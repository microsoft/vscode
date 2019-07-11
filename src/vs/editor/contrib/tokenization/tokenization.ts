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
		model.resetTokenization();
		const sw = new StopWatch(true);
		model.forceTokenization(model.getLineCount());
		sw.stop();
		console.log(`tokenization took ${sw.elapsed()}`);

		if (!true) {
			extractTokenTypes(model);
		}
	}
}

function extractTokenTypes(model: ITextModel): void {
	const eolLength = model.getEOL().length;
	let result: number[] = [];
	let resultLen: number = 0;
	let lastTokenType: StandardTokenType = StandardTokenType.Other;
	let lastEndOffset: number = 0;
	let offset = 0;
	for (let lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
		const lineTokens = model.getLineTokens(lineNumber);

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

			result[resultLen++] = startOffset; // - lastEndOffset
			result[resultLen++] = length;
			result[resultLen++] = tokenType;

			lastTokenType = tokenType;
			lastEndOffset = endOffset;
		}

		offset += lineTokens.getLineContent().length + eolLength;
	}
}

registerEditorAction(ForceRetokenizeAction);
