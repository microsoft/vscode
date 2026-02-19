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
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';
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
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';

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
		id: 'tip.createSlashCommands',
		message: localize(
			'tip.createSlashCommands',
			"Tip: Use [/create-instruction](command:workbench.action.chat.generateInstruction), [/create-prompt](command:workbench.action.chat.generatePrompt), [/create-agent](command:workbench.action.chat.generateAgent), or [/create-skill](command:workbench.action.chat.generateSkill) to generate reusable agent customization files."
		),
		when: ChatContextKeys.hasUsedCreateSlashCommands.negate(),
		enabledCommands: [
			'workbench.action.chat.generateInstruction',
			'workbench.action.chat.generatePrompt',
			'workbench.action.chat.generateAgent',
			'workbench.action.chat.generateSkill',
		],
		excludeWhenCommandsExecuted: [
			'workbench.action.chat.generateInstruction',
			'workbench.action.chat.generatePrompt',
			'workbench.action.chat.generateAgent',
			'workbench.action.chat.generateSkill',
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
		excludeWhenModesUsed: ['Plan'],
	},
	{
		id: 'tip.attachFiles',
		message: localize('tip.attachFiles', "Tip: Reference files or folders with # to give the agent more context about the task."),
		excludeWhenCommandsExecuted: ['workbench.action.chat.attachContext', 'workbench.action.chat.attachFile', 'workbench.action.chat.attachFolder', 'workbench.action.chat.attachSelection'],
	},
	{
		id: 'tip.codeActions',
		message: localize('tip.codeActions', "Tip: Select a code block in the editor and right-click to access more AI actions."),
		excludeWhenCommandsExecuted: ['inlineChat.start'],
	},
	{
		id: 'tip.undoChanges',
		message: localize('tip.undoChanges', "Tip: Select Restore Checkpoint to undo changes until that point in the chat conversation."),
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
		id: 'tip.customInstructions',
		message: localize('tip.customInstructions', "Tip: [Generate workspace instructions](command:workbench.action.chat.generateInstructions) apply coding conventions across all agent sessions."),
		enabledCommands: ['workbench.action.chat.generateInstructions'],
		excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentFileType.copilotInstructionsMd, excludeUntilChecked: true },
	},
	{
		id: 'tip.customAgent',
		message: localize('tip.customAgent', "Tip: [Create a custom agent](command:workbench.command.new.agent) to define reusable personas with tailored instructions and tools for your workflow."),
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		enabledCommands: ['workbench.command.new.agent'],
		excludeWhenCommandsExecuted: ['workbench.command.new.agent'],
		excludeWhenPromptFilesExist: { promptType: PromptsType.agent, excludeUntilChecked: true },
	},
	{
		id: 'tip.skill',
		message: localize('tip.skill', "Tip: [Create a skill](command:workbench.command.new.skill) to teach the agent specialized workflows, loaded only when relevant."),
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		enabledCommands: ['workbench.command.new.skill'],
		excludeWhenCommandsExecuted: ['workbench.command.new.skill'],
		excludeWhenPromptFilesExist: { promptType: PromptsType.skill, excludeUntilChecked: true },
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
		id: 'tip.sendToNewChat',
		message: localize('tip.sendToNewChat', "Tip: Use [Send to New Chat](command:workbench.action.chat.sendToNewChat) to start a new conversation with a clean context window."),
		when: ChatContextKeys.chatSessionIsEmpty.negate(),
		enabledCommands: ['workbench.action.chat.sendToNewChat'],
		excludeWhenCommandsExecuted: ['workbench.action.chat.sendToNewChat'],
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
				if (this._pendingCommands.has(e.commandId)) {
					this._executedCommands.add(e.commandId);
					this._persistSet(TipEligibilityTracker._COMMANDS_STORAGE_KEY, this._executedCommands);
					this._pendingCommands.delete(e.commandId);

					if (this._pendingCommands.size === 0) {
						this._commandListener.clear();
					}
				}
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

	private async _checkForPromptFiles(tip: ITipDefinition): Promise<void> {
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

			if (hasPromptFiles || hasAgentFile) {
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
	private readonly _tracker: TipEligibilityTracker;
	private readonly _createSlashCommandsUsageTracker: CreateSlashCommandsUsageTracker;

	constructor(
		@IProductService private readonly _productService: IProductService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IChatService private readonly _chatService: IChatService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();
		this._tracker = this._register(instantiationService.createInstance(TipEligibilityTracker, TIP_CATALOG));
		this._createSlashCommandsUsageTracker = this._register(new CreateSlashCommandsUsageTracker(this._chatService, this._storageService, () => this._contextKeyService));
		this._register(chatEntitlementService.onDidChangeQuotaExceeded(() => {
			if (chatEntitlementService.quotas.chat?.percentRemaining === 0 && this._shownTip) {
				this.hideTip();
			}
		}));
	}

	resetSession(): void {
		this._shownTip = undefined;
		this._tipRequestId = undefined;
		this._contextKeyService = undefined;
	}

	dismissTip(): void {
		if (this._shownTip) {
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
		this._shownTip = undefined;
		this._tipRequestId = undefined;
		this._onDidHideTip.fire();
	}

	async disableTips(): Promise<void> {
		this._shownTip = undefined;
		this._tipRequestId = undefined;
		await this._configurationService.updateValue('chat.tips.enabled', false, ConfigurationTarget.APPLICATION);
		this._onDidDisableTips.fire();
	}

	getWelcomeTip(contextKeyService: IContextKeyService): IChatTip | undefined {
		this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
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

	private _navigateTip(direction: 1 | -1, contextKeyService: IContextKeyService): IChatTip | undefined {
		this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
		if (!this._shownTip) {
			return undefined;
		}

		const currentIndex = TIP_CATALOG.findIndex(t => t.id === this._shownTip!.id);
		if (currentIndex === -1) {
			return undefined;
		}

		const dismissedIds = new Set(this._getDismissedTipIds());
		for (let i = 1; i < TIP_CATALOG.length; i++) {
			const idx = ((currentIndex + direction * i) % TIP_CATALOG.length + TIP_CATALOG.length) % TIP_CATALOG.length;
			const candidate = TIP_CATALOG[idx];
			if (!dismissedIds.has(candidate.id) && this._isEligible(candidate, contextKeyService)) {
				this._shownTip = candidate;
				this._tipRequestId = 'welcome';
				this._storageService.store(ChatTipService._LAST_TIP_ID_KEY, candidate.id, StorageScope.APPLICATION, StorageTarget.USER);
				const tip = this._createTip(candidate);
				this._onDidNavigateTip.fire(tip);
				return tip;
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
		if (tip.when && !contextKeyService.contextMatchesRules(tip.when)) {
			this._logService.debug('#ChatTips: tip is not eligible due to when clause', tip.id, tip.when.serialize());
			return false;
		}
		if (this._tracker.isExcluded(tip)) {
			return false;
		}
		this._logService.debug('#ChatTips: tip is eligible', tip.id);
		return true;
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
