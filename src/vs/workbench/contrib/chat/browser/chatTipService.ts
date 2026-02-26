/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { AgentFileType, IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../common/promptSyntax/promptTypes.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ILanguageModelToolsService } from '../common/tools/languageModelToolsService.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { IChatService } from '../common/chatService/chatService.js';
import { CreateSlashCommandsUsageTracker } from './createSlashCommandsUsageTracker.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, IParsedChatRequest } from '../common/requestParser/chatParserTypes.js';
import { GENERATE_AGENT_COMMAND_ID, GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID, GENERATE_PROMPT_COMMAND_ID, GENERATE_SKILL_COMMAND_ID } from './actions/chatActions.js';

type ChatTipEvent = {
	tipId: string;
	action: string;
	commandId?: string;
};

type ChatTipClassification = {
	tipId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the tip.' };
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action performed on the tip (shown, dismissed, navigateNext, navigatePrevious, hidden, disabled, commandClicked).' };
	commandId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The command ID that was clicked, if applicable.' };
	owner: 'meganrogge';
	comment: 'Tracks user interactions with chat tips to understand which tips resonate and which are dismissed.';
};

export const ATTACH_FILES_REFERENCE_TRACKING_COMMAND = 'chat.tips.attachFiles.referenceUsed';
export const CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND = 'chat.tips.createAgentInstructions.commandUsed';
export const CREATE_PROMPT_TRACKING_COMMAND = 'chat.tips.createPrompt.commandUsed';
export const CREATE_AGENT_TRACKING_COMMAND = 'chat.tips.createAgent.commandUsed';
export const CREATE_SKILL_TRACKING_COMMAND = 'chat.tips.createSkill.commandUsed';

export const IChatTipService = createDecorator<IChatTipService>('chatTipService');

export interface IChatTip {
	readonly id: string;
	readonly content: MarkdownString;
	readonly enabledCommands?: readonly string[];
}

export interface IChatTipService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when the current tip is dismissed.
	 */
	readonly onDidDismissTip: Event<void>;

	/**
	 * Fired when the user navigates to a different tip (previous/next).
	 */
	readonly onDidNavigateTip: Event<IChatTip>;

	/**
	 * Fired when the tip widget is hidden without dismissing the tip.
	 */
	readonly onDidHideTip: Event<void>;

	/**
	 * Fired when tips are disabled.
	 */
	readonly onDidDisableTips: Event<void>;

	/**
	 * Gets a tip to show on the welcome/getting-started view.
	 * Returns the same tip on repeated calls for stable rerenders.
	 */
	getWelcomeTip(contextKeyService: IContextKeyService): IChatTip | undefined;

	/**
	 * Resets tip state for a new conversation.
	 * Call this when the chat widget binds to a new model.
	 */
	resetSession(): void;

	/**
	 * Dismisses the current tip and allows a new one to be picked for the same request.
	 * The dismissed tip will not be shown again for this user on this application installation.
	 */
	dismissTip(): void;

	/**
	 * Hides the tip widget without permanently dismissing the tip.
	 * The tip may be shown again in a future session.
	 */
	hideTip(): void;

	/**
	 * Disables tips permanently by setting the `chat.tips.enabled` configuration to false.
	 */
	disableTips(): Promise<void>;

	/**
	 * Navigates to the next tip in the catalog without permanently dismissing the current one.
	 */
	navigateToNextTip(): IChatTip | undefined;

	/**
	 * Navigates to the previous tip in the catalog without permanently dismissing the current one.
	 */
	navigateToPreviousTip(): IChatTip | undefined;

	/**
	 * Returns whether there are multiple eligible tips for navigation.
	 */
	hasMultipleTips(): boolean;

	/**
	 * Clears all dismissed tips so they can be shown again.
	 */
	clearDismissedTips(): void;
}

export interface ITipDefinition {
	readonly id: string;
	readonly message: string;
	/**
	 * When clause expression that determines if this tip is eligible to be shown.
	 * If undefined, the tip is always eligible.
	 */
	readonly when?: ContextKeyExpression;
	/**
	 * Command IDs that are allowed to be executed from this tip's markdown.
	 */
	readonly enabledCommands?: string[];
	/**
	 * Chat model IDs for which this tip is eligible.
	 * Compared against the lowercased `chatModelId` context key.
	 */
	readonly onlyWhenModelIds?: readonly string[];
	/**
	 * Command IDs that, if ever executed in this workspace, make this tip ineligible.
	 * The tip won't be shown if the user has already performed the action it suggests.
	 */
	readonly excludeWhenCommandsExecuted?: string[];
	/**
	 * Chat mode names that, if ever used in this workspace, make this tip ineligible.
	 * The tip won't be shown if the user has already used the mode it suggests.
	 * Matches against both mode kind (e.g. 'agent') and mode name (e.g. 'Plan').
	 */
	readonly excludeWhenModesUsed?: string[];
	/**
	 * Tool IDs that, if ever invoked in this workspace, make this tip ineligible.
	 * The tip won't be shown if the tool it describes has already been used.
	 */
	readonly excludeWhenToolsInvoked?: string[];
	/**
	 * If set, exclude this tip when prompt files of the specified type exist in the workspace.
	 */
	readonly excludeWhenPromptFilesExist?: {
		readonly promptType: PromptsType;
		/** Also check for this specific agent instruction file type. */
		readonly agentFileType?: AgentFileType;
		/** If true, exclude the tip until the async file check completes. Default: false. */
		readonly excludeUntilChecked?: boolean;
	};
	/**
	 * Setting keys that, if changed from their default value, make this tip ineligible.
	 * The tip won't be shown if the user has already customized the setting it describes.
	 */
	readonly excludeWhenSettingsChanged?: string[];
	/**
	 * Command IDs that dismiss this tip when clicked from the tip markdown
	 * while the tip is currently shown.
	 */
	readonly dismissWhenCommandsClicked?: string[];
}

/**
 * Static catalog of tips. Each tip has an optional when clause for eligibility.
 */
const TIP_CATALOG: ITipDefinition[] = [
	{
		id: 'tip.switchToAuto',
		message: localize('tip.switchToAuto', "Tip: Using gpt-4.1? Try switching to [Auto](command:workbench.action.chat.openModelPicker) in the model picker for better coding performance."),
		enabledCommands: ['workbench.action.chat.openModelPicker'],
		onlyWhenModelIds: ['gpt-4.1'],
	},
	{
		id: 'tip.createInstruction',
		message: localize(
			'tip.createInstruction',
			"Tip: Use [/create-instructions](command:{0}) to generate an on-demand instructions file with the agent.",
			GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID
		),
		when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
		enabledCommands: [GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID],
		excludeWhenCommandsExecuted: [
			GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
			CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND,
		],
	},
	{
		id: 'tip.createPrompt',
		message: localize(
			'tip.createPrompt',
			"Tip: Use [/create-prompt](command:{0}) to generate a reusable prompt file with the agent.",
			GENERATE_PROMPT_COMMAND_ID
		),
		when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
		enabledCommands: [GENERATE_PROMPT_COMMAND_ID],
		excludeWhenCommandsExecuted: [
			GENERATE_PROMPT_COMMAND_ID,
			CREATE_PROMPT_TRACKING_COMMAND,
		],
	},
	{
		id: 'tip.createAgent',
		message: localize(
			'tip.createAgent',
			"Tip: Use [/create-agent](command:{0}) to scaffold a custom agent for your workflow.",
			GENERATE_AGENT_COMMAND_ID
		),
		when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
		enabledCommands: [GENERATE_AGENT_COMMAND_ID],
		excludeWhenCommandsExecuted: [
			GENERATE_AGENT_COMMAND_ID,
			CREATE_AGENT_TRACKING_COMMAND,
		],
	},
	{
		id: 'tip.createSkill',
		message: localize(
			'tip.createSkill',
			"Tip: Use [/create-skill](command:{0}) to create a skill the agent can load when relevant.",
			GENERATE_SKILL_COMMAND_ID
		),
		when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
		enabledCommands: [GENERATE_SKILL_COMMAND_ID],
		excludeWhenCommandsExecuted: [
			GENERATE_SKILL_COMMAND_ID,
			CREATE_SKILL_TRACKING_COMMAND,
		],
	},
	{
		id: 'tip.agentMode',
		message: localize('tip.agentMode', "Tip: Try [Agents](command:workbench.action.chat.openEditSession) to make edits across your project and run commands."),
		when: ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Agent),
		enabledCommands: ['workbench.action.chat.openEditSession'],
		excludeWhenModesUsed: [ChatModeKind.Agent],
	},
	{
		id: 'tip.planMode',
		message: localize('tip.planMode', "Tip: Try the [Plan agent](command:workbench.action.chat.openPlan) to research and plan before implementing changes."),
		when: ChatContextKeys.chatModeName.notEqualsTo('Plan'),
		enabledCommands: ['workbench.action.chat.openPlan'],
		excludeWhenCommandsExecuted: ['workbench.action.chat.openPlan'],
		excludeWhenModesUsed: ['Plan'],
	},
	{
		id: 'tip.attachFiles',
		message: localize('tip.attachFiles', "Tip: Reference files or folders with # to give the agent more context about the task."),
		excludeWhenCommandsExecuted: ['workbench.action.chat.attachContext', 'workbench.action.chat.attachFile', 'workbench.action.chat.attachFolder', 'workbench.action.chat.attachSelection', ATTACH_FILES_REFERENCE_TRACKING_COMMAND],
	},
	{
		id: 'tip.codeActions',
		message: localize('tip.codeActions', "Tip: Select a code block in the editor and right-click to access more AI actions."),
		excludeWhenCommandsExecuted: ['inlineChat.start'],
	},
	{
		id: 'tip.undoChanges',
		message: localize('tip.undoChanges', "Tip: Select \"Restore Checkpoint\" to undo changes after that point in the chat conversation."),
		when: ContextKeyExpr.and(
			ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
			ContextKeyExpr.or(
				ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
				ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit),
			),
		),
		excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint', 'workbench.action.chat.restoreLastCheckpoint'],
	},
	{
		id: 'tip.messageQueueing',
		message: localize('tip.messageQueueing', "Tip: Steer the agent mid-task by sending follow-up messages. They queue and apply in order."),
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		excludeWhenCommandsExecuted: ['workbench.action.chat.queueMessage', 'workbench.action.chat.steerWithMessage'],
	},
	{
		id: 'tip.yoloMode',
		message: localize('tip.yoloMode', "Tip: Enable [auto approve](command:workbench.action.openSettings?%5B%22chat.tools.global.autoApprove%22%5D) to give the agent full control without manual confirmation."),
		when: ContextKeyExpr.and(
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			ContextKeyExpr.notEquals('config.chat.tools.global.autoApprove', true),
		),
		enabledCommands: ['workbench.action.openSettings'],
		excludeWhenSettingsChanged: [ChatConfiguration.GlobalAutoApprove],
		dismissWhenCommandsClicked: ['workbench.action.openSettings'],
	},
	{
		id: 'tip.agenticBrowser',
		message: localize('tip.agenticBrowser', "Tip: Enable [agentic browser integration](command:workbench.action.openSettings?%5B%22workbench.browser.enableChatTools%22%5D) to let the agent open and interact with pages in the Integrated Browser."),
		when: ContextKeyExpr.and(
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			ContextKeyExpr.notEquals('config.workbench.browser.enableChatTools', true),
		),
		enabledCommands: ['workbench.action.openSettings'],
		excludeWhenSettingsChanged: ['workbench.browser.enableChatTools'],
		dismissWhenCommandsClicked: ['workbench.action.openSettings'],
	},
	{
		id: 'tip.mermaid',
		message: localize('tip.mermaid', "Tip: Ask the agent to draw an architectural diagram or flow chart; it can render Mermaid diagrams directly in chat."),
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		excludeWhenToolsInvoked: ['renderMermaidDiagram'],
	},
	{
		id: 'tip.subagents',
		message: localize('tip.subagents', "Tip: Ask the agent to work in parallel to complete large tasks faster."),
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		excludeWhenToolsInvoked: ['runSubagent'],
	},
	{
		id: 'tip.thinkingPhrases',
		message: localize('tip.thinkingPhrases', "Tip: Customize the loading messages shown while the agent works with [thinking phrases](command:workbench.action.openSettings?%5B%22chat.agent.thinking.phrases%22%5D)."),
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		enabledCommands: ['workbench.action.openSettings'],
		excludeWhenSettingsChanged: ['chat.agent.thinking.phrases'],
		dismissWhenCommandsClicked: ['workbench.action.openSettings'],
	},
];

/**
 * Tracks user-level signals that determine whether certain tips should be
 * excluded. Persists state to application storage and disposes listeners once all
 * signals of interest have been observed.
 */
export class TipEligibilityTracker extends Disposable {

	private static readonly _COMMANDS_STORAGE_KEY = 'chat.tips.executedCommands';
	private static readonly _MODES_STORAGE_KEY = 'chat.tips.usedModes';
	private static readonly _TOOLS_STORAGE_KEY = 'chat.tips.invokedTools';

	private readonly _executedCommands: Set<string>;
	private readonly _usedModes: Set<string>;
	private readonly _invokedTools: Set<string>;

	private readonly _pendingCommands: Set<string>;
	private readonly _pendingModes: Set<string>;
	private readonly _pendingTools: Set<string>;

	private readonly _commandListener = this._register(new MutableDisposable());
	private readonly _toolListener = this._register(new MutableDisposable());

	/**
	 * Tip IDs excluded because prompt files of the required type exist in the workspace.
	 * Tips with `excludeUntilChecked` are pre-added and removed if no files are found.
	 */
	private readonly _excludedByFiles = new Set<string>();

	/** Tips that have file-based exclusions, kept for re-checks. */
	private readonly _tipsWithFileExclusions: readonly ITipDefinition[];

	/** Generation counter per tip ID to discard stale async file-check results. */
	private readonly _fileCheckGeneration = new Map<string, number>();
	private readonly _fileChecksInFlight = new Map<string, Promise<void>>();

	constructor(
		tips: readonly ITipDefinition[],
		@ICommandService commandService: ICommandService,
		@IStorageService private readonly _storageService: IStorageService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// --- Restore persisted state -------------------------------------------

		const storedCmds = this._readApplicationWithProfileFallback(TipEligibilityTracker._COMMANDS_STORAGE_KEY);
		this._executedCommands = new Set<string>(storedCmds ? JSON.parse(storedCmds) : []);

		const storedModes = this._readApplicationWithProfileFallback(TipEligibilityTracker._MODES_STORAGE_KEY);
		this._usedModes = new Set<string>(storedModes ? JSON.parse(storedModes) : []);

		const storedTools = this._readApplicationWithProfileFallback(TipEligibilityTracker._TOOLS_STORAGE_KEY);
		this._invokedTools = new Set<string>(storedTools ? JSON.parse(storedTools) : []);

		// --- Derive what still needs tracking ----------------------------------

		this._pendingCommands = new Set<string>();
		for (const tip of tips) {
			for (const cmd of tip.excludeWhenCommandsExecuted ?? []) {
				if (!this._executedCommands.has(cmd)) {
					this._pendingCommands.add(cmd);
				}
			}
		}

		this._pendingModes = new Set<string>();
		for (const tip of tips) {
			for (const mode of tip.excludeWhenModesUsed ?? []) {
				if (!this._usedModes.has(mode)) {
					this._pendingModes.add(mode);
				}
			}
		}

		this._pendingTools = new Set<string>();
		for (const tip of tips) {
			for (const toolId of tip.excludeWhenToolsInvoked ?? []) {
				if (!this._invokedTools.has(toolId)) {
					this._pendingTools.add(toolId);
				}
			}
		}

		// --- Set up command listener (auto-disposes when all seen) --------------

		if (this._pendingCommands.size > 0) {
			this._commandListener.value = commandService.onDidExecuteCommand(e => {
				this.recordCommandExecuted(e.commandId);
			});
		}

		// --- Set up tool listener (auto-disposes when all seen) -----------------

		if (this._pendingTools.size > 0) {
			this._toolListener.value = this._languageModelToolsService.onDidInvokeTool(e => {
				// Track explicit tool IDs
				if (this._pendingTools.has(e.toolId)) {
					this._invokedTools.add(e.toolId);
					this._pendingTools.delete(e.toolId);

					this._persistSet(TipEligibilityTracker._TOOLS_STORAGE_KEY, this._invokedTools);
				}

				if (this._pendingTools.size === 0) {
					this._toolListener.clear();
				}
			});
		}

		// --- Async file checks -------------------------------------------------

		this._tipsWithFileExclusions = tips.filter(t => t.excludeWhenPromptFilesExist);
		for (const tip of this._tipsWithFileExclusions) {
			if (tip.excludeWhenPromptFilesExist!.excludeUntilChecked) {
				this._excludedByFiles.add(tip.id);
			}
			this._checkForPromptFiles(tip);
		}

		// Re-check agent file exclusions when custom agents change (covers late discovery)
		this._register(this._promptsService.onDidChangeCustomAgents(() => {
			for (const tip of this._tipsWithFileExclusions) {
				if (tip.excludeWhenPromptFilesExist!.promptType === PromptsType.agent) {
					this._checkForPromptFiles(tip);
				}
			}
		}));
	}

	recordCommandExecuted(commandId: string): void {
		if (!this._pendingCommands.has(commandId)) {
			return;
		}

		this._executedCommands.add(commandId);
		this._persistSet(TipEligibilityTracker._COMMANDS_STORAGE_KEY, this._executedCommands);
		this._pendingCommands.delete(commandId);

		if (this._pendingCommands.size === 0) {
			this._commandListener.clear();
		}
	}

	/**
	 * Records the current chat mode (kind + name) so future tip eligibility
	 * checks can exclude mode-related tips. No-ops once all tracked modes
	 * have been observed.
	 */
	recordCurrentMode(contextKeyService: IContextKeyService): void {
		if (this._pendingModes.size === 0) {
			return;
		}

		let changed = false;
		const kind = contextKeyService.getContextKeyValue<string>(ChatContextKeys.chatModeKind.key);
		if (kind && !this._usedModes.has(kind)) {
			this._usedModes.add(kind);
			this._pendingModes.delete(kind);
			changed = true;
		}
		const name = contextKeyService.getContextKeyValue<string>(ChatContextKeys.chatModeName.key);
		if (name && !this._usedModes.has(name)) {
			this._usedModes.add(name);
			this._pendingModes.delete(name);
			changed = true;
		}
		if (changed) {
			this._persistSet(TipEligibilityTracker._MODES_STORAGE_KEY, this._usedModes);
		}
	}

	/**
	 * Returns `true` when the tip should be **excluded** from the eligible set.
	 */
	isExcluded(tip: ITipDefinition): boolean {
		if (tip.excludeWhenCommandsExecuted) {
			for (const cmd of tip.excludeWhenCommandsExecuted) {
				if (this._executedCommands.has(cmd)) {
					this._logService.debug('#ChatTips: tip excluded because command was executed', tip.id, cmd);
					return true;
				}
			}
		}
		if (tip.excludeWhenModesUsed) {
			for (const mode of tip.excludeWhenModesUsed) {
				if (this._usedModes.has(mode)) {
					this._logService.debug('#ChatTips: tip excluded because mode was used', tip.id, mode);
					return true;
				}
			}
		}
		if (tip.excludeWhenToolsInvoked) {
			for (const toolId of tip.excludeWhenToolsInvoked) {
				if (this._invokedTools.has(toolId)) {
					this._logService.debug('#ChatTips: tip excluded because tool was invoked', tip.id, toolId);
					return true;
				}
			}
		}
		if (tip.excludeWhenPromptFilesExist && this._excludedByFiles.has(tip.id)) {
			this._logService.debug('#ChatTips: tip excluded because prompt files exist', tip.id);
			return true;
		}
		return false;
	}

	/**
	 * Revalidates all file-based tip exclusions. Tips with `excludeUntilChecked`
	 * are conservatively hidden until the re-check completes.
	 */
	refreshPromptFileExclusions(): void {
		for (const tip of this._tipsWithFileExclusions) {
			if (tip.excludeWhenPromptFilesExist!.excludeUntilChecked) {
				this._excludedByFiles.add(tip.id);
			}
			this._checkForPromptFiles(tip);
		}
	}

	private async _checkForPromptFiles(tip: ITipDefinition): Promise<void> {
		const inFlight = this._fileChecksInFlight.get(tip.id);
		if (inFlight) {
			await inFlight;
			return;
		}

		const checkPromise = this._doCheckForPromptFiles(tip);
		this._fileChecksInFlight.set(tip.id, checkPromise);
		try {
			await checkPromise;
		} finally {
			if (this._fileChecksInFlight.get(tip.id) === checkPromise) {
				this._fileChecksInFlight.delete(tip.id);
			}
		}
	}

	private async _doCheckForPromptFiles(tip: ITipDefinition): Promise<void> {
		const config = tip.excludeWhenPromptFilesExist!;
		const generation = (this._fileCheckGeneration.get(tip.id) ?? 0) + 1;
		this._fileCheckGeneration.set(tip.id, generation);

		try {
			const [promptFiles, agentInstructions] = await Promise.all([
				this._promptsService.listPromptFiles(config.promptType, CancellationToken.None),
				config.agentFileType ? this._promptsService.listAgentInstructions(CancellationToken.None) : Promise.resolve([]),
			]);

			// Discard stale result if a newer check was started while we were awaiting
			if (this._fileCheckGeneration.get(tip.id) !== generation) {
				return;
			}

			const hasPromptFiles = promptFiles.length > 0;
			const hasAgentFile = config.agentFileType
				? agentInstructions.some(f => f.type === config.agentFileType)
				: false;
			const hasPromptFilesOrAgentFile = hasPromptFiles || hasAgentFile;

			if (hasPromptFilesOrAgentFile) {
				this._excludedByFiles.add(tip.id);
			} else {
				this._excludedByFiles.delete(tip.id);
			}
		} catch {
			if (this._fileCheckGeneration.get(tip.id) !== generation) {
				return;
			}
			if (config.excludeUntilChecked) {
				this._excludedByFiles.add(tip.id);
			}
		}
	}

	private _persistSet(key: string, set: Set<string>): void {
		this._storageService.store(key, JSON.stringify([...set]), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private _readApplicationWithProfileFallback(key: string): string | undefined {
		const applicationValue = this._storageService.get(key, StorageScope.APPLICATION);
		if (applicationValue) {
			return applicationValue;
		}

		const profileValue = this._storageService.get(key, StorageScope.PROFILE);
		if (profileValue) {
			this._storageService.store(key, profileValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		return profileValue;
	}
}

export class ChatTipService extends Disposable implements IChatTipService {
	readonly _serviceBrand: undefined;

	private readonly _onDidDismissTip = this._register(new Emitter<void>());
	readonly onDidDismissTip = this._onDidDismissTip.event;

	private readonly _onDidNavigateTip = this._register(new Emitter<IChatTip>());
	readonly onDidNavigateTip = this._onDidNavigateTip.event;

	private readonly _onDidHideTip = this._register(new Emitter<void>());
	readonly onDidHideTip = this._onDidHideTip.event;

	private readonly _onDidDisableTips = this._register(new Emitter<void>());
	readonly onDidDisableTips = this._onDidDisableTips.event;

	/**
	 * The request ID that was assigned a tip (for stable rerenders).
	 */
	private _tipRequestId: string | undefined;

	/**
	 * The tip that was shown (for stable rerenders).
	 */
	private _shownTip: ITipDefinition | undefined;

	/**
	 * The scoped context key service from the chat widget, stored when
	 * {@link getWelcomeTip} is first called so that navigation methods
	 * can evaluate when-clause eligibility against the correct context.
	 */
	private _contextKeyService: IContextKeyService | undefined;

	private static readonly _DISMISSED_TIP_KEY = 'chat.tip.dismissed';
	private static readonly _LAST_TIP_ID_KEY = 'chat.tip.lastTipId';
	private static readonly _YOLO_EVER_ENABLED_KEY = 'chat.tip.yoloModeEverEnabled';
	private static readonly _THINKING_PHRASES_EVER_MODIFIED_KEY = 'chat.tip.thinkingPhrasesEverModified';
	private readonly _tracker: TipEligibilityTracker;
	private readonly _createSlashCommandsUsageTracker: CreateSlashCommandsUsageTracker;
	private _yoloModeEverEnabled: boolean;
	private _thinkingPhrasesEverModified: boolean;
	private readonly _tipCommandListener = this._register(new MutableDisposable());

	constructor(
		@IProductService private readonly _productService: IProductService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IChatService private readonly _chatService: IChatService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ICommandService private readonly _commandService: ICommandService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._tracker = this._register(instantiationService.createInstance(TipEligibilityTracker, TIP_CATALOG));
		this._createSlashCommandsUsageTracker = this._register(new CreateSlashCommandsUsageTracker(this._chatService, this._storageService, () => this._contextKeyService));
		this._register(this._chatEntitlementService.onDidChangeQuotaExceeded(() => {
			if (this._chatEntitlementService.quotas.chat?.percentRemaining === 0 && this._shownTip) {
				this.hideTip();
			}
		}));

		this._register(this._chatService.onDidSubmitRequest(e => {
			const message = e.message ?? this._chatService.getSession(e.chatSessionResource)?.lastRequest?.message;
			if (!message) {
				return;
			}

			if (this._hasFileOrFolderReference(message)) {
				this._tracker.recordCommandExecuted(ATTACH_FILES_REFERENCE_TRACKING_COMMAND);
			}

			const createCommandTrackingId = this._getCreateSlashCommandTrackingId(message);
			if (createCommandTrackingId) {
				this._tracker.recordCommandExecuted(createCommandTrackingId);
			}
		}));

		// Track whether yolo mode was ever enabled
		this._yoloModeEverEnabled = this._storageService.getBoolean(ChatTipService._YOLO_EVER_ENABLED_KEY, StorageScope.APPLICATION, false);
		if (!this._yoloModeEverEnabled && this._configurationService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove)) {
			this._yoloModeEverEnabled = true;
			this._storageService.store(ChatTipService._YOLO_EVER_ENABLED_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		if (!this._yoloModeEverEnabled) {
			const configListener = this._register(new MutableDisposable());
			configListener.value = this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
					if (this._configurationService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove)) {
						this._yoloModeEverEnabled = true;
						this._storageService.store(ChatTipService._YOLO_EVER_ENABLED_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
						configListener.clear();
					}
				}
			});
		}

		this._thinkingPhrasesEverModified = this._storageService.getBoolean(ChatTipService._THINKING_PHRASES_EVER_MODIFIED_KEY, StorageScope.APPLICATION, false);
		if (!this._thinkingPhrasesEverModified && this._isSettingModified(ChatConfiguration.ThinkingPhrases)) {
			this._thinkingPhrasesEverModified = true;
			this._storageService.store(ChatTipService._THINKING_PHRASES_EVER_MODIFIED_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		if (!this._thinkingPhrasesEverModified) {
			this._register(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(ChatConfiguration.ThinkingPhrases)) {
					this._thinkingPhrasesEverModified = true;
					this._storageService.store(ChatTipService._THINKING_PHRASES_EVER_MODIFIED_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				}
			}));
		}
	}

	private _hasFileOrFolderReference(message: IParsedChatRequest): boolean {
		return message.parts.some(part => {
			if (part.kind !== ChatRequestDynamicVariablePart.Kind) {
				return false;
			}

			const dynamicPart = part as ChatRequestDynamicVariablePart;
			return dynamicPart.isFile === true || dynamicPart.isDirectory === true;
		});
	}

	private _getCreateSlashCommandTrackingId(message: IParsedChatRequest): string | undefined {
		for (const part of message.parts) {
			if (part.kind === ChatRequestSlashCommandPart.Kind) {
				const slashCommand = (part as ChatRequestSlashCommandPart).slashCommand.command;
				return this._toCreateSlashCommandTrackingId(slashCommand);
			}
		}

		const trimmed = message.text.trimStart();
		const match = /^\/(create-(?:instructions|prompt|agent|skill))(?:\s|$)/.exec(trimmed);
		return match ? this._toCreateSlashCommandTrackingId(match[1]) : undefined;
	}

	private _toCreateSlashCommandTrackingId(command: string): string | undefined {
		switch (command) {
			case 'create-instructions':
				return CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND;
			case 'create-prompt':
				return CREATE_PROMPT_TRACKING_COMMAND;
			case 'create-agent':
				return CREATE_AGENT_TRACKING_COMMAND;
			case 'create-skill':
				return CREATE_SKILL_TRACKING_COMMAND;
			default:
				return undefined;
		}
	}

	resetSession(): void {
		this._shownTip = undefined;
		this._tipRequestId = undefined;
		this._contextKeyService = undefined;
	}

	dismissTip(): void {
		if (this._shownTip) {
			this._logTipTelemetry(this._shownTip.id, 'dismissed');
			const dismissed = new Set(this._getDismissedTipIds());
			dismissed.add(this._shownTip.id);
			this._storageService.store(ChatTipService._DISMISSED_TIP_KEY, JSON.stringify([...dismissed]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		// Keep the current tip reference so callers can navigate relative to it
		// (for example, dismiss -> next should mirror next/previous behavior).
		this._tipRequestId = undefined;
		this._onDidDismissTip.fire();
	}

	clearDismissedTips(): void {
		this._storageService.remove(ChatTipService._DISMISSED_TIP_KEY, StorageScope.APPLICATION);
		this._storageService.remove(ChatTipService._DISMISSED_TIP_KEY, StorageScope.PROFILE);
		this._shownTip = undefined;
		this._tipRequestId = undefined;
		this._contextKeyService = undefined;
		this._onDidDismissTip.fire();
	}

	private _getDismissedTipIds(): string[] {
		const raw = this._readApplicationWithProfileFallback(ChatTipService._DISMISSED_TIP_KEY);
		if (!raw) {
			return [];
		}
		try {
			const parsed = JSON.parse(raw);
			this._logService.debug('#ChatTips dismissed:', parsed);
			if (!Array.isArray(parsed)) {
				return [];
			}

			const knownTipIds = new Set(TIP_CATALOG.map(tip => tip.id));
			const dismissed = new Set<string>();
			for (const value of parsed) {
				if (typeof value === 'string' && knownTipIds.has(value)) {
					dismissed.add(value);
				}
			}

			return [...dismissed];
		} catch {
			return [];
		}
	}

	hideTip(): void {
		if (this._shownTip) {
			this._logTipTelemetry(this._shownTip.id, 'hidden');
		}
		this._shownTip = undefined;
		this._tipRequestId = undefined;
		this._onDidHideTip.fire();
	}

	async disableTips(): Promise<void> {
		if (this._shownTip) {
			this._logTipTelemetry(this._shownTip.id, 'disabled');
		}
		this._shownTip = undefined;
		this._tipRequestId = undefined;
		await this._configurationService.updateValue('chat.tips.enabled', false, ConfigurationTarget.APPLICATION);
		this._onDidDisableTips.fire();
	}

	getWelcomeTip(contextKeyService: IContextKeyService): IChatTip | undefined {
		this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
		// Always record the current mode so that mode-based exclusions are
		// persisted even on stable-rerender paths (e.g. user switches to Plan
		// mode while viewing the Plan tip).
		this._tracker.recordCurrentMode(contextKeyService);

		this._tracker.refreshPromptFileExclusions();
		// Check if tips are enabled
		if (!this._configurationService.getValue<boolean>('chat.tips.enabled')) {
			return undefined;
		}

		// Store the scoped context key service for later navigation calls
		this._contextKeyService = contextKeyService;

		// Only show tips for Copilot
		if (!this._isCopilotEnabled()) {
			return undefined;
		}

		// Tips are only relevant after sign-in has completed.
		if (this._chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
			return undefined;
		}

		// Only show tips in the main chat panel, not in terminal/editor inline chat
		if (!this._isChatLocation(contextKeyService)) {
			return undefined;
		}

		// Don't show tips when chat quota is exceeded, the upgrade widget is more relevant
		if (this._isChatQuotaExceeded(contextKeyService)) {
			return undefined;
		}

		// Return the already-shown tip for stable rerenders
		if (this._tipRequestId === 'welcome' && this._shownTip) {
			if (!this._isEligible(this._shownTip, contextKeyService)) {
				const nextTip = this._findNextEligibleTip(this._shownTip.id, contextKeyService);
				if (nextTip) {
					this._shownTip = nextTip;
					this._storageService.store(ChatTipService._LAST_TIP_ID_KEY, nextTip.id, StorageScope.APPLICATION, StorageTarget.USER);
					const tip = this._createTip(nextTip);
					this._onDidNavigateTip.fire(tip);
					return tip;
				}
			}
			return this._createTip(this._shownTip);
		}

		const tip = this._pickTip('welcome', contextKeyService);

		return tip;
	}

	private _findNextEligibleTip(currentTipId: string, contextKeyService: IContextKeyService): ITipDefinition | undefined {
		this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
		const currentIndex = TIP_CATALOG.findIndex(tip => tip.id === currentTipId);
		if (currentIndex === -1) {
			return undefined;
		}

		const dismissedIds = new Set(this._getDismissedTipIds());
		for (let i = 1; i < TIP_CATALOG.length; i++) {
			const idx = (currentIndex + i) % TIP_CATALOG.length;
			const candidate = TIP_CATALOG[idx];
			if (!dismissedIds.has(candidate.id) && this._isEligible(candidate, contextKeyService)) {
				return candidate;
			}
		}

		return undefined;
	}

	private _pickTip(sourceId: string, contextKeyService: IContextKeyService): IChatTip | undefined {
		this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
		// Record the current mode for future eligibility decisions.
		this._tracker.recordCurrentMode(contextKeyService);

		const dismissedIds = new Set(this._getDismissedTipIds());
		let selectedTip: ITipDefinition | undefined;

		// Determine where to start in the catalog based on the last-shown tip.
		const lastTipId = this._readApplicationWithProfileFallback(ChatTipService._LAST_TIP_ID_KEY);
		const lastCatalogIndex = lastTipId ? TIP_CATALOG.findIndex(tip => tip.id === lastTipId) : -1;
		const startIndex = lastCatalogIndex === -1 ? 0 : (lastCatalogIndex + 1) % TIP_CATALOG.length;

		// Pass 1: walk TIP_CATALOG in a ring, picking the first tip that is both
		// not dismissed and eligible for the current context.
		for (let i = 0; i < TIP_CATALOG.length; i++) {
			const idx = (startIndex + i) % TIP_CATALOG.length;
			const candidate = TIP_CATALOG[idx];
			if (!dismissedIds.has(candidate.id) && this._isEligible(candidate, contextKeyService)) {
				selectedTip = candidate;
				break;
			}
		}

		if (!selectedTip) {
			return undefined;
		}

		// Persist the selected tip id so the next use advances to the following one.
		this._storageService.store(ChatTipService._LAST_TIP_ID_KEY, selectedTip.id, StorageScope.APPLICATION, StorageTarget.USER);

		// Record that we've shown a tip this session
		this._tipRequestId = sourceId;
		this._shownTip = selectedTip;

		this._logTipTelemetry(selectedTip.id, 'shown');
		this._trackTipCommandClicks(selectedTip);

		return this._createTip(selectedTip);
	}

	navigateToNextTip(): IChatTip | undefined {
		if (!this._contextKeyService) {
			return undefined;
		}
		return this._navigateTip(1, this._contextKeyService);
	}

	navigateToPreviousTip(): IChatTip | undefined {
		if (!this._contextKeyService) {
			return undefined;
		}
		return this._navigateTip(-1, this._contextKeyService);
	}

	hasMultipleTips(): boolean {
		if (!this._contextKeyService) {
			return false;
		}

		this._createSlashCommandsUsageTracker.syncContextKey(this._contextKeyService);
		return this._hasNavigableTip(this._contextKeyService);
	}

	private _navigateTip(direction: 1 | -1, contextKeyService: IContextKeyService): IChatTip | undefined {
		this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
		if (!this._shownTip) {
			return undefined;
		}

		const currentIndex = TIP_CATALOG.findIndex(t => t.id === this._shownTip!.id);
		if (currentIndex === -1) {
			return undefined;
		}

		const candidate = this._getNavigableTip(direction, currentIndex, contextKeyService);
		if (candidate) {
			this._logTipTelemetry(this._shownTip.id, direction === 1 ? 'navigateNext' : 'navigatePrevious');
			this._shownTip = candidate;
			this._tipRequestId = 'welcome';
			this._storageService.store(ChatTipService._LAST_TIP_ID_KEY, candidate.id, StorageScope.APPLICATION, StorageTarget.USER);
			this._logTipTelemetry(candidate.id, 'shown');
			this._trackTipCommandClicks(candidate);
			const tip = this._createTip(candidate);
			this._onDidNavigateTip.fire(tip);
			return tip;
		}

		return undefined;
	}

	private _hasNavigableTip(contextKeyService: IContextKeyService): boolean {
		if (!this._shownTip) {
			return false;
		}

		const currentIndex = TIP_CATALOG.findIndex(t => t.id === this._shownTip!.id);
		if (currentIndex === -1) {
			return false;
		}

		return !!this._getNavigableTip(1, currentIndex, contextKeyService);
	}

	private _getNavigableTip(direction: 1 | -1, currentIndex: number, contextKeyService: IContextKeyService): ITipDefinition | undefined {
		const dismissedIds = new Set(this._getDismissedTipIds());

		let eligibleTipCount = 0;
		for (const tip of TIP_CATALOG) {
			if (!dismissedIds.has(tip.id) && this._isEligible(tip, contextKeyService)) {
				eligibleTipCount++;
				if (eligibleTipCount > 1) {
					break;
				}
			}
		}

		if (eligibleTipCount <= 1) {
			return undefined;
		}

		for (let i = 1; i < TIP_CATALOG.length; i++) {
			const idx = ((currentIndex + direction * i) % TIP_CATALOG.length + TIP_CATALOG.length) % TIP_CATALOG.length;
			const candidate = TIP_CATALOG[idx];
			if (!dismissedIds.has(candidate.id) && this._isEligible(candidate, contextKeyService)) {
				return candidate;
			}
		}

		return undefined;
	}

	private _isEligible(tip: ITipDefinition, contextKeyService: IContextKeyService): boolean {
		if (tip.onlyWhenModelIds?.length) {
			const currentModelId = this._getCurrentChatModelId(contextKeyService);
			const isModelMatch = tip.onlyWhenModelIds.some(modelId => currentModelId === modelId || currentModelId.startsWith(`${modelId}-`));
			if (!isModelMatch) {
				return false;
			}
		}
		if (tip.excludeWhenSettingsChanged?.some(setting => this._isSettingModified(setting))) {
			this._logService.debug('#ChatTips: tip excluded because setting was modified', tip.id, tip.excludeWhenSettingsChanged);
			return false;
		}
		if (tip.when && !contextKeyService.contextMatchesRules(tip.when)) {
			this._logService.debug('#ChatTips: tip is not eligible due to when clause', tip.id, tip.when.serialize());
			return false;
		}
		if (this._tracker.isExcluded(tip)) {
			return false;
		}
		if (tip.id === 'tip.yoloMode') {
			if (this._yoloModeEverEnabled) {
				this._logService.debug('#ChatTips: tip excluded because yolo mode was previously enabled', tip.id);
				return false;
			}
			const inspected = this._configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove);
			if (inspected.policyValue === false) {
				this._logService.debug('#ChatTips: tip excluded because policy restricts auto-approve', tip.id);
				return false;
			}
		}
		if (tip.id === 'tip.thinkingPhrases' && this._thinkingPhrasesEverModified) {
			this._logService.debug('#ChatTips: tip excluded because thinking phrases setting was previously modified', tip.id);
			return false;
		}
		this._logService.debug('#ChatTips: tip is eligible', tip.id);
		return true;
	}

	private _isSettingModified(key: string): boolean {
		const inspected = this._configurationService.inspect(key);
		return inspected.userValue !== undefined
			|| inspected.userLocalValue !== undefined
			|| inspected.userRemoteValue !== undefined
			|| inspected.workspaceValue !== undefined
			|| inspected.workspaceFolderValue !== undefined;
	}

	private _getCurrentChatModelId(contextKeyService: IContextKeyService): string {
		const normalize = (modelId: string | undefined): string => {
			const normalizedModelId = modelId?.toLowerCase() ?? '';
			if (!normalizedModelId) {
				return '';
			}

			if (normalizedModelId.includes('/')) {
				return normalizedModelId.split('/').at(-1) ?? '';
			}

			return normalizedModelId;
		};

		const contextKeyModelId = normalize(contextKeyService.getContextKeyValue<string>(ChatContextKeys.chatModelId.key));
		if (contextKeyModelId) {
			return contextKeyModelId;
		}

		const location = contextKeyService.getContextKeyValue<ChatAgentLocation>(ChatContextKeys.location.key) ?? ChatAgentLocation.Chat;
		const sessionType = contextKeyService.getContextKeyValue<string>(ChatContextKeys.chatSessionType.key) ?? '';
		const candidateStorageKeys = sessionType
			? [`chat.currentLanguageModel.${location}.${sessionType}`, `chat.currentLanguageModel.${location}`]
			: [`chat.currentLanguageModel.${location}`];

		for (const storageKey of candidateStorageKeys) {
			const persistedModelIdentifier = this._storageService.get(storageKey, StorageScope.APPLICATION);
			const persistedModelId = normalize(persistedModelIdentifier);
			if (persistedModelId) {
				return persistedModelId;
			}
		}

		return '';
	}

	private _isChatLocation(contextKeyService: IContextKeyService): boolean {
		const location = contextKeyService.getContextKeyValue<ChatAgentLocation>(ChatContextKeys.location.key);
		return !location || location === ChatAgentLocation.Chat;
	}

	private _isChatQuotaExceeded(contextKeyService: IContextKeyService): boolean {
		return contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.chatQuotaExceeded.key) === true;
	}

	private _isCopilotEnabled(): boolean {
		const defaultChatAgent = this._productService.defaultChatAgent;
		return !!defaultChatAgent?.chatExtensionId;
	}

	private _createTip(tipDef: ITipDefinition): IChatTip {
		const markdown = new MarkdownString(tipDef.message, {
			isTrusted: tipDef.enabledCommands ? { enabledCommands: tipDef.enabledCommands } : false,
		});
		return {
			id: tipDef.id,
			content: markdown,
			enabledCommands: tipDef.enabledCommands,
		};
	}

	private _logTipTelemetry(tipId: string, action: string, commandId?: string): void {
		this._telemetryService.publicLog2<ChatTipEvent, ChatTipClassification>('chatTip', {
			tipId,
			action,
			commandId,
		});
	}

	private _trackTipCommandClicks(tip: ITipDefinition): void {
		this._tipCommandListener.clear();
		if (!tip.enabledCommands?.length) {
			return;
		}
		const enabledCommandSet = new Set(tip.enabledCommands);
		const dismissCommandSet = new Set(tip.dismissWhenCommandsClicked);
		this._tipCommandListener.value = this._commandService.onDidExecuteCommand(e => {
			if (enabledCommandSet.has(e.commandId) && this._shownTip?.id === tip.id) {
				this._logTipTelemetry(tip.id, 'commandClicked', e.commandId);
				if (dismissCommandSet.has(e.commandId)) {
					this.dismissTip();
				}
			}
		});
	}

	private _readApplicationWithProfileFallback(key: string): string | undefined {
		const applicationValue = this._storageService.get(key, StorageScope.APPLICATION);
		if (applicationValue) {
			return applicationValue;
		}

		const profileValue = this._storageService.get(key, StorageScope.PROFILE);
		if (profileValue) {
			this._storageService.store(key, profileValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		return profileValue;
	}
}
