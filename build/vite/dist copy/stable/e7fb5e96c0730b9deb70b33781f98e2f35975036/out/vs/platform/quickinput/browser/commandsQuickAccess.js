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
var AbstractCommandsQuickAccessProvider_1, CommandsHistory_1;
import { Codicon } from '../../../base/common/codicons.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { matchesBaseContiguousSubString, matchesWords, or } from '../../../base/common/filters.js';
import { createSingleCallFunction } from '../../../base/common/functional.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { LRUCache } from '../../../base/common/map.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { TfIdfCalculator, normalizeTfIdfScores } from '../../../base/common/tfIdf.js';
import { localize } from '../../../nls.js';
import { ICommandService } from '../../commands/common/commands.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IDialogService } from '../../dialogs/common/dialogs.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { ILogService } from '../../log/common/log.js';
import { PickerQuickAccessProvider, TriggerAction } from './pickerQuickAccess.js';
import { IStorageService, WillSaveStateReason } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { Categories } from '../../action/common/actionCommonCategories.js';
let AbstractCommandsQuickAccessProvider = class AbstractCommandsQuickAccessProvider extends PickerQuickAccessProvider {
    static { AbstractCommandsQuickAccessProvider_1 = this; }
    static { this.PREFIX = '>'; }
    static { this.TFIDF_THRESHOLD = 0.5; }
    static { this.TFIDF_MAX_RESULTS = 5; }
    static { this.WORD_FILTER = or(matchesBaseContiguousSubString, matchesWords); }
    constructor(options, instantiationService, keybindingService, commandService, telemetryService, dialogService) {
        super(AbstractCommandsQuickAccessProvider_1.PREFIX, options);
        this.keybindingService = keybindingService;
        this.commandService = commandService;
        this.telemetryService = telemetryService;
        this.dialogService = dialogService;
        this.commandsHistory = this._register(instantiationService.createInstance(CommandsHistory));
        this.options = options;
    }
    async _getPicks(filter, _disposables, token, runOptions) {
        // Ask subclass for all command picks
        const allCommandPicks = await this.getCommandPicks(token);
        if (token.isCancellationRequested) {
            return [];
        }
        const runTfidf = createSingleCallFunction(() => {
            const tfidf = new TfIdfCalculator();
            tfidf.updateDocuments(allCommandPicks.map(commandPick => ({
                key: commandPick.commandId,
                textChunks: [this.getTfIdfChunk(commandPick)]
            })));
            const result = tfidf.calculateScores(filter, token);
            return normalizeTfIdfScores(result)
                .filter(score => score.score > AbstractCommandsQuickAccessProvider_1.TFIDF_THRESHOLD)
                .slice(0, AbstractCommandsQuickAccessProvider_1.TFIDF_MAX_RESULTS);
        });
        // Filter
        const filteredCommandPicks = [];
        for (const commandPick of allCommandPicks) {
            const labelHighlights = AbstractCommandsQuickAccessProvider_1.WORD_FILTER(filter, commandPick.label) ?? undefined;
            let aliasHighlights;
            if (commandPick.commandAlias) {
                aliasHighlights = AbstractCommandsQuickAccessProvider_1.WORD_FILTER(filter, commandPick.commandAlias) ?? undefined;
            }
            // Add if matching in label or alias
            if (labelHighlights || aliasHighlights) {
                commandPick.highlights = {
                    label: labelHighlights,
                    detail: this.options.showAlias ? aliasHighlights : undefined
                };
                filteredCommandPicks.push(commandPick);
            }
            // Also add if we have a 100% command ID match
            else if (filter === commandPick.commandId) {
                filteredCommandPicks.push(commandPick);
            }
            // Handle tf-idf scoring for the rest if there's a filter
            else if (filter.length >= 3) {
                const tfidf = runTfidf();
                if (token.isCancellationRequested) {
                    return [];
                }
                // Add if we have a tf-idf score
                const tfidfScore = tfidf.find(score => score.key === commandPick.commandId);
                if (tfidfScore) {
                    commandPick.tfIdfScore = tfidfScore.score;
                    filteredCommandPicks.push(commandPick);
                }
            }
        }
        // Add description to commands that have duplicate labels
        const mapLabelToCommand = new Map();
        for (const commandPick of filteredCommandPicks) {
            const existingCommandForLabel = mapLabelToCommand.get(commandPick.label);
            if (existingCommandForLabel) {
                commandPick.description = commandPick.commandId;
                existingCommandForLabel.description = existingCommandForLabel.commandId;
            }
            else {
                mapLabelToCommand.set(commandPick.label, commandPick);
            }
        }
        // Sort by MRU order and fallback to name otherwise
        filteredCommandPicks.sort((commandPickA, commandPickB) => {
            // If a result came from tf-idf, we want to put that towards the bottom
            if (commandPickA.tfIdfScore && commandPickB.tfIdfScore) {
                if (commandPickA.tfIdfScore === commandPickB.tfIdfScore) {
                    return commandPickA.label.localeCompare(commandPickB.label); // prefer lexicographically smaller command
                }
                return commandPickB.tfIdfScore - commandPickA.tfIdfScore; // prefer higher tf-idf score
            }
            else if (commandPickA.tfIdfScore) {
                return 1; // first command has a score but other doesn't so other wins
            }
            else if (commandPickB.tfIdfScore) {
                return -1; // other command has a score but first doesn't so first wins
            }
            const commandACounter = this.commandsHistory.peek(commandPickA.commandId);
            const commandBCounter = this.commandsHistory.peek(commandPickB.commandId);
            if (commandACounter && commandBCounter) {
                return commandACounter > commandBCounter ? -1 : 1; // use more recently used command before older
            }
            if (commandACounter) {
                return -1; // first command was used, so it wins over the non used one
            }
            if (commandBCounter) {
                return 1; // other command was used so it wins over the command
            }
            if (this.options.suggestedCommandIds) {
                const commandASuggestion = this.options.suggestedCommandIds.has(commandPickA.commandId);
                const commandBSuggestion = this.options.suggestedCommandIds.has(commandPickB.commandId);
                if (commandASuggestion && commandBSuggestion) {
                    return 0; // honor the order of the array
                }
                if (commandASuggestion) {
                    return -1; // first command was suggested, so it wins over the non suggested one
                }
                if (commandBSuggestion) {
                    return 1; // other command was suggested so it wins over the command
                }
            }
            // if one is Developer and the other isn't, put non-Developer first
            const isDeveloperA = commandPickA.commandCategory === Categories.Developer.value;
            const isDeveloperB = commandPickB.commandCategory === Categories.Developer.value;
            if (isDeveloperA && !isDeveloperB) {
                return 1;
            }
            if (!isDeveloperA && isDeveloperB) {
                return -1;
            }
            // both commands were never used, so we sort by name
            return commandPickA.label.localeCompare(commandPickB.label);
        });
        const commandPicks = [];
        let addOtherSeparator = false;
        let addSuggestedSeparator = true;
        let addCommonlyUsedSeparator = !!this.options.suggestedCommandIds;
        for (let i = 0; i < filteredCommandPicks.length; i++) {
            const commandPick = filteredCommandPicks[i];
            const isInHistory = !!this.commandsHistory.peek(commandPick.commandId);
            // Separator: recently used
            if (i === 0 && isInHistory) {
                commandPicks.push({ type: 'separator', label: localize('recentlyUsed', "recently used") });
                addOtherSeparator = true;
            }
            if (addSuggestedSeparator && commandPick.tfIdfScore !== undefined) {
                commandPicks.push({ type: 'separator', label: localize('suggested', "similar commands") });
                addSuggestedSeparator = false;
            }
            // Separator: commonly used
            if (addCommonlyUsedSeparator && commandPick.tfIdfScore === undefined && !isInHistory && this.options.suggestedCommandIds?.has(commandPick.commandId)) {
                commandPicks.push({ type: 'separator', label: localize('commonlyUsed', "commonly used") });
                addOtherSeparator = true;
                addCommonlyUsedSeparator = false;
            }
            // Separator: other commands
            if (addOtherSeparator && commandPick.tfIdfScore === undefined && !isInHistory && !this.options.suggestedCommandIds?.has(commandPick.commandId)) {
                commandPicks.push({ type: 'separator', label: localize('morecCommands', "other commands") });
                addOtherSeparator = false;
            }
            // Command
            commandPicks.push(this.toCommandPick(commandPick, runOptions, isInHistory));
        }
        if (!this.hasAdditionalCommandPicks(filter, token)) {
            return commandPicks;
        }
        return {
            picks: commandPicks,
            additionalPicks: (async () => {
                const additionalCommandPicks = await this.getAdditionalCommandPicks(allCommandPicks, filteredCommandPicks, filter, token);
                if (token.isCancellationRequested) {
                    return [];
                }
                const commandPicks = additionalCommandPicks.map(commandPick => this.toCommandPick(commandPick, runOptions));
                // Basically, if we haven't already added a separator, we add one before the additional picks so long
                // as one hasn't been added to the start of the array.
                if (addSuggestedSeparator && commandPicks[0]?.type !== 'separator') {
                    commandPicks.unshift({ type: 'separator', label: localize('suggested', "similar commands") });
                }
                return commandPicks;
            })()
        };
    }
    toCommandPick(commandPick, runOptions, isRecentlyUsed = false) {
        if (commandPick.type === 'separator') {
            return commandPick;
        }
        const tooltip = commandPick.tooltip
            ?? commandPick.commandDescription?.value;
        const keybinding = this.keybindingService.lookupKeybinding(commandPick.commandId);
        const ariaLabel = keybinding ?
            localize('commandPickAriaLabelWithKeybinding', "{0}, {1}", commandPick.label, keybinding.getAriaLabel()) :
            commandPick.label;
        // Add remove button for recently used items (as the last button, to the right)
        const existingButtons = commandPick.buttons || [];
        const buttons = isRecentlyUsed ? [
            ...existingButtons,
            {
                iconClass: ThemeIcon.asClassName(Codicon.close),
                tooltip: localize('removeFromRecentlyUsed', "Remove from Recently Used")
            }
        ] : commandPick.buttons;
        return {
            ...commandPick,
            tooltip,
            ariaLabel,
            detail: this.options.showAlias && commandPick.commandAlias !== commandPick.label ? commandPick.commandAlias : undefined,
            keybinding,
            buttons,
            accept: async () => {
                // Add to history
                this.commandsHistory.push(commandPick.commandId);
                // Telementry
                this.telemetryService.publicLog2('workbenchActionExecuted', {
                    id: commandPick.commandId,
                    from: runOptions?.from ?? 'quick open'
                });
                // Run
                try {
                    commandPick.args?.length
                        ? await this.commandService.executeCommand(commandPick.commandId, ...commandPick.args)
                        : await this.commandService.executeCommand(commandPick.commandId);
                }
                catch (error) {
                    if (!isCancellationError(error)) {
                        this.dialogService.error(localize('canNotRun', "Command '{0}' resulted in an error", commandPick.label), toErrorMessage(error));
                    }
                }
            },
            trigger: isRecentlyUsed ? (buttonIndex, keyMods) => {
                // The remove button is now the last button
                const removeButtonIndex = existingButtons.length;
                if (buttonIndex === removeButtonIndex) {
                    this.commandsHistory.remove(commandPick.commandId);
                    return TriggerAction.REMOVE_ITEM;
                }
                // Handle other buttons (e.g., configure keybinding button)
                if (commandPick.trigger) {
                    return commandPick.trigger(buttonIndex, keyMods);
                }
                return TriggerAction.NO_ACTION;
            } : commandPick.trigger
        };
    }
    // TF-IDF string to be indexed
    getTfIdfChunk({ label, commandAlias, commandDescription }) {
        let chunk = label;
        if (commandAlias && commandAlias !== label) {
            chunk += ` - ${commandAlias}`;
        }
        if (commandDescription && commandDescription.value !== label) {
            // If the original is the same as the value, don't add it
            chunk += ` - ${commandDescription.value === commandDescription.original ? commandDescription.value : `${commandDescription.value} (${commandDescription.original})`}`;
        }
        return chunk;
    }
};
AbstractCommandsQuickAccessProvider = AbstractCommandsQuickAccessProvider_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IKeybindingService),
    __param(3, ICommandService),
    __param(4, ITelemetryService),
    __param(5, IDialogService)
], AbstractCommandsQuickAccessProvider);
export { AbstractCommandsQuickAccessProvider };
let CommandsHistory = class CommandsHistory extends Disposable {
    static { CommandsHistory_1 = this; }
    static { this.DEFAULT_COMMANDS_HISTORY_LENGTH = 50; }
    static { this.PREF_KEY_CACHE = 'commandPalette.mru.cache'; }
    static { this.PREF_KEY_COUNTER = 'commandPalette.mru.counter'; }
    static { this.counter = 1; }
    static { this.hasChanges = false; }
    constructor(storageService, configurationService, logService) {
        super();
        this.storageService = storageService;
        this.configurationService = configurationService;
        this.logService = logService;
        this.configuredCommandsHistoryLength = 0;
        this.updateConfiguration();
        this.load();
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.configurationService.onDidChangeConfiguration(e => this.updateConfiguration(e)));
        this._register(this.storageService.onWillSaveState(e => {
            if (e.reason === WillSaveStateReason.SHUTDOWN) {
                // Commands history is very dynamic and so we limit impact
                // on storage to only save on shutdown. This helps reduce
                // the overhead of syncing this data across machines.
                this.saveState();
            }
        }));
    }
    updateConfiguration(e) {
        if (e && !e.affectsConfiguration('workbench.commandPalette.history')) {
            return;
        }
        this.configuredCommandsHistoryLength = CommandsHistory_1.getConfiguredCommandHistoryLength(this.configurationService);
        if (CommandsHistory_1.cache && CommandsHistory_1.cache.limit !== this.configuredCommandsHistoryLength) {
            CommandsHistory_1.cache.limit = this.configuredCommandsHistoryLength;
            CommandsHistory_1.hasChanges = true;
        }
    }
    load() {
        const raw = this.storageService.get(CommandsHistory_1.PREF_KEY_CACHE, 0 /* StorageScope.PROFILE */);
        let serializedCache;
        if (raw) {
            try {
                serializedCache = JSON.parse(raw);
            }
            catch (error) {
                this.logService.error(`[CommandsHistory] invalid data: ${error}`);
            }
        }
        const cache = CommandsHistory_1.cache = new LRUCache(this.configuredCommandsHistoryLength, 1);
        if (serializedCache) {
            let entries;
            if (serializedCache.usesLRU) {
                entries = serializedCache.entries;
            }
            else {
                entries = serializedCache.entries.sort((a, b) => a.value - b.value);
            }
            entries.forEach(entry => cache.set(entry.key, entry.value));
        }
        CommandsHistory_1.counter = this.storageService.getNumber(CommandsHistory_1.PREF_KEY_COUNTER, 0 /* StorageScope.PROFILE */, CommandsHistory_1.counter);
    }
    push(commandId) {
        if (!CommandsHistory_1.cache) {
            return;
        }
        CommandsHistory_1.cache.set(commandId, CommandsHistory_1.counter++); // set counter to command
        CommandsHistory_1.hasChanges = true;
    }
    peek(commandId) {
        return CommandsHistory_1.cache?.peek(commandId);
    }
    remove(commandId) {
        if (!CommandsHistory_1.cache) {
            return;
        }
        CommandsHistory_1.cache.delete(commandId);
        CommandsHistory_1.hasChanges = true;
    }
    saveState() {
        if (!CommandsHistory_1.cache) {
            return;
        }
        if (!CommandsHistory_1.hasChanges) {
            return;
        }
        const serializedCache = { usesLRU: true, entries: [] };
        CommandsHistory_1.cache.forEach((value, key) => serializedCache.entries.push({ key, value }));
        this.storageService.store(CommandsHistory_1.PREF_KEY_CACHE, JSON.stringify(serializedCache), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.storageService.store(CommandsHistory_1.PREF_KEY_COUNTER, CommandsHistory_1.counter, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        CommandsHistory_1.hasChanges = false;
    }
    static getConfiguredCommandHistoryLength(configurationService) {
        const config = configurationService.getValue();
        const configuredCommandHistoryLength = config.workbench?.commandPalette?.history;
        if (typeof configuredCommandHistoryLength === 'number') {
            return configuredCommandHistoryLength;
        }
        return CommandsHistory_1.DEFAULT_COMMANDS_HISTORY_LENGTH;
    }
    static clearHistory(configurationService, storageService) {
        const commandHistoryLength = CommandsHistory_1.getConfiguredCommandHistoryLength(configurationService);
        CommandsHistory_1.cache = new LRUCache(commandHistoryLength);
        CommandsHistory_1.counter = 1;
        CommandsHistory_1.hasChanges = true;
    }
};
CommandsHistory = CommandsHistory_1 = __decorate([
    __param(0, IStorageService),
    __param(1, IConfigurationService),
    __param(2, ILogService)
], CommandsHistory);
export { CommandsHistory };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZHNRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9jb21tYW5kc1F1aWNrQWNjZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUloRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JFLE9BQU8sRUFBVSw4QkFBOEIsRUFBRSxZQUFZLEVBQUUsRUFBRSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDM0csT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDOUUsT0FBTyxFQUFFLFVBQVUsRUFBZ0MsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxlQUFlLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFFM0MsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBNkIscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMvRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDakUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVD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