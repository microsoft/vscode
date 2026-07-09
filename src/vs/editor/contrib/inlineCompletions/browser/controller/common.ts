/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import type { InlineCompletionsController } from './inlineCompletionsController.js';

let _getInlineCompletionsController: ((editor: ICodeEditor) => InlineCompletionsController | null) | undefined;

export function getInlineCompletionsController(editor: ICodeEditor): InlineCompletionsController | null {
	return _getInlineCompletionsController?.(editor) ?? null;
}

export function setInlineCompletionsControllerGetter(getter: (editor: ICodeEditor) => InlineCompletionsController | null): void {
	_getInlineCompletionsController = getter;
}
