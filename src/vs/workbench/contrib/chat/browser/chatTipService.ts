/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatModeKind } from '../common/constants.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';

export const IChatTipService = createDecorator<IChatTipService>('chatTipService');

export interface IChatTip {
	readonly id: string;
	readonly content: MarkdownString;
}

export interface IChatTipService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when the current tip is dismissed.
	 */
	readonly onDidDismissTip: Event<void>;

	/**
	 * Fired when tips are disabled.
	 */
	readonly onDidDisableTips: Event<void>;

	/**
	 * Gets a tip to show for a request, or undefined if a tip has already been shown this session.
	 * Only one tip is shown per VS Code session (resets on reload).
	 * Tips are only shown for requests created after the service was instantiated.
	 * @param requestId The unique ID of the request (used for stable rerenders).
	 * @param requestTimestamp The timestamp when the request was created.
	 * @param contextKeyService The context key service to evaluate tip eligibility.
	 */
	getNextTip(requestId: string, requestTimestamp: number, contextKeyService: IContextKeyService): IChatTip | undefined;

	/**
	 * Dismisses the current tip and allows a new one to be picked for the same request.
	 * The dismissed tip will not be shown again in this workspace.
	 */
	dismissTip(): void;

	/**
	 * Disables tips permanently by setting the `chat.tips.enabled` configuration to false.
	 */
	disableTips(): void;
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
}

/**
 * Static catalog of tips. Each tip has an optional when clause for eligibility.
 */
const TIP_CATALOG: ITipDefinition[] = [
	{
		id: 'tip.agentMode',
		message: localize('tip.agentMode', "Tip: Try [Agent mode](command:workbench.action.chat.openEditSession) for multi-file edits and running commands."),
		when: ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Agent),
		enabledCommands: ['workbench.action.chat.openEditSession'],
		excludeWhenModesUsed: [ChatModeKind.Agent],
	},
	{
		id: 'tip.planMode',
		message: localize('tip.planMode', "Tip: Try [Plan mode](command:workbench.action.chat.openPlan) to let the agent perform deep analysis and planning before implementing changes."),
		when: ChatContextKeys.chatModeName.notEqualsTo('Plan'),
		enabledCommands: ['workbench.action.chat.openPlan'],
		excludeWhenModesUsed: ['Plan'],
	},
	{
		id: 'tip.attachFiles',
		message: localize('tip.attachFiles', "Tip: Attach files or folders with # to give Copilot more context."),
	},
	{
		id: 'tip.codeActions',
		message: localize('tip.codeActions', "Tip: Select code and right-click for Copilot actions in the context menu."),
	},
	{
		id: 'tip.undoChanges',
		message: localize('tip.undoChanges', "Tip: You can undo Copilot's changes to any point by clicking Restore Checkpoint."),
		when: ContextKeyExpr.or(
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit),
		),
		excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint', 'workbench.action.chat.restoreLastCheckpoint'],
	},
	{
		id: 'tip.customInstructions',
		message: localize('tip.customInstructions', "Tip: [Generate workspace instructions](command:workbench.action.chat.generateInstructions) so Copilot always has the context it needs when starting a task."),
		enabledCommands: ['workbench.action.chat.generateInstructions'],
	}
];

/**
 * Tracks workspace-level signals that determine whether certain tips should be
 * excluded. Persists state to workspace storage and disposes listeners once all
 * signals of interest have been observed.
 */
export class TipEligibilityTracker extends Disposable {

	private static readonly _COMMANDS_STORAGE_KEY = 'chat.tips.executedCommands';
	private static readonly _MODES_STORAGE_KEY = 'chat.tips.usedModes';

	private readonly _executedCommands: Set<string>;
	private readonly _usedModes: Set<string>;

	private readonly _pendingCommands: Set<string>;
	private readonly _pendingModes: Set<string>;

	private readonly _commandListener = this._register(new MutableDisposable());

	/**
	 * Whether agent instruction files exist in the workspace.
	 * Defaults to `true` (hide the tip) until the async check completes.
	 */
	private _hasInstructionFiles = true;

	constructor(
		tips: readonly ITipDefinition[],
		commandService: ICommandService,
		private readonly _storageService: IStorageService,
		promptsService: IPromptsService,
	) {
		super();

		// --- Restore persisted state -------------------------------------------

		const storedCmds = this._storageService.get(TipEligibilityTracker._COMMANDS_STORAGE_KEY, StorageScope.WORKSPACE);
		this._executedCommands = new Set<string>(storedCmds ? JSON.parse(storedCmds) : []);

		const storedModes = this._storageService.get(TipEligibilityTracker._MODES_STORAGE_KEY, StorageScope.WORKSPACE);
		this._usedModes = new Set<string>(storedModes ? JSON.parse(storedModes) : []);

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

		// --- Async file check --------------------------------------------------

		this._checkForInstructionFiles(promptsService);
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
					return true;
				}
			}
		}
		if (tip.excludeWhenModesUsed) {
			for (const mode of tip.excludeWhenModesUsed) {
				if (this._usedModes.has(mode)) {
					return true;
				}
			}
		}
		if (tip.id === 'tip.customInstructions' && this._hasInstructionFiles) {
			return true;
		}
		return false;
	}

	private async _checkForInstructionFiles(promptsService: IPromptsService): Promise<void> {
		try {
			const files = await promptsService.listAgentInstructions(CancellationToken.None);
			this._hasInstructionFiles = files.length > 0;
		} catch {
			this._hasInstructionFiles = true;
		}
	}

	private _persistSet(key: string, set: Set<string>): void {
		this._storageService.store(key, JSON.stringify([...set]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

export class ChatTipService extends Disposable implements IChatTipService {
	readonly _serviceBrand: undefined;

	private readonly _onDidDismissTip = this._register(new Emitter<void>());
	readonly onDidDismissTip = this._onDidDismissTip.event;

	private readonly _onDidDisableTips = this._register(new Emitter<void>());
	readonly onDidDisableTips = this._onDidDisableTips.event;

	/**
	 * Timestamp when this service was instantiated.
	 * Used to only show tips for requests created after this time.
	 */
	private readonly _createdAt = Date.now();

	/**
	 * Whether a tip has already been shown in this window session.
	 * Only one tip is shown per session.
	 */
	private _hasShownTip = false;

	/**
	 * The request ID that was assigned a tip (for stable rerenders).
	 */
	private _tipRequestId: string | undefined;

	/**
	 * The tip that was shown (for stable rerenders).
	 */
	private _shownTip: ITipDefinition | undefined;

	private static readonly _DISMISSED_TIP_KEY = 'chat.tip.dismissed';
	private readonly _tracker: TipEligibilityTracker;

	constructor(
		@IProductService private readonly _productService: IProductService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ICommandService commandService: ICommandService,
		@IStorageService storageService: IStorageService,
		@IPromptsService promptsService: IPromptsService,
	) {
		super();
		this._tracker = this._register(new TipEligibilityTracker(
			TIP_CATALOG, commandService, storageService, promptsService,
		));
	}

	dismissTip(): void {
		if (this._shownTip) {
			const dismissed = this._getDismissedTipIds();
			dismissed.push(this._shownTip.id);
			this._storageService.store(ChatTipService._DISMISSED_TIP_KEY, JSON.stringify(dismissed), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		this._hasShownTip = false;
		this._shownTip = undefined;
		this._tipRequestId = undefined;
		this._onDidDismissTip.fire();
	}

	private _getDismissedTipIds(): string[] {
		const raw = this._storageService.get(ChatTipService._DISMISSED_TIP_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return [];
		}
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	disableTips(): void {
		this._hasShownTip = false;
		this._shownTip = undefined;
		this._tipRequestId = undefined;
		this._configurationService.updateValue('chat.tips.enabled', false);
		this._onDidDisableTips.fire();
	}

	getNextTip(requestId: string, requestTimestamp: number, contextKeyService: IContextKeyService): IChatTip | undefined {
		// Check if tips are enabled
		if (!this._configurationService.getValue<boolean>('chat.tips.enabled')) {
			return undefined;
		}

		// Only show tips for Copilot
		if (!this._isCopilotEnabled()) {
			return undefined;
		}

		// Check if this is the request that was assigned a tip (for stable rerenders)
		if (this._tipRequestId === requestId && this._shownTip) {
			return this._createTip(this._shownTip);
		}

		// Only show one tip per session
		if (this._hasShownTip) {
			return undefined;
		}

		// Only show tips for requests created after the service was instantiated
		// This prevents showing tips for old requests being re-rendered after reload
		if (requestTimestamp < this._createdAt) {
			return undefined;
		}

		// Find eligible tips (excluding dismissed ones)
		const dismissedIds = new Set(this._getDismissedTipIds());
		const eligibleTips = TIP_CATALOG.filter(tip => !dismissedIds.has(tip.id) && this._isEligible(tip, contextKeyService));
		// Record the current mode for future eligibility decisions
		this._tracker.recordCurrentMode(contextKeyService);

		if (eligibleTips.length === 0) {
			return undefined;
		}

		// Pick a random tip from eligible tips
		const randomIndex = Math.floor(Math.random() * eligibleTips.length);
		const selectedTip = eligibleTips[randomIndex];

		// Record that we've shown a tip this session
		this._hasShownTip = true;
		this._tipRequestId = requestId;
		this._shownTip = selectedTip;

		return this._createTip(selectedTip);
	}

	private _isEligible(tip: ITipDefinition, contextKeyService: IContextKeyService): boolean {
		if (tip.when && !contextKeyService.contextMatchesRules(tip.when)) {
			return false;
		}
		return !this._tracker.isExcluded(tip);
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
		};
	}
}
