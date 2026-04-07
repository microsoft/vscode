/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptReference, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type { Uri } from 'vscode';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { CodeBlock } from '../panel/safeElements';

export type ProgressMessageScenario = 'generate' | 'edit';

export interface ProgressMessagesPromptProps extends BasePromptElementProps {
	readonly scenario: ProgressMessageScenario;
	readonly count: number;
}

export class ProgressMessagesPrompt extends PromptElement<ProgressMessagesPromptProps> {
	override render() {
		const scenarioDescription = this.props.scenario === 'generate'
			? 'generating new code from scratch based on a user request'
			: 'editing and improving existing code based on a user request';

		return (
			<>
				<SystemMessage priority={1000}>
					You are an expert in writing short, catchy, and encouraging progress messages for a coding assistant.<br />
					The messages are shown to users while they wait for an AI to {scenarioDescription}.<br />
					<br />
					<SafetyRules />
					<ResponseTranslationRules />
					<br />
					Guidelines for the messages:<br />
					- Each message should be 2-4 words<br />
					- Be encouraging and slightly playful<br />
					- Reference coding/programming themes<br />
					- Avoid technical jargon that would confuse beginners<br />
					- Do not use emojis<br />
					- Do not use punctuation at the end<br />
					- Each message should be unique and different from the others<br />
					- Return messages as a JSON array of strings, nothing else<br />
					<br />
					Examples of good progress messages:<br />
					- Warming up the algorithms<br />
					- Brewing some fresh code<br />
					- Crafting your solution<br />
					- Thinking through the logic<br />
					- Almost there, hang tight<br />
				</SystemMessage>
				<UserMessage priority={900}>
					Please generate exactly {this.props.count} unique progress messages for the "{this.props.scenario} code" scenario.<br />
					Return only a JSON array of strings, no other text.
				</UserMessage>
			</>
		);
	}
}

export interface ContextualProgressMessagePromptProps extends BasePromptElementProps {
	readonly prompt: string;
	readonly fileName: string;
	readonly uri: Uri;
	readonly languageId: string;
	readonly selectedCode: string | undefined;
}

export class ContextualProgressMessagePrompt extends PromptElement<ContextualProgressMessagePromptProps> {
	override render() {
		const scenario = this.props.selectedCode ? 'editing existing code' : 'generating new code';

		return (
			<>
				<SystemMessage priority={1000}>
					You are an expert in writing short, catchy, and encouraging progress messages for a coding assistant.<br />
					The user is waiting for an AI to help them with {scenario}.<br />
					<br />
					<SafetyRules />
					<ResponseTranslationRules />
					<br />
					Guidelines for the message:<br />
					- The message should be 2-5 words<br />
					- Make it specific to what the user is trying to do based on their prompt<br />
					- Be encouraging and slightly playful<br />
					- You may reference the programming language ({this.props.languageId}) if relevant<br />
					- Avoid technical jargon that would confuse beginners<br />
					- Do not use emojis<br />
					- Do not use punctuation at the end<br />
					- Return only the message text, nothing else<br />
					<br />
					Examples of good contextual progress messages:<br />
					- For "add a function": Crafting your function<br />
					- For "fix the bug": Hunting down the bug<br />
					- For "add comments": Documenting the code<br />
					- For "refactor this": Polishing your code<br />
					- For Python file: Pythonizing your logic<br />
				</SystemMessage>
				<UserMessage priority={900}>
					<Tag name='prompt'>{this.props.prompt}</Tag>
					{this.props.selectedCode
						? <Tag name='selected-code'>
							<CodeBlock includeFilepath={true} languageId={this.props.languageId} uri={this.props.uri} references={[new PromptReference(this.props.uri, undefined, undefined)]} code={this.props.selectedCode} />
						</Tag>
						: <Tag name='file' attrs={{ name: this.props.fileName }} />
					}
					<br />
					Generate a single short progress message that is specific to this request.
				</UserMessage>
			</>
		);
	}
}
