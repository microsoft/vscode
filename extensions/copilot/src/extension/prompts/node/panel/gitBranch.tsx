/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';

export interface GitBranchPromptProps extends BasePromptElementProps {
	userRequest: string;
}

export class GitBranchPrompt extends PromptElement<GitBranchPromptProps> {
	override render() {
		return (
			<>
				<SystemMessage priority={1000}>
					You are an expert in crafting pithy branch names for Git Repos based on chatbot conversations. You are presented with a chat request, and you reply with a brief branch name that captures the main topic of that request.<br />
					<SafetyRules />
					<ResponseTranslationRules />
					The branch name should not be wrapped in quotes. It should be between 8-50 characters.<br />
					Here are some examples of good branch names:<br />
					- linkedlist-implementation<br />
					- adding-tree-view<br />
					- react-usestate-hook-usage
				</SystemMessage>
				<UserMessage priority={900}>
					Please write a brief branch name for the following request:<br />
					<br />
					{this.props.userRequest}
				</UserMessage>
			</>);
	}
}
