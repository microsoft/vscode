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
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../common/promptSyntax/promptTypes.js';
import { ILanguageModelToolsService } from '../common/tools/languageModelToolsService.js';
import { TipEligibilityStorageKeys } from './chatTipStorageKeys.js';
/**
 * Tracks user-level signals that determine whether certain tips should be
 * excluded. Persists state to application storage and disposes listeners once all
 * signals of interest have been observed.
 */
let TipEligibilityTracker = class TipEligibilityTracker extends Disposable {
    constructor(tips, commandService, _storageService, _promptsService, _languageModelToolsService, _logService) {
        super();
        this._storageService = _storageService;
        this._promptsService = _promptsService;
        this._languageModelToolsService = _languageModelToolsService;
        this._logService = _logService;
        this._commandListener = this._register(new MutableDisposable());
        this._toolListener = this._register(new MutableDisposable());
        /**
         * Tip IDs excluded because prompt files of the required type exist in the workspace.
         * Tips with `excludeUntilChecked` are pre-added and removed if no files are found.
         */
        this._excludedByFiles = new Set();
        /** Generation counter per tip ID to discard stale async file-check results. */
        this._fileCheckGeneration = new Map();
        this._fileChecksInFlight = new Map();
        // --- Restore persisted state -------------------------------------------
        const storedCmds = this._readApplicationWithProfileFallback(TipEligibilityStorageKeys.ExecutedCommands);
        this._executedCommands = new Set(storedCmds ? JSON.parse(storedCmds) : []);
        const storedModes = this._readApplicationWithProfileFallback(TipEligibilityStorageKeys.UsedModes);
        this._usedModes = new Set(storedModes ? JSON.parse(storedModes) : []);
        const storedTools = this._readApplicationWithProfileFallback(TipEligibilityStorageKeys.InvokedTools);
        this._invokedTools = new Set(storedTools ? JSON.parse(storedTools) : []);
        // --- Derive what still needs tracking ----------------------------------
        this._pendingCommands = new Set();
        for (const tip of tips) {
            for (const cmd of tip.excludeWhenCommandsExecuted ?? []) {
                if (!this._executedCommands.has(cmd)) {
                    this._pendingCommands.add(cmd);
                }
            }
        }
        this._pendingModes = new Set();
        for (const tip of tips) {
            for (const mode of tip.excludeWhenModesUsed ?? []) {
                if (!this._usedModes.has(mode)) {
                    this._pendingModes.add(mode);
                }
            }
        }
        this._pendingTools = new Set();
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
                    this._persistSet(TipEligibilityStorageKeys.InvokedTools, this._invokedTools);
                }
                if (this._pendingTools.size === 0) {
                    this._toolListener.clear();
                }
            });
        }
        // --- Async file checks -------------------------------------------------
        this._tipsWithFileExclusions = tips.filter(t => t.excludeWhenPromptFilesExist);
        for (const tip of this._tipsWithFileExclusions) {
            if (tip.excludeWhenPromptFilesExist.excludeUntilChecked) {
                this._excludedByFiles.add(tip.id);
            }
            this._checkForPromptFiles(tip);
        }
        // Re-check agent file exclusions when custom agents change (covers late discovery)
        this._register(this._promptsService.onDidChangeCustomAgents(() => {
            for (const tip of this._tipsWithFileExclusions) {
                if (tip.excludeWhenPromptFilesExist.promptType === PromptsType.agent) {
                    this._checkForPromptFiles(tip);
                }
            }
        }));
    }
    recordCommandExecuted(commandId) {
        if (!this._pendingCommands.has(commandId)) {
            return;
        }
        this._executedCommands.add(commandId);
        this._persistSet(TipEligibilityStorageKeys.ExecutedCommands, this._executedCommands);
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
    recordCurrentMode(contextKeyService) {
        if (this._pendingModes.size === 0) {
            return;
        }
        let changed = false;
        const kind = contextKeyService.getContextKeyValue(ChatContextKeys.chatModeKind.key);
        if (kind && !this._usedModes.has(kind)) {
            this._usedModes.add(kind);
            this._pendingModes.delete(kind);
            changed = true;
        }
        const name = contextKeyService.getContextKeyValue(ChatContextKeys.chatModeName.key);
        if (name && !this._usedModes.has(name)) {
            this._usedModes.add(name);
            this._pendingModes.delete(name);
            changed = true;
        }
        if (changed) {
            this._persistSet(TipEligibilityStorageKeys.UsedModes, this._usedModes);
        }
    }
    /**
     * Returns `true` when the tip should be **excluded** from the eligible set.
     */
    isExcluded(tip) {
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
    refreshPromptFileExclusions() {
        for (const tip of this._tipsWithFileExclusions) {
            if (tip.excludeWhenPromptFilesExist.excludeUntilChecked) {
                this._excludedByFiles.add(tip.id);
            }
            this._checkForPromptFiles(tip);
        }
    }
    async _checkForPromptFiles(tip) {
        const inFlight = this._fileChecksInFlight.get(tip.id);
        if (inFlight) {
            await inFlight;
            return;
        }
        const checkPromise = this._doCheckForPromptFiles(tip);
        this._fileChecksInFlight.set(tip.id, checkPromise);
        try {
            await checkPromise;
        }
        finally {
            if (this._fileChecksInFlight.get(tip.id) === checkPromise) {
                this._fileChecksInFlight.delete(tip.id);
            }
        }
    }
    async _doCheckForPromptFiles(tip) {
        const config = tip.excludeWhenPromptFilesExist;
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
            }
            else {
                this._excludedByFiles.delete(tip.id);
            }
        }
        catch {
            if (this._fileCheckGeneration.get(tip.id) !== generation) {
                return;
            }
            if (config.excludeUntilChecked) {
                this._excludedByFiles.add(tip.id);
            }
        }
    }
    _persistSet(key, set) {
        this._storageService.store(key, JSON.stringify([...set]), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
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
TipEligibilityTracker = __decorate([
    __param(1, ICommandService),
    __param(2, IStorageService),
    __param(3, IPromptsService),
    __param(4, ILanguageModelToolsService),
    __param(5, ILogService)
], TipEligibilityTracker);
export { TipEligibilityTracker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRpcEVsaWdpYmlsaXR5VHJhY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0VGlwRWxpZ2liaWxpdHlUcmFja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbkYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBNEIsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDN0csT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBc0JwRTs7OztHQUlHO0FBQ0ksSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBc0IsU0FBUSxVQUFVO0lBMEJwRCxZQUNDLElBQW9DLEVBQ25CLGNBQStCLEVBQy9CLGVBQWlELEVBQ2pELGVBQWlELEVBQ3RDLDBCQUF1RSxFQUN0RixXQUF5QztRQUV0RCxLQUFLLEVBQUUsQ0FBQztRQUwwQixvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDaEMsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQ3JC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