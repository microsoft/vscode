/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { SafetyRules } from '../base/safetyRules';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { ChatToolCalls } from './toolCalling';

export interface ChroniclePromptProps extends BasePromptElementProps {
	promptContext: IBuildPromptContext;
	endpoint: IChatEndpoint;
	systemPrompt: string;
}

export class ChroniclePrompt extends PromptElement<ChroniclePromptProps> {
	render() {
		const userQuery = this.props.promptContext.query || 'Go ahead.';
		return (
			<>
				<SystemMessage priority={1000}>
					<CopilotIdentityRules />
					<SafetyRules />
					{this.props.systemPrompt}
				</SystemMessage>
				<UserMessage priority={900}>{userQuery}</UserMessage>
				<ChatToolCalls
					priority={899}
					flexGrow={2}
					promptContext={this.props.promptContext}
					toolCallRounds={this.props.promptContext.toolCallRounds}
					toolCallResults={this.props.promptContext.toolCallResults}
					enableCacheBreakpoints={false}
				/>
			</>
		);
	}
}
