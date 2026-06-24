/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONTree, OutputMode, PromptElement, Raw, renderPrompt, UserMessage } from '@vscode/prompt-tsx';
import { LanguageModelDataPart, LanguageModelPromptTsxPart } from '../../../vscodeTypes';
import { ChatImageMimeType } from '../../conversation/common/languageModelChatMessageHelpers';

export async function renderToolResultToStringNoBudget(part: LanguageModelPromptTsxPart) {
	const r = await renderPrompt(class extends PromptElement {
		render() {
			return <UserMessage>
				<elementJSON data={part.value as JSONTree.PromptElementJSON} />
			</UserMessage>;
		}
	}, {}, {
		modelMaxPromptTokens: Infinity,
	}, { mode: OutputMode.Raw, countMessageTokens: () => 0, tokenLength: () => 0 });

	const c = r.messages[0].content;
	return typeof c === 'string' ? c : c.map(p => p.type === Raw.ChatCompletionContentPartKind.Text ? p.text : p.type === Raw.ChatCompletionContentPartKind.Image ? `<promptTsxImg src="${p.imageUrl}" />` : undefined).join('');
}

export function renderDataPartToString(part: LanguageModelDataPart) {
	const isImage = Object.values(ChatImageMimeType).includes(part.mimeType as ChatImageMimeType);

	if (isImage) {
		// return a string of data uri schema
		const base64 = btoa(String.fromCharCode(...part.data));
		return `data:${part.mimeType};base64,${base64}`;
	} else {
		// return a string of the decoded data
		try {
			const nonImageStr = new TextDecoder().decode(part.data);
			return nonImageStr;
		} catch {
			return `<decode error: ${part.data.length} bytes>`;
		}
	}
}
