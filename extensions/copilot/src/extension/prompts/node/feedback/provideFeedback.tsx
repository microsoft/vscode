/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { ILogService } from '../../../../platform/log/common/logService';
import { ChatVariablesCollection } from '../../../prompt/common/chatVariablesCollection';
import { Turn } from '../../../prompt/common/conversation';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';
import { ChatVariablesAndQuery } from '../panel/chatVariables';
import { CustomInstructions } from '../panel/customInstructions';
import { EditorIntegrationRules } from '../panel/editorIntegrationRules';
import { ProjectLabels } from '../panel/projectLabels';
import { SymbolDefinitions } from '../panel/symbolDefinitions';
import { CurrentChange, CurrentChangeInput } from './currentChange';

export interface ProvideFeedbackPromptProps extends BasePromptElementProps {
	chatVariables?: ChatVariablesCollection;
	history?: readonly Turn[];
	query?: string;

	input: CurrentChangeInput[];
	logService: ILogService;
}

export class ProvideFeedbackPrompt extends PromptElement<ProvideFeedbackPromptProps> {

	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		return (
			<>
				<SystemMessage priority={1001}>
					You are a world-class software engineer and the author and maintainer of the discussed code. Your feedback prefectly combines detailed feedback and explanation of context.<br />
					<CopilotIdentityRules />
					<SafetyRules />
					<EditorIntegrationRules />
					<ResponseTranslationRules />
					<br />
					Additional Rules<br />
					Think step by step:<br />
					1. Examine the provided code and any other context like user question, related errors, project details, class definitions, etc.<br />
					2. Provide feedback on the current {this.props.input[0]?.change ? <>change</> : <>selection</>} on where it can be improved or introduces a problem.<br />
					2a. Avoid commenting on correct code.<br />
					2b. Avoid commenting on commented out code.<br />
					2c. Keep scoping rules in mind.<br />
					3. Reply with an enumerated list of feedback with source line number, filepath, kind (bug, performance, consistency, documentation, naming, readability, style, other), severity (low, medium, high), and feedback text.<br />
					3a. E.g.: 1. Line 357 in src/flow.js, bug, high severity: `i` is not incremented.<br />
					3b. E.g.: 2. Line 361 in src/arrays.js, documentation, low severity: Function `binarySearch` is not documented.<br />
					3c. E.g.: 3. Line 176 in src/vs/platform/actionWidget/browser/actionWidget.ts, consistency, medium severity: The color id `'background.actionBar'` is not consistent with the other color ids used. Use `'actionBar.background'` instead.<br />
					3d. E.g.: 4. Line 410 in src/search.js, documentation, medium severity: Returning `-1` when the target is not found is a common convention, but it should be documented.<br />
					3e. E.g.: 5. Line 51 in src/account.py, bug, high severity: The deposit method is not thread-safe. You should use a lock to ensure that the balance update is an atomic operation.<br />
					3f. E.g.: 6. Line 220 in src/account.py, readability, low severity: The withdraw method is very long and combines multipe logical steps, consider splitting it into multiple methods.<br />
					4. Try to sort the feedback by file and line number.<br />
					5. When there is no feedback to provide, reply with "No feedback to provide."<br />
					<br />
					Focus on being clear, helpful, and thorough.<br />
					Use developer-friendly terms and analogies in your explanations.<br />
					Provide clear and relevant examples when helpful.
				</SystemMessage>
				{/* {this.props.history && <><ConversationHistory priority={600} history={this.props.history} /></>} */}
				<UserMessage flexGrow={1}>
					<ProjectLabels flexGrow={1} priority={700} />
					<CustomInstructions chatVariables={this.props.chatVariables} priority={850} languageId={this.props.input[0]?.document.languageId} customIntroduction={'When providing feedback for code, please check for these user provided coding guidelines.'} includeCodeFeedbackInstructions={true} />
					<CurrentChange input={this.props.input} logService={this.props.logService} priority={1000} flexGrow={2} />
					{
						this.props.input.map(input => (
							<SymbolDefinitions document={input.document} range={input.selection} priority={800} />
						))
					}
					{this.props.chatVariables && this.props.query && <ChatVariablesAndQuery flexGrow={3} priority={900} chatVariables={this.props.chatVariables} query={this.props.query} />}
				</UserMessage>
			</>
		);
	}
}
