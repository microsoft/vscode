/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../common/constants.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatService } from '../common/chatService/chatService.js';
import { CreateSlashCommandsUsageTracker } from './createSlashCommandsUsageTracker.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, IParsedChatRequest } from '../common/requestParser/chatParserTypes.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { TipEligibilityTracker } from './chatTipEligibilityTracker.js';
import { extractCommandIds, ITipBuildContext, ITipDefinition, TIP_CATALOG } from './chatTipCatalog.js';
import { ChatTipStorageKeys, TipTrackingCommands } from './chatTipStorageKeys.js';

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

// Re-export tracking commands for backwards compatibility
export {
	TipTrackingCommands,
};
/** @deprecated Use TipTrackingCommands.AttachFilesReferenceUsed */
export const ATTACH_FILES_REFERENCE_TRACKING_COMMAND = TipTrackingCommands.AttachFilesReferenceUsed;
/** @deprecated Use TipTrackingCommands.CreateAgentInstructionsUsed */
export const CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND = TipTrackingCommands.CreateAgentInstructionsUsed;
/** @deprecated Use TipTrackingCommands.CreatePromptUsed */
export const CREATE_PROMPT_TRACKING_COMMAND = TipTrackingCommands.CreatePromptUsed;
/** @deprecated Use TipTrackingCommands.CreateAgentUsed */
export const CREATE_AGENT_TRACKING_COMMAND = TipTrackingCommands.CreateAgentUsed;
/** @deprecated Use TipTrackingCommands.CreateSkillUsed */
export const CREATE_SKILL_TRACKING_COMMAND = TipTrackingCommands.CreateSkillUsed;

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
	 * Gets the next eligible tip after the current one, without requiring multiple tips.
	 * Used after dismissing a tip to show the next available tip (even if it's the only one left).
	 */
	getNextEligibleTip(): IChatTip | undefined;

	/**
	 * Returns whether there are multiple eligible tips for navigation.
	 */
	hasMultipleTips(): boolean;

	/**
	 * Clears all dismissed tips so they can be shown again.
	 */
	clearDismissedTips(): void;
}

// Re-export types for backwards compatibility
export type { ITipDefinition } from './chatTipCatalog.js';
export { TipEligibilityTracker } from './chatTipEligibilityTracker.js';

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
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
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
				this._tracker.recordCommandExecuted(TipTrackingCommands.AttachFilesReferenceUsed);
			}

			const createCommandTrackingId = this._getCreateSlashCommandTrackingId(message);
			if (createCommandTrackingId) {
				this._tracker.recordCommandExecuted(createCommandTrackingId);
			}
		}));

		// Track whether yolo mode was ever enabled
		this._yoloModeEverEnabled = this._storageService.getBoolean(ChatTipStorageKeys.YoloModeEverEnabled, StorageScope.APPLICATION, false);
		if (!this._yoloModeEverEnabled && this._configurationService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove)) {
			this._yoloModeEverEnabled = true;
			this._storageService.store(ChatTipStorageKeys.YoloModeEverEnabled, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		if (!this._yoloModeEverEnabled) {
			const configListener = this._register(new MutableDisposable());
			configListener.value = this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
					if (this._configurationService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove)) {
						this._yoloModeEverEnabled = true;
						this._storageService.store(ChatTipStorageKeys.YoloModeEverEnabled, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
						configListener.clear();
					}
				}
			});
		}

		this._thinkingPhrasesEverModified = this._storageService.getBoolean(ChatTipStorageKeys.ThinkingPhrasesEverModified, StorageScope.APPLICATION, false);
		if (!this._thinkingPhrasesEverModified && this._isSettingModified(ChatConfiguration.ThinkingPhrases)) {
			this._thinkingPhrasesEverModified = true;
			this._storageService.store(ChatTipStorageKeys.ThinkingPhrasesEverModified, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		if (!this._thinkingPhrasesEverModified) {
			this._register(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(ChatConfiguration.ThinkingPhrases)) {
					this._thinkingPhrasesEverModified = true;
					this._storageService.store(ChatTipStorageKeys.ThinkingPhrasesEverModified, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
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
			this._storageService.store(ChatTipStorageKeys.DismissedTips, JSON.stringify([...dismissed]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		// Keep the current tip reference so callers can navigate relative to it
		// (for example, dismiss -> next should mirror next/previous behavior).
		this._tipRequestId = undefined;
		this._onDidDismissTip.fire();
	}

	clearDismissedTips(): void {
		this._storageService.remove(ChatTipStorageKeys.DismissedTips, StorageScope.APPLICATION);
		this._storageService.remove(ChatTipStorageKeys.DismissedTips, StorageScope.PROFILE);
		this._shownTip = undefined;
		this._tipRequestId = undefined;
		this._contextKeyService = undefined;
		this._onDidDismissTip.fire();
	}

	private _getDismissedTipIds(): string[] {
		const raw = this._readApplicationWithProfileFallback(ChatTipStorageKeys.DismissedTips);
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
					this._storageService.store(ChatTipStorageKeys.LastTipId, nextTip.id, StorageScope.APPLICATION, StorageTarget.USER);
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
		const lastTipId = this._readApplicationWithProfileFallback(ChatTipStorageKeys.LastTipId);
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
		this._storageService.store(ChatTipStorageKeys.LastTipId, selectedTip.id, StorageScope.APPLICATION, StorageTarget.USER);

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

	getNextEligibleTip(): IChatTip | undefined {
		if (!this._contextKeyService || !this._shownTip) {
			return undefined;
		}

		this._createSlashCommandsUsageTracker.syncContextKey(this._contextKeyService);
		const currentIndex = TIP_CATALOG.findIndex(t => t.id === this._shownTip!.id);
		if (currentIndex === -1) {
			return undefined;
		}

		const dismissedIds = new Set(this._getDismissedTipIds());
		for (let i = 1; i < TIP_CATALOG.length; i++) {
			const idx = (currentIndex + i) % TIP_CATALOG.length;
			const candidate = TIP_CATALOG[idx];
			if (!dismissedIds.has(candidate.id) && this._isEligible(candidate, this._contextKeyService)) {
				// Found the next eligible tip - update state and return it
				this._shownTip = candidate;
				this._tipRequestId = 'welcome';
				this._storageService.store(ChatTipStorageKeys.LastTipId, candidate.id, StorageScope.APPLICATION, StorageTarget.USER);
				this._logTipTelemetry(candidate.id, 'shown');
				this._trackTipCommandClicks(candidate);
				return this._createTip(candidate);
			}
		}

		return undefined;
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
			this._storageService.store(ChatTipStorageKeys.LastTipId, candidate.id, StorageScope.APPLICATION, StorageTarget.USER);
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
		// Build the tip message with dynamic keybindings and command labels
		const ctx: ITipBuildContext = { keybindingService: this._keybindingService };
		const rawMessage = tipDef.buildMessage(ctx);

		// Add "Tip:" prefix once here, avoiding duplication in individual tip definitions
		const prefixedMessage = localize('tipPrefix', "**Tip:** {0}", rawMessage.value);

		// Auto-extract enabled commands from the built message
		const enabledCommands = extractCommandIds(prefixedMessage);

		const markdown = new MarkdownString(prefixedMessage, {
			isTrusted: enabledCommands.length > 0 ? { enabledCommands } : false,
		});
		return {
			id: tipDef.id,
			content: markdown,
			enabledCommands,
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

		// Build message to extract enabled commands dynamically
		const ctx: ITipBuildContext = { keybindingService: this._keybindingService };
		const rawMessage = tip.buildMessage(ctx);
		const enabledCommands = extractCommandIds(rawMessage.value);

		if (!enabledCommands.length) {
			return;
		}
		const enabledCommandSet = new Set(enabledCommands);
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
