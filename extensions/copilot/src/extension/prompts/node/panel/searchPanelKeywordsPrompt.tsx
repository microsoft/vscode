/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { InstructionMessage } from '../base/instructionMessage';
import { SafetyRules } from '../base/safetyRules';
import { ChatToolReferences, ChatVariablesAndQuery } from './chatVariables';
import { HistoryWithInstructions } from './conversationHistory';

interface ISearchPanelKeywordsPrompt extends BasePromptElementProps {
	promptContext: ISearchPanelKeywordsPromptContext;
	endpoint: IChatEndpoint;
}

export interface ISearchPanelKeywordsPromptContext extends IBuildPromptContext {
	symbols: string[];
}


export class SearchPanelKeywordsPrompt extends PromptElement<ISearchPanelKeywordsPrompt> {

	// todo: get workspace resolver to share TSX prompt so that we can reuse here
	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const { query, history, chatVariables } = this.props.promptContext;
		return (
			<>
				<SystemMessage priority={1000}>
					You are a software engineer with expert knowledge of the codebase the user has open in their workspace.<br />
					You will be provided with a few code symbols that have been extracted as very relevant to a user's search query.<br />
					The user will be searching code extracts using natural language queries.<br />
					Your job is to find the best symbols to search for in order to find the exact code the user is looking for.<br />
					<br />
					<CopilotIdentityRules />
					<SafetyRules />
				</SystemMessage>
				<HistoryWithInstructions flexGrow={2} historyPriority={400} history={history} passPriority>
					<InstructionMessage priority={1000}>
						# Additional Rules<br />
						Think step by step:<br />
						1. Read the provided relevant workspace symbols to understand the code the user is searching for.<br />
						2. Provide concise keyword symbols that are the most relevant for what the user is searching for.<br />
						<br />
						The keywords MUST have enough characters for the user to search for and find the relevant piece of code.<br />
						You MUST NOT include decorators or any other characters in the response.<br />
						# Examples<br />
						Question:<br />
						base64 encoding<br />
						<br />
						Response:<br />
						convertEncoding()<br />
						toBase64()<br />
						<br />
						Question:<br />
						npm scripts<br />
						<br />
						Response:<br />
						npm run test<br />
						npm run build<br />
						<br />
						Question:<br />
						register result provider<br />
						<br />
						Response:<br />
						export class ResultProvider<br />
						registerResultProvider()<br />
						IResultProvider<br />
						<br />
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage>
					<>
						{'Here are all the relevant symbols for the user query:'}<br />
						{this.props.promptContext.symbols.join('\n')}
						<br /><br />
					</>
					<ChatToolReferences priority={899} flexGrow={3} promptContext={this.props.promptContext} />
					<ChatVariablesAndQuery flexGrow={3} chatVariables={chatVariables} priority={900} query={query} />
				</UserMessage>
			</>
		);
	}
}
