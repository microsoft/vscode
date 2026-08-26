/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';

export interface TitlePromptProps extends BasePromptElementProps {
	userRequest: string;
}

export class TitlePrompt extends PromptElement<TitlePromptProps> {
	override render() {
		return (
			<>
				<SystemMessage priority={1000}>
					You are an expert in crafting ultra-compact titles for chatbot conversations. You are presented with a chat request, and you reply with only a brief title that captures the main topic of that request.<br />
					<SafetyRules />
					<ResponseTranslationRules />
					Write the title in sentence case, not title case. Preserve product names, abbreviations, code symbols, and proper nouns.<br />
					Aim for 3-6 words. Prefer the shortest accurate title.<br />
					Drop articles like "a", "an", and "the" unless needed for clarity.<br />
					Drop filler and generic framing like "help with", "question about", "request for", or "issue with".<br />
					Prefer short, concrete synonyms and omit unnecessary words.<br />
					Do not wrap the title in quotes or add trailing punctuation.<br />
					Here are some examples of good titles:<br />
					- Git rebase question<br />
					- Install Python packages<br />
					- LinkedList implementation location<br />
					- Add VS Code tree view<br />
					- React useState usage
				</SystemMessage>
				<UserMessage priority={900}>
					Please write a brief title for the following request:<br />
					<br />
					{this.props.userRequest}
				</UserMessage>
			</>);
	}
}
