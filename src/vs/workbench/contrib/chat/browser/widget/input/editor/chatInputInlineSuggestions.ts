/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../../../editor/browser/editorBrowser.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';

/**
 * The Copilot setting that opts into inline completions in chat inputs. No other
 * inline suggestion provider serves chat input documents.
 */
export const chatInputInlineCompletionsSetting = 'github.copilot.completions.chat.enabled';

/**
 * Turns automatic inline suggestions in a chat input editor on only while
 * {@link chatInputInlineCompletionsSetting} is enabled. Otherwise, every keystroke
 * would query all inline completion providers that match the plaintext input
 * document, such as next edit suggestions, although none of them render anything
 * there. Inline suggestions can still be triggered explicitly.
 */
export function bindChatInputInlineSuggestions(editor: ICodeEditor, configurationService: IConfigurationService): IDisposable {
	const update = () => editor.updateOptions({
		inlineSuggest: { enabled: configurationService.getValue<boolean>(chatInputInlineCompletionsSetting) === true },
	});
	update();
	return configurationService.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(chatInputInlineCompletionsSetting)) {
			update();
		}
	});
}
