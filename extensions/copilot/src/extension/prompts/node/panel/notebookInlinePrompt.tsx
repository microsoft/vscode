/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { modelNeedsStrongReplaceStringHint, modelPrefersInstructionsAfterHistory } from '../../../../platform/endpoint/common/chatModelCapabilities';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { isLocation, isUri } from '../../../../util/common/types';
import { ToolName } from '../../../tools/common/toolNames';
import { AgentPromptProps } from '../agent/agentPrompt';
import { getEditingReminder } from '../agent/defaultAgentInstructions';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { InstructionMessage } from '../base/instructionMessage';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { ChatToolReferences, ChatVariables, UserQuery } from './chatVariables';
import { ConversationHistoryWithTools } from './conversationHistory';
import { CustomInstructions } from './customInstructions';
import { NewFilesLocationHint } from './editCodePrompt';
import { NotebookFormat, NotebookReminderInstructions } from './notebookEditCodePrompt';
import { ProjectLabels } from './projectLabels';
import { ChatToolCalls } from './toolCalling';

export class NotebookInlinePrompt extends PromptElement<AgentPromptProps> {
	constructor(
		props: AgentPromptProps,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(props);
	}
	async render(state: void, sizing: PromptSizing) {
		const instructionsAfterHistory = modelPrefersInstructionsAfterHistory(this.props.endpoint.family);
		const hasFilesInWorkingSet = this.props.promptContext.chatVariables.find(variable => isUri(variable.value) || isLocation(variable.value)) !== undefined;
		const userGoalInstructions = <>
			{hasFilesInWorkingSet
				? <>The user has a request for modifying one or more files.</>
				: <>If the user asks a question, then answer it.<br />
					If you need to change existing files and it's not clear which files should be changed, then refuse and answer with "Please add the files to be modified to the working set{(this.configurationService.getConfig(ConfigKey.CodeSearchAgentEnabled) || this.configurationService.getConfig(ConfigKey.Advanced.CodeSearchAgentEnabled)) ? ', or use `#codebase` in your request to automatically discover working set files.' : ''}".<br />
					The only exception is if you need to create new files. In that case, follow the following instructions.</>}
		</>;
		const instructions = <InstructionMessage priority={900}>
			<Tag name='instructions'>
				You are a highly sophisticated automated coding agent with expert-level knowledge across many different programming languages and frameworks.<br />
				You are capable of making complex code edits across multiple files, and you can also create new files.<br />
				You have a tool that you can use to edit and create files.<br />
				{userGoalInstructions}<br />
				For each file, first give a very short summary of what needs to be changed, then use the tool to edit the file. If you want to edit multiple files, you can use the tool multiple times in a response to edit multiple files simultaneously. This is faster than editing files one by one.<br />
				Describe the changes you'll make BEFORE editing the files. But never write out a codeblock with the changes, only pass them to the tool.<br />
				NEVER print out a codeblock with file changes unless the user asked for it. Use the {ToolName.EditNotebook} tool instead.<br />
				Do not summarize the changes after making the edits and leave the response empty if there is nothing more to add.<br />
				When describing your changes to the user, keep your descriptions very concise and to the point, and do not repeat anything that you previously described.
			</Tag>
			<Tag name='toolUseInstructions'>
				When using a tool, follow the json schema very carefully and make sure to include ALL required properties.<br />
				Always output valid JSON when using a tool.<br />
				If a tool exists to do a task, use the tool instead of asking the user to manually take an action.<br />
				If you say that you will take an action, then go ahead and use the tool to do it. No need to ask permission.<br />
				Never use multi_tool_use.parallel or any tool that does not exist. Use tools using the proper procedure, DO NOT write out a json codeblock with the tool inputs.<br />
				NEVER say the name of a tool to a user. For example, instead of saying that you'll use the {ToolName.EditNotebook} tool, say "I'll edit the project.js file".<br />
			</Tag>
			<ResponseTranslationRules />
		</InstructionMessage>;

		return (
			<>
				<SystemMessage priority={1000}>
					<CopilotIdentityRules />
					<SafetyRules />
				</SystemMessage>
				{instructionsAfterHistory ? undefined : instructions}
				<ConversationHistoryWithTools flexGrow={1} priority={700} promptContext={this.props.promptContext} />
				{instructionsAfterHistory ? instructions : undefined}
				<EditCode2UserMessage flexGrow={2} priority={900} promptContext={this.props.promptContext} endpoint={this.props.endpoint} location={this.props.location} />
				<ChatToolCalls priority={899} flexGrow={3} promptContext={this.props.promptContext} toolCallRounds={this.props.promptContext.toolCallRounds} toolCallResults={this.props.promptContext.toolCallResults} />
			</>
		);
	}
}

class EditCode2UserMessage extends PromptElement<AgentPromptProps> {
	constructor(
		props: AgentPromptProps,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const { query, chatVariables } = this.props.promptContext;
		const useProjectLabels = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ProjectLabelsChat, this.experimentationService);
		const hasReplaceStringTool = !!this.props.promptContext.tools?.availableTools.find(tool => tool.name === ToolName.ReplaceString);
		const hasEditFileTool = !!this.props.promptContext.tools?.availableTools.find(tool => tool.name === ToolName.EditFile);
		const hasMultiReplaceStringTool = !!this.props.promptContext.tools?.availableTools.find(tool => tool.name === ToolName.MultiReplaceString);

		return (
			<>
				<UserMessage>
					{useProjectLabels && <ProjectLabels flexGrow={1} priority={600} />}
					<CustomInstructions flexGrow={6} priority={750} languageId={undefined} chatVariables={chatVariables} />
					<NotebookFormat flexGrow={5} priority={810} chatVariables={chatVariables} query={query} />
					<ChatToolReferences flexGrow={4} priority={898} promptContext={this.props.promptContext} documentContext={this.props.documentContext} />
					<ChatVariables flexGrow={3} priority={898} chatVariables={chatVariables} />
					<Tag name='reminder'>
						{getEditingReminder(hasEditFileTool, hasReplaceStringTool, modelNeedsStrongReplaceStringHint(this.props.endpoint), hasMultiReplaceStringTool)}
						<NotebookReminderInstructions chatVariables={chatVariables} query={query} />
						<NewFilesLocationHint />
					</Tag>
					<Tag name='prompt'><UserQuery flexGrow={7} priority={900} chatVariables={chatVariables} query={query} /></Tag>
				</UserMessage>
			</>
		);
	}
}
