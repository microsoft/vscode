/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { detectTextDirection } from '../../../../../../base/common/textDirection.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IEditorDecorationsCollection } from '../../../../../../editor/common/editorCommon.js';
import { IModelDeltaDecoration, TextDirection } from '../../../../../../editor/common/model.js';

const CHAT_INPUT_RTL_DECORATION_DESCRIPTION = 'chat-input-rtl-direction';

/**
 * Lays out each Hebrew/Arabic line in the chat input editor right-to-left, mirroring how
 * rendered responses are handled on the display side.
 *
 * This uses Monaco's native, per-line decoration-based text direction
 * ({@link TextDirection}) rather than forcing a `dir` attribute on the editor container, so
 * cursor placement, selection and the vertical scrollbar gutter stay correct. Direction is
 * detected per line — a line with any RTL character is laid out `rtl`, everything else keeps
 * the editor's default left-to-right flow.
 */
export function updateChatInputTextDirection(editor: ICodeEditor, decorations: IEditorDecorationsCollection): void {
	const model = editor.getModel();
	if (!model) {
		decorations.clear();
		return;
	}

	const rtlLines: IModelDeltaDecoration[] = [];
	const lineCount = model.getLineCount();
	for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
		if (detectTextDirection(model.getLineContent(lineNumber)) === 'rtl') {
			rtlLines.push({
				range: new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
				options: {
					description: CHAT_INPUT_RTL_DECORATION_DESCRIPTION,
					textDirection: TextDirection.RTL
				}
			});
		}
	}

	decorations.set(rtlLines);
}
