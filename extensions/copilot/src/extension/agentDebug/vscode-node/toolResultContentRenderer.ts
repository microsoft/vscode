/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelDataPart, LanguageModelPromptTsxPart, LanguageModelTextPart } from '../../../vscodeTypes';
import { renderDataPartToString } from '../../prompt/vscode-node/requestLoggerToolResult';
import { IToolResultContentRenderer } from '../common/toolResultRenderer';

export class ToolResultContentRenderer implements IToolResultContentRenderer {
	readonly _serviceBrand: undefined;

	renderToolResultContent(content: Iterable<unknown>): string[] {
		const parts: string[] = [];
		for (const part of content) {
			if (part instanceof LanguageModelTextPart) {
				parts.push(part.value);
			} else if (part instanceof LanguageModelPromptTsxPart) {
				// Use lightweight JSON serialization instead of expensive renderPrompt().
				// This runs on every tool call, so avoid async TSX rendering overhead.
				try {
					parts.push(JSON.stringify(part.value, null, 2));
				} catch {
					parts.push('[PromptTsxPart]');
				}
			} else if (part instanceof LanguageModelDataPart) {
				parts.push(renderDataPartToString(part));
			}
		}
		return parts;
	}
}
