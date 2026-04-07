/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../../platform/env/common/envService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { GenericBasePromptElementProps } from '../../../context/node/resolvers/genericPanelIntentInvocation';
import { ToolName } from '../../../tools/common/toolNames';
import { Capabilities } from '../base/capabilities';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { InstructionMessage } from '../base/instructionMessage';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { ChatToolReferences, ChatVariablesAndQuery } from './chatVariables';
import { CodeBlockFormattingRules } from './codeBlockFormattingRules';
import { HistoryWithInstructions } from './conversationHistory';
import { CustomInstructions } from './customInstructions';
import { ProjectLabels } from './projectLabels';
import { WorkspaceFoldersHint } from './workspace/workspaceFoldersHint';

export interface PanelChatBasePromptProps extends GenericBasePromptElementProps {
}

export class PanelChatBasePrompt extends PromptElement<PanelChatBasePromptProps> {
	constructor(
		props: PanelChatBasePromptProps,
		@IEnvService private readonly envService: IEnvService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const { query, history, chatVariables, } = this.props.promptContext;
		const useProjectLabels = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ProjectLabelsChat, this.experimentationService);
		const operatingSystem = this.envService.OS;

		return (
			<>
				<SystemMessage priority={1000}>
					You are an AI programming assistant.<br />
					<CopilotIdentityRules />
					<SafetyRules />
					<Capabilities location={ChatLocation.Panel} />
					<WorkspaceFoldersHint flexGrow={1} priority={800} />
					{/* Only include current date when not running simulations, since if we generate cache entries with the current date, the cache will be invalidated every day */}
					{!this.envService.isSimulation() && <><br />The current date is {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.</>}
				</SystemMessage>
				<HistoryWithInstructions flexGrow={1} historyPriority={700} passPriority history={history} currentTurnVars={chatVariables}>
					<InstructionMessage priority={1000}>
						Use Markdown formatting in your answers.<br />
						<CodeBlockFormattingRules />
						For code blocks use four backticks to start and end.<br />
						Avoid wrapping the whole response in triple backticks.<br />
						The user works in an IDE called Visual Studio Code which has a concept for editors with open files, integrated unit test support, an output pane that shows the output of running the code as well as an integrated terminal.<br />
						The user is working on a {operatingSystem} machine. Please respond with system specific commands if applicable.<br />
						The active document is the source code the user is looking at right now.<br />
						You can only give one reply for each conversation turn.<br />
						<ResponseTranslationRules />
						<br />
						{this.props.promptContext.tools?.toolReferences.find((tool) => tool.name === ToolName.Codebase)
							? <Tag name='codebaseToolInstructions'>
								1. Consider how to answer the user's prompt based on the provided information. Always assume that the user is asking about the code in their workspace instead of asking a general programming question. Prefer using variables, functions, types, and classes from the workspace over those from the standard library.<br />
								2. Generate a response that clearly and accurately answers the user's question. In your response, add fully qualified links for referenced symbols (example: [`namespace.VariableName`](path/to/file.ts)) and links for files (example: [path/to/file](path/to/file.ts)) so that the user can open them. If you do not have enough information to answer the question, respond with "I'm sorry, I can't answer that question with what I currently know about your workspace".
							</Tag>
							: undefined}
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage flexGrow={2}>
					{useProjectLabels && <ProjectLabels flexGrow={1} priority={600} />}
					<CustomInstructions flexGrow={1} priority={750} languageId={undefined} chatVariables={chatVariables} />
					<ChatToolReferences priority={899} flexGrow={2} promptContext={this.props.promptContext} />
					<ChatVariablesAndQuery flexGrow={3} flexReserve='/3' priority={900} chatVariables={chatVariables} query={query} includeFilepath={true} />
				</UserMessage>
			</>
		);
	}
}
