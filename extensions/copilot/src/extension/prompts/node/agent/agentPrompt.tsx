/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, Chunk, Document, PromptElement, PromptPiece, PromptPieceChild, PromptSizing, Raw, SystemMessage, TokenLimit, UserMessage } from '@vscode/prompt-tsx';
import type { ChatRequestEditedFileEvent, LanguageModelToolInformation, NotebookEditor, TaskDefinition, TextEditor } from 'vscode';
import { sessionResourceToId } from '../../../../platform/chat/common/chatDebugFileLoggerService';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { ICustomInstructionsService } from '../../../../platform/customInstructions/common/customInstructionsService';
import { USE_SKILL_ADHERENCE_PROMPT_SETTING } from '../../../../platform/customInstructions/common/promptTypes';
import { CacheType } from '../../../../platform/endpoint/common/endpointTypes';
import { IEnvService, OperatingSystem } from '../../../../platform/env/common/envService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IAlternativeNotebookContentService } from '../../../../platform/notebook/common/alternativeContent';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { ITasksService } from '../../../../platform/tasks/common/tasksService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { isDefined, isString } from '../../../../util/vs/base/common/types';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequestEditedFileEventKind, Position, Range } from '../../../../vscodeTypes';
import { GenericBasePromptElementProps } from '../../../context/node/resolvers/genericPanelIntentInvocation';
import { ChatVariablesCollection, extractDebugTargetSessionIds, isCustomizationsIndex } from '../../../prompt/common/chatVariablesCollection';
import { getGlobalContextCacheKey, GlobalContextMessageMetadata, RenderedUserMessageMetadata, Turn } from '../../../prompt/common/conversation';
import { InternalToolReference } from '../../../prompt/common/intents';
import { IPromptVariablesService } from '../../../prompt/node/promptVariablesService';
import { ToolName } from '../../../tools/common/toolNames';
import { MemoryContextPrompt, MemoryInstructionsPrompt } from '../../../tools/node/memoryContextPrompt';
import { TodoListContextPrompt } from '../../../tools/node/todoListContextPrompt';
import { IPromptEndpoint, renderPromptElement } from '../base/promptRenderer';
import { Tag } from '../base/tag';
import { TerminalStatePromptElement } from '../base/terminalState';
import { ChatVariables, UserQuery } from '../panel/chatVariables';
import { CustomInstructions } from '../panel/customInstructions';
import { HistoricalImage } from '../panel/image';
import { NotebookFormat, NotebookReminderInstructions } from '../panel/notebookEditCodePrompt';
import { NotebookSummaryChange } from '../panel/notebookSummaryChangePrompt';
import { UserPreferences } from '../panel/preferences';
import { ChatToolCalls } from '../panel/toolCalling';
import { AgentMultirootWorkspaceStructure } from '../panel/workspace/workspaceStructure';
import { AgentConversationHistory } from './agentConversationHistory';
import './allAgentPrompts';
import { AlternateGPTPrompt, DefaultReminderInstructions, DefaultToolReferencesHint, ReminderInstructionsProps, ToolReferencesHintProps } from './defaultAgentInstructions';
import { AgentPromptCustomizations, ReminderInstructionsConstructor, ToolReferencesHintConstructor } from './promptRegistry';
import { SummarizedConversationHistory } from './summarizedConversationHistory';

export interface AgentPromptProps extends GenericBasePromptElementProps {
	readonly endpoint: IChatEndpoint;
	readonly location: ChatLocation;

	readonly triggerSummarize?: boolean;

	/**
	 * Enables cache breakpoints and summarization
	 */
	readonly enableCacheBreakpoints?: boolean;

	/**
	 * Codesearch mode, aka agentic Ask mode
	 */
	readonly codesearchMode?: boolean;

	/**
	 * All resolved customizations from the prompt registry.
	 */
	readonly customizations?: AgentPromptCustomizations;

	/** Whether this summarization was triggered as a background or foreground operation. */
	readonly summarizationSource?: 'background' | 'foreground';
}

/** Proportion of the prompt token budget any singular textual tool result is allowed to use. */
const MAX_TOOL_RESPONSE_PCT = 0.5;

/**
 * The agent mode prompt, rendered on each request
 */
export class AgentPrompt extends PromptElement<AgentPromptProps> {
	constructor(
		props: AgentPromptProps,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IPromptVariablesService private readonly promptVariablesService: IPromptVariablesService,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const customizations = this.props.customizations;
		if (!customizations) {
			throw new Error('AgentPrompt requires customizations to be provided. Use PromptRegistry.resolveAllCustomizations() to resolve them.');
		}
		const instructions = await this.getSystemPrompt(customizations);
		const CopilotIdentityRules = customizations.CopilotIdentityRulesClass;
		const SafetyRules = customizations.SafetyRulesClass;

		const omitBaseAgentInstructions = this.configurationService.getConfig(ConfigKey.Advanced.OmitBaseAgentInstructions);
		const baseAgentInstructions = <>
			<SystemMessage>
				You are an expert AI programming assistant, working with a user in the VS Code editor.<br />
				<CopilotIdentityRules />
				<SafetyRules />
			</SystemMessage>
			{instructions}
			<SystemMessage>
				<MemoryInstructionsPrompt />
			</SystemMessage>
		</>;
		const isAutopilot = this.props.promptContext.request?.permissionLevel === 'autopilot';
		const sessionResource = this.props.promptContext.request?.sessionResource;
		const sessionId = sessionResource ? sessionResourceToId(sessionResource) : undefined;
		const debugTargetSessionIds = extractDebugTargetSessionIds([...this.props.promptContext.chatVariables].map(v => v.reference));
		const templateVariablesContext = this.promptVariablesService.buildTemplateVariablesContext(sessionId, debugTargetSessionIds);
		const baseInstructions = <>
			{!omitBaseAgentInstructions && baseAgentInstructions}
			{await this.getAgentCustomInstructions()}
			{isAutopilot && <SystemMessage priority={80}>
				When you have fully completed the task, call the task_complete tool to signal that you are done.<br />
				IMPORTANT: Before calling task_complete, you MUST provide a brief text summary of what was accomplished in your message. The task is not complete until both the summary and the task_complete call are present.
			</SystemMessage>}
			{templateVariablesContext.length > 0 && <SystemMessage>{templateVariablesContext}</SystemMessage>}
			<UserMessage>
				{await this.getOrCreateGlobalAgentContext(this.props.endpoint)}
			</UserMessage>
		</>;

		const maxToolResultLength = Math.floor(this.promptEndpoint.modelMaxPromptTokens * MAX_TOOL_RESPONSE_PCT);
		const userQueryTagName = customizations.userQueryTagName;
		const ReminderInstructionsClass = customizations.ReminderInstructionsClass;
		const ToolReferencesHintClass = customizations.ToolReferencesHintClass;

		if (this.props.enableCacheBreakpoints) {
			return <>
				{baseInstructions}
				<SummarizedConversationHistory
					flexGrow={1}
					triggerSummarize={this.props.triggerSummarize}
					priority={900}
					promptContext={this.props.promptContext}
					location={this.props.location}
					maxToolResultLength={maxToolResultLength}
					endpoint={this.props.endpoint}
					tools={this.props.promptContext.tools?.availableTools}
					enableCacheBreakpoints={this.props.enableCacheBreakpoints}
					summarizationSource={this.props.summarizationSource}
					userQueryTagName={userQueryTagName}
					ReminderInstructionsClass={ReminderInstructionsClass}
					ToolReferencesHintClass={ToolReferencesHintClass}
				/>
			</>;
		} else {
			return <>
				{baseInstructions}
				<AgentConversationHistory flexGrow={1} priority={700} promptContext={this.props.promptContext} />
				<AgentUserMessage flexGrow={2} priority={900} {...getUserMessagePropsFromAgentProps(this.props, { userQueryTagName, ReminderInstructionsClass, ToolReferencesHintClass })} />
				<ChatToolCalls priority={899} flexGrow={2} promptContext={this.props.promptContext} toolCallRounds={this.props.promptContext.toolCallRounds} toolCallResults={this.props.promptContext.toolCallResults} truncateAt={maxToolResultLength} enableCacheBreakpoints={false} />
			</>;
		}
	}

	private async getSystemPrompt(customizations: AgentPromptCustomizations) {
		const modelFamily = this.props.endpoint.family ?? 'unknown';

		if (this.props.endpoint.family.startsWith('gpt-') && this.configurationService.getExperimentBasedConfig(ConfigKey.EnableAlternateGptPrompt, this.experimentationService)) {
			return <AlternateGPTPrompt
				availableTools={this.props.promptContext.tools?.availableTools}
				modelFamily={this.props.endpoint.family}
				codesearchMode={this.props.codesearchMode}
			/>;
		}

		const PromptClass = customizations.SystemPrompt!;
		return <PromptClass
			availableTools={this.props.promptContext.tools?.availableTools}
			modelFamily={modelFamily}
			codesearchMode={this.props.codesearchMode}
		/>;
	}

	private async getAgentCustomInstructions() {
		const putCustomInstructionsInSystemMessage = this.configurationService.getConfig(ConfigKey.CustomInstructionsInSystemMessage);
		const customInstructionsBodyParts: PromptPiece[] = [];
		customInstructionsBodyParts.push(
			<CustomInstructions
				languageId={undefined}
				chatVariables={this.props.promptContext.chatVariables}
				includeSystemMessageConflictWarning={!putCustomInstructionsInSystemMessage}
				customIntroduction={putCustomInstructionsInSystemMessage ? '' : undefined} // If in system message, skip the "follow these user-provided coding instructions" intro
			/>
		);
		if (this.props.promptContext.modeInstructions) {
			const { name, content, toolReferences } = this.props.promptContext.modeInstructions;
			const resolvedContent = toolReferences && toolReferences.length > 0 ? await this.promptVariablesService.resolveToolReferencesInPrompt(content, toolReferences) : content;

			customInstructionsBodyParts.push(
				<Tag name='modeInstructions'>
					You are currently running in "{name}" mode. Below are your instructions for this mode, they must take precedence over any instructions above.<br />
					<br />
					{resolvedContent}
				</Tag>
			);
		}
		return putCustomInstructionsInSystemMessage ?
			<SystemMessage>{customInstructionsBodyParts}</SystemMessage> :
			<UserMessage>{customInstructionsBodyParts}</UserMessage>;
	}

	private async getOrCreateGlobalAgentContext(endpoint: IChatEndpoint): Promise<PromptPieceChild[]> {
		const globalContext = await this.getOrCreateGlobalAgentContextContent(endpoint);
		const isNewChat = this.props.promptContext.history?.length === 0;
		// TODO:@bhavyau find a better way to extract session resource
		const sessionResource = (this.props.promptContext.tools?.toolInvocationToken as any)?.sessionResource as string | undefined;
		const result = globalContext ?
			renderedMessageToTsxChildren(globalContext, !!this.props.enableCacheBreakpoints) :
			<GlobalAgentContext enableCacheBreakpoints={!!this.props.enableCacheBreakpoints} availableTools={this.props.promptContext.tools?.availableTools} isNewChat={isNewChat} sessionResource={sessionResource} />;

		return result;
	}

	private async getOrCreateGlobalAgentContextContent(endpoint: IChatEndpoint): Promise<Raw.ChatCompletionContentPart[] | undefined> {
		const firstTurn = this.props.promptContext.conversation?.turns.at(0);
		if (firstTurn) {
			const metadata = firstTurn.getMetadata(GlobalContextMessageMetadata);
			if (metadata) {
				const currentCacheKey = this.instantiationService.invokeFunction(getGlobalContextCacheKey);
				if (metadata.cacheKey === currentCacheKey) {
					return metadata.renderedGlobalContext;
				}
			}
		}

		const isNewChat = this.props.promptContext.history?.length === 0;
		// TODO:@bhavyau find a better way to extract session resource
		const sessionResource = (this.props.promptContext.tools?.toolInvocationToken as any)?.sessionResource as string | undefined;
		const rendered = await renderPromptElement(this.instantiationService, endpoint, GlobalAgentContext, { enableCacheBreakpoints: this.props.enableCacheBreakpoints, availableTools: this.props.promptContext.tools?.availableTools, isNewChat, sessionResource }, undefined, undefined);
		const msg = rendered.messages.at(0)?.content;
		if (msg) {
			firstTurn?.setMetadata(new GlobalContextMessageMetadata(msg, this.instantiationService.invokeFunction(getGlobalContextCacheKey)));
			return msg;
		}
	}
}

interface GlobalAgentContextProps extends BasePromptElementProps {
	readonly enableCacheBreakpoints?: boolean;
	readonly availableTools?: readonly LanguageModelToolInformation[];
	readonly isNewChat?: boolean;
	readonly sessionResource?: string;
}

/**
 * The "global agent context" is a static prompt at the start of a conversation containing user environment info, initial workspace structure, anything else that is a useful beginning
 * hint for the agent but is not updated during the conversation.
 */
class GlobalAgentContext extends PromptElement<GlobalAgentContextProps> {
	render() {
		return <UserMessage>
			<Tag name='environment_info'>
				<UserOSPrompt />
			</Tag>
			<Tag name='workspace_info'>
				<TokenLimit max={2000}>
					<AgentTasksInstructions availableTools={this.props.availableTools} />
				</TokenLimit>
				<WorkspaceFoldersHint />
				<AgentMultirootWorkspaceStructure maxSize={2000} excludeDotFiles={true} availableTools={this.props.availableTools} />
			</Tag>
			<UserPreferences flexGrow={7} priority={800} />
			{this.props.isNewChat && <MemoryContextPrompt sessionResource={this.props.sessionResource} />}
			{this.props.enableCacheBreakpoints && <cacheBreakpoint type={CacheType} />}
		</UserMessage>;
	}
}

export interface AgentUserMessageCustomizations {
	/** Tag name used to wrap the user query (e.g., 'userRequest' or 'user_query') */
	readonly userQueryTagName?: string;
	/** Custom reminder instructions component class */
	readonly ReminderInstructionsClass?: ReminderInstructionsConstructor;
	/** Custom tool references hint component class */
	readonly ToolReferencesHintClass?: ToolReferencesHintConstructor;
}

export interface AgentUserMessageProps extends BasePromptElementProps, AgentUserMessageCustomizations {
	readonly turn?: Turn;
	readonly isHistorical?: boolean;
	readonly request: string;
	readonly endpoint: IChatEndpoint;
	readonly toolReferences: readonly InternalToolReference[];
	readonly availableTools?: readonly LanguageModelToolInformation[];
	readonly chatVariables: ChatVariablesCollection;
	readonly enableCacheBreakpoints?: boolean;
	readonly editedFileEvents?: readonly ChatRequestEditedFileEvent[];
	readonly sessionId?: string;
	readonly sessionResource?: string;
	/** When true, indicates this is a stop hook continuation where the stop hook query is rendered as a separate message. */
	readonly hasStopHookQuery?: boolean;
	/** Additional context provided by SubagentStart hooks. */
	readonly additionalHookContext?: string;
	/** When true, this request was system-initiated (e.g. terminal completion notification) and should skip context/wrapping. */
	readonly isSystemInitiated?: boolean;
}

export function getUserMessagePropsFromTurn(turn: Turn, endpoint: IChatEndpoint, customizations?: AgentUserMessageCustomizations): AgentUserMessageProps {
	return {
		isHistorical: true,
		request: turn.request.message,
		turn,
		endpoint,
		toolReferences: turn.toolReferences,
		chatVariables: turn.promptVariables ?? new ChatVariablesCollection(),
		editedFileEvents: turn.editedFileEvents,
		enableCacheBreakpoints: false, // Should only be added to the current turn - some user messages may get them in Agent post-processing
		...customizations,
	};
}

export function getUserMessagePropsFromAgentProps(agentProps: AgentPromptProps, customizations?: AgentUserMessageCustomizations): AgentUserMessageProps {
	return {
		request: agentProps.promptContext.query,
		// Will pull frozenContent off the Turn if available
		turn: agentProps.promptContext.conversation?.getLatestTurn(),
		endpoint: agentProps.endpoint,
		toolReferences: agentProps.promptContext.tools?.toolReferences ?? [],
		availableTools: agentProps.promptContext.tools?.availableTools,
		chatVariables: agentProps.promptContext.chatVariables,
		enableCacheBreakpoints: agentProps.enableCacheBreakpoints,
		editedFileEvents: agentProps.promptContext.editedFileEvents,
		hasStopHookQuery: agentProps.promptContext.hasStopHookQuery,
		additionalHookContext: agentProps.promptContext.additionalHookContext,
		isSystemInitiated: agentProps.promptContext.request?.isSystemInitiated,
		// TODO:@roblourens
		sessionId: (agentProps.promptContext.tools?.toolInvocationToken as any)?.sessionId,
		sessionResource: (agentProps.promptContext.tools?.toolInvocationToken as any)?.sessionResource,
		...customizations,
	};
}

/**
 * Is sent with each user message. Includes the user message and also any ambient context that we want to update with each request.
 * Uses frozen content if available, for prompt caching and to avoid being updated by any agent action below this point in the conversation.
 */
export class AgentUserMessage extends PromptElement<AgentUserMessageProps> {
	constructor(
		props: AgentUserMessageProps,
		@IPromptVariablesService private readonly promptVariablesService: IPromptVariablesService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const frozenContent = this.props.turn?.getMetadata(RenderedUserMessageMetadata)?.renderedUserMessage;
		if (frozenContent) {
			return <FrozenContentUserMessage frozenContent={frozenContent} enableCacheBreakpoints={this.props.enableCacheBreakpoints} />;
		}

		if (this.props.isHistorical) {
			this.logService.trace('Re-rendering historical user message');
		}

		// System-initiated messages (e.g. terminal completion notifications) are
		// self-contained and should not be wrapped in <userRequest> or have context re-added.
		if (this.props.isSystemInitiated) {
			return <UserMessage>{this.props.request}</UserMessage>;
		}

		const query = await this.promptVariablesService.resolveToolReferencesInPrompt(this.props.request, this.props.toolReferences ?? []);
		const hasReplaceStringTool = !!this.props.availableTools?.find(tool => tool.name === ToolName.ReplaceString);
		const hasMultiReplaceStringTool = !!this.props.availableTools?.find(tool => tool.name === ToolName.MultiReplaceString);
		const hasApplyPatchTool = !!this.props.availableTools?.find(tool => tool.name === ToolName.ApplyPatch);
		const hasCreateFileTool = !!this.props.availableTools?.find(tool => tool.name === ToolName.CreateFile);
		const hasEditFileTool = !!this.props.availableTools?.find(tool => tool.name === ToolName.EditFile);
		const hasEditNotebookTool = !!this.props.availableTools?.find(tool => tool.name === ToolName.EditNotebook);
		const hasTerminalTool = !!this.props.availableTools?.find(tool => tool.name === ToolName.CoreRunInTerminal);
		const hasToolsToEditNotebook = hasCreateFileTool || hasEditNotebookTool || hasReplaceStringTool || hasApplyPatchTool || hasEditFileTool;
		const hasTodoTool = !!this.props.availableTools?.find(tool => tool.name === ToolName.CoreManageTodoList);

		const userQueryTagName = this.props.userQueryTagName ?? 'userRequest';
		const ReminderInstructionsClass = this.props.ReminderInstructionsClass ?? DefaultReminderInstructions;
		const reminderProps: ReminderInstructionsProps = {
			endpoint: this.props.endpoint,
			hasTodoTool,
			hasEditFileTool,
			hasReplaceStringTool,
			hasMultiReplaceStringTool,
		};
		const ToolReferencesHintClass = this.props.ToolReferencesHintClass ?? DefaultToolReferencesHint;
		const toolReferencesHintProps: ToolReferencesHintProps = {
			toolReferences: this.props.toolReferences,
		};

		return (
			<>
				<UserMessage>
					{hasToolsToEditNotebook && <NotebookFormat flexGrow={5} priority={810} chatVariables={this.props.chatVariables} query={query} />}
					<TokenLimit max={sizing.tokenBudget / 6} flexGrow={3} priority={898}>
						<ChatVariables chatVariables={this.props.chatVariables} isAgent={true} omitReferences />
					</TokenLimit>
					<ToolReferencesHintClass {...toolReferencesHintProps} />
					<Tag name='context'>
						<CurrentDatePrompt />
						<EditedFileEvents editedFileEvents={this.props.editedFileEvents} />
						<NotebookSummaryChange />
						{hasTerminalTool && <TerminalStatePromptElement sessionId={this.props.sessionId} />}
						{hasTodoTool && <TodoListContextPrompt sessionResource={this.props.sessionResource} />}
						{this.props.additionalHookContext && <AdditionalHookContextPrompt context={this.props.additionalHookContext} />}
					</Tag>
					<CurrentEditorContext endpoint={this.props.endpoint} />
					<Tag name='reminderInstructions'>
						{/* Critical reminders that are effective when repeated right next to the user message */}
						<ReminderInstructionsClass {...reminderProps} />
						<NotebookReminderInstructions chatVariables={this.props.chatVariables} query={this.props.request} />
						{this.configurationService.getNonExtensionConfig<boolean>(USE_SKILL_ADHERENCE_PROMPT_SETTING) && <SkillAdherenceReminder chatVariables={this.props.chatVariables} />}
					</Tag>
					{query && <Tag name={userQueryTagName} priority={900} flexGrow={7}>
						<UserQuery chatVariables={this.props.chatVariables} query={query} />
					</Tag>}
					{this.props.enableCacheBreakpoints && <cacheBreakpoint type={CacheType} />}
				</UserMessage>
			</>
		);
	}
}

interface FrozenMessageContentProps extends BasePromptElementProps {
	readonly frozenContent: readonly Raw.ChatCompletionContentPart[];
	readonly enableCacheBreakpoints?: boolean;
}

class FrozenContentUserMessage extends PromptElement<FrozenMessageContentProps> {
	async render(state: void, sizing: PromptSizing) {
		return <UserMessage priority={this.props.priority}>
			<Chunk>
				{/* Have to move <cacheBreakpoint> out of the Chunk */}
				{renderedMessageToTsxChildren(this.props.frozenContent, false)}
			</Chunk>
			{this.props.enableCacheBreakpoints && <cacheBreakpoint type={CacheType} />}
		</UserMessage>;
	}
}

export function renderedMessageToTsxChildren(message: string | readonly Raw.ChatCompletionContentPart[], enableCacheBreakpoints: boolean): PromptPieceChild[] {
	if (typeof message === 'string') {
		return [message];
	}

	return message.map(part => {
		if (part.type === Raw.ChatCompletionContentPartKind.Text) {
			return part.text;
		} else if (part.type === Raw.ChatCompletionContentPartKind.Image) {
			return <HistoricalImage src={part.imageUrl.url} detail={part.imageUrl.detail} mimeType={part.imageUrl.mediaType} />;
		} else if (part.type === Raw.ChatCompletionContentPartKind.Document) {
			return <Document data={part.documentData.data} mediaType={part.documentData.mediaType} />;
		} else if (part.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint) {
			return enableCacheBreakpoints && <cacheBreakpoint type={CacheType} />;
		}
	}).filter(isDefined);
}

class UserOSPrompt extends PromptElement<BasePromptElementProps> {
	constructor(props: BasePromptElementProps, @IEnvService private readonly envService: IEnvService) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const userOS = this.envService.OS;
		const osForDisplay = userOS === OperatingSystem.Macintosh ? 'macOS' :
			userOS;
		return <>The user's current OS is: {osForDisplay}</>;
	}
}

class CurrentDatePrompt extends PromptElement<BasePromptElementProps> {
	constructor(
		props: BasePromptElementProps,
		@IEnvService private readonly envService: IEnvService) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
		// Only include current date when not running simulations, since if we generate cache entries with the current date, the cache will be invalidated every day
		return (
			!this.envService.isSimulation() && <>The current date is {dateStr}.</>
		);
	}
}

interface AdditionalHookContextPromptProps extends BasePromptElementProps {
	readonly context: string;
}

/**
 * Renders additional context provided by hooks.
 */
class AdditionalHookContextPrompt extends PromptElement<AdditionalHookContextPromptProps> {
	async render(state: void, sizing: PromptSizing) {
		return <>Additional instructions from hooks: {this.props.context}</>;
	}
}

interface SkillAdherenceReminderProps extends BasePromptElementProps {
	readonly chatVariables: ChatVariablesCollection;
}

/**
 * Skill adherence reminder that prompts the model to read SKILL.md files when skills are available
 * in the instruction index.
 * Shown whenever the instruction index variable contains at least one skill or skill folder entry.
 */
class SkillAdherenceReminder extends PromptElement<SkillAdherenceReminderProps> {
	constructor(
		props: SkillAdherenceReminderProps,
		@ICustomInstructionsService private readonly customInstructionsService: ICustomInstructionsService,
	) {
		super(props);
	}

	async render() {
		// Check if any skills are available from the instruction index
		const indexVariable = this.props.chatVariables.find(isCustomizationsIndex);
		if (!indexVariable || !isString(indexVariable.value)) {
			return undefined;
		}

		const indexFile = this.customInstructionsService.parseInstructionIndexFile(indexVariable.value);
		if (indexFile.skills.size === 0) {
			return undefined;
		}

		return <Tag name='additional_skills_reminder'>
			Always check if any skills apply to the user's request. If so, use the {ToolName.ReadFile} tool to read the corresponding SKILL.md files. Multiple skill files may be needed for a single request. These files contain best practices built from testing that are needed for high-quality outputs.<br />
		</Tag>;
	}
}

interface CurrentEditorContextProps extends BasePromptElementProps {
	readonly endpoint: IChatEndpoint;
}

/**
 * Include the user's open editor and cursor position, but not content. This is independent of the "implicit context" attachment.
 */
class CurrentEditorContext extends PromptElement<CurrentEditorContextProps> {
	constructor(
		props: CurrentEditorContextProps,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAlternativeNotebookContentService private readonly alternativeNotebookContent: IAlternativeNotebookContentService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		if (!this.configurationService.getConfig(ConfigKey.CurrentEditorAgentContext)) {
			return;
		}

		let context: PromptElement | undefined;
		const activeEditor = this.tabsAndEditorsService.activeTextEditor;
		if (activeEditor) {
			context = this.renderActiveTextEditor(activeEditor);
		}

		const activeNotebookEditor = this.tabsAndEditorsService.activeNotebookEditor;
		if (activeNotebookEditor) {
			context = this.renderActiveNotebookEditor(activeNotebookEditor);
		}

		if (!context) {
			return;
		}

		return <Tag name='editorContext'>
			{context}
		</Tag>;
	}

	private renderActiveTextEditor(activeEditor: TextEditor) {
		// Should this include column numbers too? This confused gpt-4.1 and it read the wrong line numbers, need to find the right format.
		const selection = activeEditor.selection;
		// Found that selection is not always defined, so check for it.
		const selectionText = (selection && !selection.isEmpty) ?
			<>The current selection is from line {selection.start.line + 1} to line {selection.end.line + 1}.</> : undefined;
		return <>The user's current file is {this.promptPathRepresentationService.getFilePath(activeEditor.document.uri)}. {selectionText}</>;
	}

	private renderActiveNotebookEditor(activeNotebookEditor: NotebookEditor) {
		const altDocument = this.alternativeNotebookContent.create(this.alternativeNotebookContent.getFormat(this.props.endpoint)).getAlternativeDocument(activeNotebookEditor.notebook);
		let selectionText = '';
		// Found that selection is not always defined, so check for it.
		if (activeNotebookEditor.selection && !activeNotebookEditor.selection.isEmpty && activeNotebookEditor.notebook.cellCount > 0) {
			// Compute a list of all cells that fall in the range of selection.start and selection.end
			const { start, end } = activeNotebookEditor.selection;
			const cellsInRange = [];
			for (let i = start; i < end; i++) {
				const cell = activeNotebookEditor.notebook.cellAt(i);
				if (cell) {
					cellsInRange.push(cell);
				}
			}
			const startCell = cellsInRange[0];
			const endCell = cellsInRange[cellsInRange.length - 1];
			const lastLine = endCell.document.lineAt(endCell.document.lineCount - 1);
			const startPosition = altDocument.fromCellPosition(startCell, new Position(0, 0));
			const endPosition = altDocument.fromCellPosition(endCell, new Position(endCell.document.lineCount - 1, lastLine.text.length));
			const selection = new Range(startPosition, endPosition);
			selectionText = selection ? ` The current selection is from line ${selection.start.line + 1} to line ${selection.end.line + 1}.` : '';
		}
		return <>The user's current notebook is {this.promptPathRepresentationService.getFilePath(activeNotebookEditor.notebook.uri)}.{selectionText}</>;
	}
}

class WorkspaceFoldersHint extends PromptElement<BasePromptElementProps> {
	constructor(
		props: BasePromptElementProps,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const folders = this.workspaceService.getWorkspaceFolders();
		if (folders.length > 0) {
			return (
				<>
					I am working in a workspace with the following folders:<br />
					{folders.map(folder => `- ${this.promptPathRepresentationService.getFilePath(folder)} `).join('\n')}
				</>);
		} else {
			return <>There is no workspace currently open.</>;
		}
	}
}


interface AgentTasksInstructionsProps extends BasePromptElementProps {
	readonly availableTools?: readonly LanguageModelToolInformation[];
}

export class AgentTasksInstructions extends PromptElement<AgentTasksInstructionsProps> {
	constructor(
		props: AgentTasksInstructionsProps,
		@ITasksService private readonly _tasksService: ITasksService,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
	) {
		super(props);
	}

	async render() {
		const foundEnabledTaskTool = this.props.availableTools?.find(t => t.name === ToolName.CoreRunTask || t.name === ToolName.CoreCreateAndRunTask || t.name === ToolName.CoreGetTaskOutput);
		if (!foundEnabledTaskTool) {
			return 0;
		}

		const taskGroupsRaw = this._tasksService.getTasks();
		const taskGroups = (await Promise.all(taskGroupsRaw.map(async ([folder, tasks]) => {
			const tasksFile = URI.joinPath(folder, '.vscode', 'tasks.json');
			if (await this._ignoreService.isCopilotIgnored(tasksFile)) {
				return undefined;
			}
			const visibleTasks = tasks.filter(task => (!!task.type || task.dependsOn) && !task.hide);
			return visibleTasks.length > 0 ? [folder, visibleTasks] as const : undefined;
		}))).filter(isDefined);
		if (taskGroups.length === 0) {
			return 0;
		}

		return <>
			The following tasks can be executed using the {ToolName.CoreRunTask} tool if they are not already running:<br />
			{taskGroups.map(([folder, tasks]) =>
				<Tag name='workspaceFolder' attrs={{ path: this._promptPathRepresentationService.getFilePath(folder) }}>
					{tasks.map((t, i) => {
						const isActive = this._tasksService.isTaskActive(t);
						return (
							<Tag name='task' attrs={{ id: t.type ? `${t.type}: ${t.label || i}` : `${t.label || i}` }}>
								{this.makeTaskPresentation(t)}
								{isActive && <> (This task is currently running. You can use the {ToolName.CoreGetTaskOutput} tool to view its output.)</>}
							</Tag>
						);
					})}
				</Tag>
			)}
		</>;
	}

	/** Makes a simplified JSON presentation of the task definition for the model to reference. */
	private makeTaskPresentation(task: TaskDefinition) {
		const enum PlatformAttr {
			Windows = 'windows',
			Mac = 'osx',
			Linux = 'linux'
		}

		const omitAttrs = ['presentation', 'problemMatcher', PlatformAttr.Windows, PlatformAttr.Mac, PlatformAttr.Linux];

		const output: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(task)) {
			if (!omitAttrs.includes(key)) {
				output[key] = value;
			}
		}


		const myPlatformAttr = process.platform === 'win32' ? PlatformAttr.Windows :
			process.platform === 'darwin' ? PlatformAttr.Mac :
				PlatformAttr.Linux;
		if (task[myPlatformAttr] && typeof task[myPlatformAttr] === 'object') {
			Object.assign(output, task[myPlatformAttr]);
		}

		return JSON.stringify(output, null, '\t');
	}
}

export interface EditedFileEventsProps extends BasePromptElementProps {
	readonly editedFileEvents: readonly ChatRequestEditedFileEvent[] | undefined;
}

/**
 * Context about manual edits made to files that the agent previously edited.
 */
export class EditedFileEvents extends PromptElement<EditedFileEventsProps> {
	constructor(
		props: EditedFileEventsProps,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const events = this.props.editedFileEvents;

		if (!events || events.length === 0) {
			return undefined;
		}

		// Group by event kind and collect file paths
		const undoFiles: string[] = [];
		const modFiles: string[] = [];
		const seenUndo = new Set<string>();
		const seenMod = new Set<string>();

		for (const event of events) {
			if (event.eventKind === ChatRequestEditedFileEventKind.Undo) {
				const fp = this.promptPathRepresentationService.getFilePath(event.uri);
				if (!seenUndo.has(fp)) { seenUndo.add(fp); undoFiles.push(fp); }
			} else if (event.eventKind === ChatRequestEditedFileEventKind.UserModification) {
				const fp = this.promptPathRepresentationService.getFilePath(event.uri);
				if (!seenMod.has(fp)) { seenMod.add(fp); modFiles.push(fp); }
			}
		}

		if (undoFiles.length === 0 && modFiles.length === 0) {
			return undefined;
		}

		const sections: string[] = [];
		if (undoFiles.length > 0) {
			sections.push([
				'The user undid your edits to:',
				...undoFiles.map(f => `- ${f}`)
			].join('\n'));
		}
		if (modFiles.length > 0) {
			sections.push([
				'Some edits were made, by the user or possibly by a formatter or another automated tool, to:',
				...modFiles.map(f => `- ${f}`)
			].join('\n'));
		}

		return (
			<>
				There have been some changes between the last request and now.<br />
				{sections.join('\n')}<br />
				So be sure to check the current file contents before making any new edits.
			</>
		);
	}
}
