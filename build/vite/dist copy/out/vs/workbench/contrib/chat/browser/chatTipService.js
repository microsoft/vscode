/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../common/constants.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatService } from '../common/chatService/chatService.js';
import { CreateSlashCommandsUsageTracker } from './createSlashCommandsUsageTracker.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart } from '../common/requestParser/chatParserTypes.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { TipEligibilityTracker } from './chatTipEligibilityTracker.js';
import { extractCommandIds, TIP_CATALOG } from './chatTipCatalog.js';
import { ChatTipStorageKeys, TipTrackingCommands } from './chatTipStorageKeys.js';
// Re-export tracking commands for backwards compatibility
export { TipTrackingCommands };
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
/** @deprecated Use TipTrackingCommands.ForkConversationUsed */
export const FORK_CONVERSATION_TRACKING_COMMAND = TipTrackingCommands.ForkConversationUsed;
export const IChatTipService = createDecorator('chatTipService');
export { TipEligibilityTracker } from './chatTipEligibilityTracker.js';
let ChatTipService = class ChatTipService extends Disposable {
    constructor(_productService, _configurationService, _storageService, _chatService, instantiationService, _logService, _chatEntitlementService, _commandService, _telemetryService, _keybindingService) {
        super();
        this._productService = _productService;
        this._configurationService = _configurationService;
        this._storageService = _storageService;
        this._chatService = _chatService;
        this._logService = _logService;
        this._chatEntitlementService = _chatEntitlementService;
        this._commandService = _commandService;
        this._telemetryService = _telemetryService;
        this._keybindingService = _keybindingService;
        this._onDidDismissTip = this._register(new Emitter());
        this.onDidDismissTip = this._onDidDismissTip.event;
        this._onDidNavigateTip = this._register(new Emitter());
        this.onDidNavigateTip = this._onDidNavigateTip.event;
        this._onDidHideTip = this._register(new Emitter());
        this.onDidHideTip = this._onDidHideTip.event;
        this._onDidDisableTips = this._register(new Emitter());
        this.onDidDisableTips = this._onDidDisableTips.event;
        this._tipsHiddenForSession = false;
        this._tipCommandListener = this._register(new MutableDisposable());
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
            const slashCommandTrackingId = this._getSlashCommandTrackingId(message);
            if (slashCommandTrackingId) {
                this._tracker.recordCommandExecuted(slashCommandTrackingId);
            }
            this._hideShownTipIfNowIneligible();
        }));
        this._thinkingPhrasesEverModified = this._storageService.getBoolean(ChatTipStorageKeys.ThinkingPhrasesEverModified, -1 /* StorageScope.APPLICATION */, false);
        if (!this._thinkingPhrasesEverModified && this._isSettingModified(ChatConfiguration.ThinkingPhrases)) {
            this._thinkingPhrasesEverModified = true;
            this._storageService.store(ChatTipStorageKeys.ThinkingPhrasesEverModified, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        if (!this._thinkingPhrasesEverModified) {
            this._register(this._configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration(ChatConfiguration.ThinkingPhrases)) {
                    this._thinkingPhrasesEverModified = true;
                    this._storageService.store(ChatTipStorageKeys.ThinkingPhrasesEverModified, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
                }
            }));
        }
    }
    _hasFileOrFolderReference(message) {
        return message.parts.some(part => {
            if (part.kind !== ChatRequestDynamicVariablePart.Kind) {
                return false;
            }
            const dynamicPart = part;
            return dynamicPart.isFile === true || dynamicPart.isDirectory === true;
        });
    }
    _getSlashCommandTrackingId(message) {
        for (const part of message.parts) {
            if (part.kind === ChatRequestSlashCommandPart.Kind) {
                const slashCommand = part.slashCommand.command;
                return this._toSlashCommandTrackingId(slashCommand);
            }
            if (part.kind === ChatRequestAgentSubcommandPart.Kind) {
                const subCommand = part.command.name;
                return this._toSlashCommandTrackingId(subCommand);
            }
        }
        const trimmed = message.text.trimStart();
        const match = /^(?:@\S+\s+)?\/(init|create-(?:instructions|prompt|agent|skill)|fork)(?:\s|$)/.exec(trimmed);
        return match ? this._toSlashCommandTrackingId(match[1]) : undefined;
    }
    _toSlashCommandTrackingId(command) {
        switch (command) {
            case 'init':
            case 'create-instructions':
                return CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND;
            case 'create-prompt':
                return CREATE_PROMPT_TRACKING_COMMAND;
            case 'create-agent':
                return CREATE_AGENT_TRACKING_COMMAND;
            case 'create-skill':
                return CREATE_SKILL_TRACKING_COMMAND;
            case 'fork':
                return FORK_CONVERSATION_TRACKING_COMMAND;
            default:
                return undefined;
        }
    }
    recordSlashCommandUsage(command) {
        const trackingId = this._toSlashCommandTrackingId(command);
        if (!trackingId) {
            return;
        }
        this._tracker.recordCommandExecuted(trackingId);
        this._hideShownTipIfNowIneligible();
    }
    resetSession() {
        this._shownTip = undefined;
        this._tipRequestId = undefined;
        this._contextKeyService = undefined;
        this._tipsHiddenForSession = false;
    }
    dismissTip() {
        if (this._shownTip) {
            this._logTipTelemetry(this._shownTip.id, 'dismissed');
            const dismissed = new Set(this._getDismissedTipIds());
            dismissed.add(this._shownTip.id);
            this._storageService.store(ChatTipStorageKeys.DismissedTips, JSON.stringify([...dismissed]), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        // Keep the current tip reference so callers can navigate relative to it
        // (for example, dismiss -> next should mirror next/previous behavior).
        this._tipRequestId = undefined;
        this._onDidDismissTip.fire();
    }
    dismissTipForSession() {
        this.dismissTip();
        this.hideTipsForSession();
    }
    clearDismissedTips() {
        this._storageService.remove(ChatTipStorageKeys.DismissedTips, -1 /* StorageScope.APPLICATION */);
        this._storageService.remove(ChatTipStorageKeys.DismissedTips, 0 /* StorageScope.PROFILE */);
        this._shownTip = undefined;
        this._tipRequestId = undefined;
        this._contextKeyService = undefined;
        this._tipsHiddenForSession = false;
        this._onDidDismissTip.fire();
    }
    _getDismissedTipIds() {
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
            const dismissed = new Set();
            for (const value of parsed) {
                if (typeof value === 'string' && knownTipIds.has(value)) {
                    dismissed.add(value);
                }
            }
            return [...dismissed];
        }
        catch {
            return [];
        }
    }
    hideTip() {
        if (this._shownTip) {
            this._logTipTelemetry(this._shownTip.id, 'hidden');
        }
        this._shownTip = undefined;
        this._tipRequestId = undefined;
        this._onDidHideTip.fire();
    }
    hideTipsForSession() {
        if (this._tipsHiddenForSession) {
            return;
        }
        this._tipsHiddenForSession = true;
        this._shownTip = undefined;
        this._tipRequestId = undefined;
        this._onDidHideTip.fire();
    }
    async disableTips() {
        if (this._shownTip) {
            this._logTipTelemetry(this._shownTip.id, 'disabled');
        }
        this._shownTip = undefined;
        this._tipRequestId = undefined;
        await this._configurationService.updateValue('chat.tips.enabled', false, 1 /* ConfigurationTarget.APPLICATION */);
        this._onDidDisableTips.fire();
    }
    getWelcomeTip(contextKeyService) {
        this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
        // Always record the current mode so that mode-based exclusions are
        // persisted even on stable-rerender paths (e.g. user switches to Plan
        // mode while viewing the Plan tip).
        this._tracker.recordCurrentMode(contextKeyService);
        this._tracker.refreshPromptFileExclusions();
        // Check if tips are enabled
        if (!this._configurationService.getValue('chat.tips.enabled')) {
            return undefined;
        }
        if (this._tipsHiddenForSession) {
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
        // Only show tips when there is exactly one foreground chat session visible.
        const foregroundSessionCount = contextKeyService.getContextKeyValue(ChatContextKeys.foregroundSessionCount.key);
        if (foregroundSessionCount !== 1) {
            return undefined;
        }
        // Don't show tips when chat quota is exceeded, the upgrade widget is more relevant
        if (this._isChatQuotaExceeded(contextKeyService)) {
            return undefined;
        }
        // Return the already-shown tip for stable rerenders
        if (this._tipRequestId === 'welcome' && this._shownTip) {
            if (this._shownTip.id !== 'tip.switchToAuto') {
                const switchToAutoTip = TIP_CATALOG.find(tip => tip.id === 'tip.switchToAuto');
                if (switchToAutoTip) {
                    const dismissedIds = new Set(this._getDismissedTipIds());
                    if (!dismissedIds.has(switchToAutoTip.id) && this._isEligible(switchToAutoTip, contextKeyService)) {
                        this._shownTip = switchToAutoTip;
                        this._storageService.store(ChatTipStorageKeys.LastTipId, switchToAutoTip.id, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                        const tip = this._createTip(switchToAutoTip);
                        this._logTipTelemetry(switchToAutoTip.id, 'shown');
                        this._trackTipCommandClicks(switchToAutoTip);
                        this._onDidNavigateTip.fire(tip);
                        return tip;
                    }
                }
            }
            if (!this._isEligible(this._shownTip, contextKeyService)) {
                if (this._tracker.isExcluded(this._shownTip)) {
                    this.hideTip();
                    return undefined;
                }
                const nextTip = this._findNextEligibleTip(this._shownTip.id, contextKeyService);
                if (nextTip) {
                    this._shownTip = nextTip;
                    this._storageService.store(ChatTipStorageKeys.LastTipId, nextTip.id, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                    const tip = this._createTip(nextTip);
                    this._onDidNavigateTip.fire(tip);
                    return tip;
                }
                this.hideTip();
                return undefined;
            }
            return this._createTip(this._shownTip);
        }
        const tip = this._pickTip('welcome', contextKeyService);
        return tip;
    }
    _findNextEligibleTip(currentTipId, contextKeyService) {
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
    _hideShownTipIfNowIneligible() {
        if (!this._shownTip || !this._contextKeyService) {
            return;
        }
        if (this._tipsHiddenForSession) {
            return;
        }
        if (this._isEligible(this._shownTip, this._contextKeyService)) {
            return;
        }
        this.hideTip();
    }
    _pickTip(sourceId, contextKeyService) {
        this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
        // Record the current mode for future eligibility decisions.
        this._tracker.recordCurrentMode(contextKeyService);
        const dismissedIds = new Set(this._getDismissedTipIds());
        const eligibleTips = TIP_CATALOG.filter(tip => !dismissedIds.has(tip.id) && this._isEligible(tip, contextKeyService));
        const selectedTip = this._selectTipByTier(eligibleTips);
        if (!selectedTip) {
            return undefined;
        }
        // Persist the selected tip ID for compatibility with existing storage consumers.
        this._storageService.store(ChatTipStorageKeys.LastTipId, selectedTip.id, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        // Record that we've shown a tip this session
        this._tipRequestId = sourceId;
        this._shownTip = selectedTip;
        this._logTipTelemetry(selectedTip.id, 'shown');
        this._trackTipCommandClicks(selectedTip);
        return this._createTip(selectedTip);
    }
    _selectTipByTier(eligibleTips) {
        const foundationalTips = eligibleTips.filter(tip => tip.tier === "foundational" /* ChatTipTier.Foundational */);
        if (foundationalTips.length) {
            return this._sortByPriorityAndCatalogOrder(foundationalTips)[0];
        }
        const qolTips = eligibleTips.filter(tip => tip.tier === "qol" /* ChatTipTier.Qol */);
        if (!qolTips.length) {
            return undefined;
        }
        const randomIndex = Math.floor(Math.random() * qolTips.length);
        return qolTips[randomIndex];
    }
    navigateToNextTip() {
        if (!this._contextKeyService) {
            return undefined;
        }
        return this._navigateTip(1, this._contextKeyService);
    }
    navigateToPreviousTip() {
        if (!this._contextKeyService) {
            return undefined;
        }
        return this._navigateTip(-1, this._contextKeyService);
    }
    getNextEligibleTip() {
        if (!this._contextKeyService || !this._shownTip) {
            return undefined;
        }
        const contextKeyService = this._contextKeyService;
        this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
        const currentTipId = this._shownTip.id;
        const orderedTips = this._getOrderedEligibleTips(contextKeyService, { includeTipId: currentTipId });
        if (!orderedTips.length) {
            return undefined;
        }
        const currentIndex = orderedTips.findIndex(tip => tip.id === currentTipId);
        const candidate = this._getNextTipFromOrderedList(orderedTips, currentIndex, currentTipId);
        if (candidate) {
            // Found the next eligible tip - update state and return it
            this._shownTip = candidate;
            this._tipRequestId = 'welcome';
            this._storageService.store(ChatTipStorageKeys.LastTipId, candidate.id, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
            this._logTipTelemetry(candidate.id, 'shown');
            this._trackTipCommandClicks(candidate);
            return this._createTip(candidate);
        }
        return undefined;
    }
    _getNextTipFromOrderedList(orderedTips, startIndex, currentTipId) {
        if (!orderedTips.length) {
            return undefined;
        }
        const fallbackIndex = 0;
        const normalizedStartIndex = startIndex === -1 ? fallbackIndex : startIndex;
        for (let i = 1; i <= orderedTips.length; i++) {
            const index = (normalizedStartIndex + i) % orderedTips.length;
            const candidate = orderedTips[index];
            if (candidate.id !== currentTipId) {
                return candidate;
            }
        }
        return undefined;
    }
    hasMultipleTips() {
        if (!this._contextKeyService) {
            return false;
        }
        this._createSlashCommandsUsageTracker.syncContextKey(this._contextKeyService);
        return this._hasNavigableTip(this._contextKeyService);
    }
    _navigateTip(direction, contextKeyService) {
        this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
        if (!this._shownTip) {
            return undefined;
        }
        const orderedTips = this._getOrderedEligibleTips(contextKeyService);
        if (!orderedTips.length) {
            return undefined;
        }
        const currentIndex = orderedTips.findIndex(tip => tip.id === this._shownTip.id);
        if (orderedTips.length === 1 && currentIndex !== -1) {
            return undefined;
        }
        const fallbackIndex = direction === 1 ? 0 : orderedTips.length - 1;
        const nextIndex = currentIndex === -1
            ? fallbackIndex
            : (currentIndex + direction + orderedTips.length) % orderedTips.length;
        const candidate = orderedTips[nextIndex];
        if (candidate) {
            this._logTipTelemetry(this._shownTip.id, direction === 1 ? 'navigateNext' : 'navigatePrevious');
            this._shownTip = candidate;
            this._tipRequestId = 'welcome';
            this._storageService.store(ChatTipStorageKeys.LastTipId, candidate.id, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
            this._logTipTelemetry(candidate.id, 'shown');
            this._trackTipCommandClicks(candidate);
            const tip = this._createTip(candidate);
            this._onDidNavigateTip.fire(tip);
            return tip;
        }
        return undefined;
    }
    _hasNavigableTip(contextKeyService) {
        const orderedTips = this._getOrderedEligibleTips(contextKeyService);
        if (!orderedTips.length) {
            return false;
        }
        if (!this._shownTip) {
            return orderedTips.length > 1;
        }
        if (orderedTips.length > 1) {
            return true;
        }
        return orderedTips[0].id !== this._shownTip.id;
    }
    _getOrderedEligibleTips(contextKeyService, options) {
        const dismissedIds = new Set(this._getDismissedTipIds());
        const eligibleTips = TIP_CATALOG.filter(tip => {
            if (options?.includeTipId && tip.id === options.includeTipId) {
                return true;
            }
            if (options?.excludeShownTip && this._shownTip && tip.id === this._shownTip.id) {
                return false;
            }
            return !dismissedIds.has(tip.id) && this._isEligible(tip, contextKeyService);
        });
        const foundationalTips = this._sortByPriorityAndCatalogOrder(eligibleTips.filter(tip => tip.tier === "foundational" /* ChatTipTier.Foundational */));
        const qolTips = this._sortByPriorityAndCatalogOrder(eligibleTips.filter(tip => tip.tier === "qol" /* ChatTipTier.Qol */));
        return [...foundationalTips, ...qolTips];
    }
    _sortByPriorityAndCatalogOrder(tips) {
        return [...tips].sort((a, b) => {
            const aPriority = a.priority ?? Number.POSITIVE_INFINITY;
            const bPriority = b.priority ?? Number.POSITIVE_INFINITY;
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }
            const aCatalogIndex = TIP_CATALOG.findIndex(tip => tip.id === a.id);
            const bCatalogIndex = TIP_CATALOG.findIndex(tip => tip.id === b.id);
            return aCatalogIndex - bCatalogIndex;
        });
    }
    _isEligible(tip, contextKeyService) {
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
        if (tip.id === 'tip.thinkingPhrases' && this._thinkingPhrasesEverModified) {
            this._logService.debug('#ChatTips: tip excluded because thinking phrases setting was previously modified', tip.id);
            return false;
        }
        this._logService.debug('#ChatTips: tip is eligible', tip.id);
        return true;
    }
    _isSettingModified(key) {
        const inspected = this._configurationService.inspect(key);
        return inspected.userValue !== undefined
            || inspected.userLocalValue !== undefined
            || inspected.userRemoteValue !== undefined
            || inspected.workspaceValue !== undefined
            || inspected.workspaceFolderValue !== undefined;
    }
    _getCurrentChatModelId(contextKeyService) {
        const normalize = (modelId) => {
            const normalizedModelId = modelId?.toLowerCase() ?? '';
            if (!normalizedModelId) {
                return '';
            }
            if (normalizedModelId.includes('/')) {
                return normalizedModelId.split('/').at(-1) ?? '';
            }
            return normalizedModelId;
        };
        const contextKeyModelId = normalize(contextKeyService.getContextKeyValue(ChatContextKeys.chatModelId.key));
        if (contextKeyModelId) {
            return contextKeyModelId;
        }
        const location = contextKeyService.getContextKeyValue(ChatContextKeys.location.key) ?? ChatAgentLocation.Chat;
        const sessionType = contextKeyService.getContextKeyValue(ChatContextKeys.chatSessionType.key) ?? '';
        const candidateStorageKeys = sessionType
            ? [`chat.currentLanguageModel.${location}.${sessionType}`, `chat.currentLanguageModel.${location}`]
            : [`chat.currentLanguageModel.${location}`];
        for (const storageKey of candidateStorageKeys) {
            const persistedModelIdentifier = this._storageService.get(storageKey, -1 /* StorageScope.APPLICATION */);
            const persistedModelId = normalize(persistedModelIdentifier);
            if (persistedModelId) {
                return persistedModelId;
            }
        }
        return '';
    }
    _isChatLocation(contextKeyService) {
        const location = contextKeyService.getContextKeyValue(ChatContextKeys.location.key);
        return !location || location === ChatAgentLocation.Chat;
    }
    _isChatQuotaExceeded(contextKeyService) {
        return contextKeyService.getContextKeyValue(ChatContextKeys.chatQuotaExceeded.key) === true;
    }
    _isCopilotEnabled() {
        const defaultChatAgent = this._productService.defaultChatAgent;
        return !!defaultChatAgent?.chatExtensionId;
    }
    _createTip(tipDef) {
        // Build the tip message with dynamic keybindings and command labels
        const ctx = { keybindingService: this._keybindingService };
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
    _logTipTelemetry(tipId, action, commandId) {
        this._telemetryService.publicLog2('chatTip', {
            tipId,
            action,
            commandId,
        });
    }
    _trackTipCommandClicks(tip) {
        this._tipCommandListener.clear();
        // Build message to extract enabled commands dynamically
        const ctx = { keybindingService: this._keybindingService };
        const rawMessage = tip.buildMessage(ctx);
        const enabledCommands = extractCommandIds(rawMessage.value);
        if (!enabledCommands.length) {
            return;
        }
        const enabledCommandSet = new Set(enabledCommands);
        this._tipCommandListener.value = this._commandService.onDidExecuteCommand(e => {
            if (enabledCommandSet.has(e.commandId) && this._shownTip?.id === tip.id) {
                this._logTipTelemetry(tip.id, 'commandClicked', e.commandId);
                this.dismissTipForSession();
            }
        });
    }
    _readApplicationWithProfileFallback(key) {
        const applicationValue = this._storageService.get(key, -1 /* StorageScope.APPLICATION */);
        if (applicationValue) {
            return applicationValue;
        }
        const profileValue = this._storageService.get(key, 0 /* StorageScope.PROFILE */);
        if (profileValue) {
            this._storageService.store(key, profileValue, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        return profileValue;
    }
};
ChatTipService = __decorate([
    __param(0, IProductService),
    __param(1, IConfigurationService),
    __param(2, IStorageService),
    __param(3, IChatService),
    __param(4, IInstantiationService),
    __param(5, ILogService),
    __param(6, IChatEntitlementService),
    __param(7, ICommandService),
    __param(8, ITelemetryService),
    __param(9, IKeybindingService)
], ChatTipService);
export { ChatTipService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRpcFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFRpcFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUV4RSxPQUFPLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDcEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM5RSxPQUFPLEVBQXVCLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDeEgsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxlQUFlLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5REFB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