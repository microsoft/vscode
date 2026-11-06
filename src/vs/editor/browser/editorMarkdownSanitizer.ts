/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownSanitizerConfig } from '../../base/browser/markdownRenderer.js';
import { EditorOption, isMarkdownImageAllowed } from '../common/config/editorOptions.js';
import { ICodeEditor } from './editorBrowser.js';

/**
 * Sanitizer options for Markdown that an editor renders, such as hovers, which apply the editor's `markdownImages` option.
 */
export function getEditorMarkdownSanitizerConfig(editor: ICodeEditor): MarkdownSanitizerConfig | undefined {
	const options = editor.getOption(EditorOption.markdownImages);
	if (options.allowedOrigins === true) {
		return undefined;
	}
	return {
		// Keep the URL encoded: decoding it can change its authority (`%2F` becomes `/`) and thus its origin.
		remoteImageIsAllowed: uri => isMarkdownImageAllowed(options, uri.toString()),
	};
}
