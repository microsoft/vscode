/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { InstructionMessage } from '../base/instructionMessage';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';
import { ChatToolReferences, ChatVariablesAndQuery } from './chatVariables';
import { HistoryWithInstructions } from './conversationHistory';
import { CustomInstructions } from './customInstructions';
import { EditorIntegrationRules } from './editorIntegrationRules';
import { TerminalLastCommand } from './terminalLastCommand';
import { TerminalSelection } from './terminalSelection';

export interface TerminalPromptProps extends BasePromptElementProps {
	promptContext: IBuildPromptContext;
	osName: string;
	shellType: string;
	endpoint: IChatEndpoint;
}

export interface TerminalPromptState {
}

export class TerminalExplainPrompt extends PromptElement<TerminalPromptProps, TerminalPromptState> {

	override render(state: TerminalPromptState): PromptPiece<any, any> | undefined {
		const { history, chatVariables, } = this.props.promptContext;
		const query = this.props.promptContext.query || 'What did the last command do?';
		return (
			<>
				<SystemMessage priority={1000}>
					You are a programmer who specializes in using the command line. Your task is to help the Developer by giving a detailed answer to their query.<br />
					<CopilotIdentityRules />
					<SafetyRules />
				</SystemMessage>
				<HistoryWithInstructions flexGrow={1} historyPriority={600} passPriority history={history}>
					<InstructionMessage priority={1000}>
						<EditorIntegrationRules />
						<ResponseTranslationRules />
						<br />
						Additional Rules<br />
						{`Generate a response that clearly and accurately answers the user's question. In your response, follow the following:
- Provide any command suggestions using the active shell and operating system.
- Say "I'm not quite sure how to do that." when you aren't confident in your explanation`}<br />
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage flexGrow={1} priority={750}>
					<CustomInstructions languageId={undefined} chatVariables={chatVariables} />
				</UserMessage>
				<UserMessage flexGrow={1} priority={800}>
					The active terminal's shell type is:<br />
					{this.props.shellType}
				</UserMessage >
				<UserMessage flexGrow={1} priority={800}>
					The active operating system is:<br />
					{this.props.osName}
				</UserMessage >
				<TerminalSelection flexGrow={1} priority={800} />
				<TerminalLastCommand flexGrow={1} priority={800} />
				<ChatToolReferences priority={899} flexGrow={2} promptContext={this.props.promptContext} embeddedInsideUserMessage={false} />
				<ChatVariablesAndQuery flexGrow={2} priority={900} chatVariables={chatVariables} query={query} embeddedInsideUserMessage={false} />
			</>
		);
	}
}
