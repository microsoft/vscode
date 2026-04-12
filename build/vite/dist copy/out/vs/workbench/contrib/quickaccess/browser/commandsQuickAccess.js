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
var CommandsQuickAccessProvider_1;
import { isFirefox } from '../../../../base/browser/browser.js';
import { raceTimeout, timeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { Language } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { AbstractEditorCommandsQuickAccessProvider } from '../../../../editor/contrib/quickAccess/browser/commandsQuickAccess.js';
import { localize, localize2 } from '../../../../nls.js';
import { isLocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { CommandsHistory } from '../../../../platform/quickinput/browser/commandsQuickAccess.js';
import { TriggerAction } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { DefaultQuickAccessFilterValue } from '../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IAiRelatedInformationService, RelatedInformationType } from '../../../services/aiRelatedInformation/common/aiRelatedInformation.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { createKeybindingCommandQuery } from '../../../services/preferences/browser/keybindingsEditorModel.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { CHAT_OPEN_ACTION_ID } from '../../chat/browser/actions/chatActions.js';
import { ASK_QUICK_QUESTION_ACTION_ID } from '../../chat/browser/actions/chatQuickInputActions.js';
import { IChatAgentService } from '../../chat/common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
let CommandsQuickAccessProvider = class CommandsQuickAccessProvider extends AbstractEditorCommandsQuickAccessProvider {
    static { CommandsQuickAccessProvider_1 = this; }
    static { this.AI_RELATED_INFORMATION_MAX_PICKS = 5; }
    static { this.AI_RELATED_INFORMATION_DEBOUNCE = 200; }
    get activeTextEditorControl() { return this.editorService.activeTextEditorControl; }
    get defaultFilterValue() {
        if (this.configuration.preserveInput) {
            return DefaultQuickAccessFilterValue.LAST;
        }
        return undefined;
    }
    constructor(editorService, menuService, extensionService, instantiationService, keybindingService, commandService, telemetryService, dialogService, configurationService, editorGroupService, preferencesService, productService, aiRelatedInformationService, chatAgentService) {
        super({
            showAlias: !Language.isDefaultVariant(),
            noResultsPick: () => ({
                label: localize('noCommandResults', "No matching commands"),
                commandId: ''
            }),
        }, instantiationService, keybindingService, commandService, telemetryService, dialogService);
        this.editorService = editorService;
        this.menuService = menuService;
        this.configurationService = configurationService;
        this.editorGroupService = editorGroupService;
        this.preferencesService = preferencesService;
        this.productService = productService;
        this.aiRelatedInformationService = aiRelatedInformationService;
        this.chatAgentService = chatAgentService;
        this.useAiRelatedInfo = false;
        this.extensionRegistrationRace = raceTimeout(extensionService.whenInstalledExtensionsRegistered(), 800);
        this._register(configurationService.onDidChangeConfiguration((e) => this.updateOptions(e)));
        this.updateOptions();
    }
    get configuration() {
        const commandPaletteConfig = this.configurationService.getValue().workbench.commandPalette;
        return {
            preserveInput: commandPaletteConfig.preserveInput,
            showAskInChat: commandPaletteConfig.showAskInChat,
            experimental: commandPaletteConfig.experimental
        };
    }
    updateOptions(e) {
        if (e && !e.affectsConfiguration('workbench.commandPalette.experimental')) {
            return;
        }
        const config = this.configuration;
        const suggestedCommandIds = config.experimental.suggestCommands && this.productService.commandPaletteSuggestedCommandIds?.length
            ? new Set(this.productService.commandPaletteSuggestedCommandIds)
            : undefined;
        this.options.suggestedCommandIds = suggestedCommandIds;
        this.useAiRelatedInfo = config.experimental.enableNaturalLanguageSearch;
    }
    async getCommandPicks(token) {
        // wait for extensions registration or 800ms once
        await this.extensionRegistrationRace;
        if (token.isCancellationRequested) {
            return [];
        }
        return [
            ...this.getCodeEditorCommandPicks(),
            ...this.getGlobalCommandPicks()
        ].map(picks => ({
            ...picks,
            buttons: [{
                    iconClass: ThemeIcon.asClassName(Codicon.gear),
                    tooltip: localize('configure keybinding', "Configure Keybinding"),
                }],
            trigger: () => {
                this.preferencesService.openGlobalKeybindingSettings(false, { query: createKeybindingCommandQuery(picks.commandId, picks.commandWhen) });
                return TriggerAction.CLOSE_PICKER;
            },
        }));
    }
    hasAdditionalCommandPicks(filter, token) {
        if (!this.useAiRelatedInfo
            || token.isCancellationRequested
            || filter === ''
            || !this.aiRelatedInformationService.isEnabled()) {
            return false;
        }
        return true;
    }
    async getAdditionalCommandPicks(allPicks, picksSoFar, filter, token) {
        if (!this.hasAdditionalCommandPicks(filter, token)) {
            return [];
        }
        let additionalPicks = [];
        try {
            // Wait a bit to see if the user is still typing
            await timeout(CommandsQuickAccessProvider_1.AI_RELATED_INFORMATION_DEBOUNCE, token);
            additionalPicks = await this.getRelatedInformationPicks(allPicks, picksSoFar, filter, token);
        }
        catch (e) {
            // Ignore and continue to add "Ask in Chat" option
        }
        // If enabled in settings, add "Ask in Chat" option after a separator (if needed).
        if (this.configuration.showAskInChat) {
            const defaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
            if (defaultAgent) {
                if (picksSoFar.length || additionalPicks.length) {
                    additionalPicks.push({
                        type: 'separator'
                    });
                }
                additionalPicks.push({
                    label: localize('commandsQuickAccess.askInChat', "Ask in Chat: {0}", filter),
                    commandId: this.configuration.experimental.askChatLocation === 'quickChat' ? ASK_QUICK_QUESTION_ACTION_ID : CHAT_OPEN_ACTION_ID,
                    args: [filter],
                    buttons: [{
                            iconClass: ThemeIcon.asClassName(Codicon.gear),
                            tooltip: localize('commandsQuickAccess.configureAskInChatSetting', "Configure visibility"),
                        }],
                    trigger: () => {
                        void this.preferencesService.openSettings({ jsonEditor: false, query: 'workbench.commandPalette.showAskInChat' });
                        return TriggerAction.CLOSE_PICKER;
                    },
                });
            }
        }
        return additionalPicks;
    }
    async getRelatedInformationPicks(allPicks, picksSoFar, filter, token) {
        const relatedInformation = await this.aiRelatedInformationService.getRelatedInformation(filter, [RelatedInformationType.CommandInformation], token);
        // Sort by weight descending to get the most relevant results first
        relatedInformation.sort((a, b) => b.weight - a.weight);
        const setOfPicksSoFar = new Set(picksSoFar.map(p => p.commandId));
        const additionalPicks = new Array();
        for (const info of relatedInformation) {
            if (additionalPicks.length === CommandsQuickAccessProvider_1.AI_RELATED_INFORMATION_MAX_PICKS) {
                break;
            }
            const pick = allPicks.find(p => p.commandId === info.command && !setOfPicksSoFar.has(p.commandId));
            if (pick) {
                additionalPicks.push(pick);
            }
        }
        return additionalPicks;
    }
    getGlobalCommandPicks() {
        const globalCommandPicks = [];
        const scopedContextKeyService = this.editorService.activeEditorPane?.scopedContextKeyService || this.editorGroupService.activeGroup.scopedContextKeyService;
        const globalCommandsMenu = this.menuService.getMenuActions(MenuId.CommandPalette, scopedContextKeyService);
        const globalCommandsMenuActions = globalCommandsMenu
            .reduce((r, [, actions]) => [...r, ...actions], [])
            .filter(action => action instanceof MenuItemAction && action.enabled);
        for (const action of globalCommandsMenuActions) {
            // Label
            let label = (typeof action.item.title === 'string' ? action.item.title : action.item.title.value) || action.item.id;
            // Category
            const category = typeof action.item.category === 'string' ? action.item.category : action.item.category?.value;
            if (category) {
                label = localize('commandWithCategory', "{0}: {1}", category, label);
            }
            // Alias
            const aliasLabel = typeof action.item.title !== 'string' ? action.item.title.original : undefined;
            const aliasCategory = (category && action.item.category && typeof action.item.category !== 'string') ? action.item.category.original : undefined;
            const commandAlias = (aliasLabel && category) ?
                aliasCategory ? `${aliasCategory}: ${aliasLabel}` : `${category}: ${aliasLabel}` :
                aliasLabel;
            const metadataDescription = action.item.metadata?.description;
            const commandDescription = metadataDescription === undefined || isLocalizedString(metadataDescription)
                ? metadataDescription
                // TODO: this type will eventually not be a string and when that happens, this should simplified.
                : { value: metadataDescription, original: metadataDescription };
            globalCommandPicks.push({
                commandId: action.item.id,
                commandWhen: action.item.precondition?.serialize(),
                commandAlias,
                label: stripIcons(label),
                commandDescription,
                commandCategory: category,
            });
        }
        return globalCommandPicks;
    }
};
CommandsQuickAccessProvider = CommandsQuickAccessProvider_1 = __decorate([
    __param(0, IEditorService),
    __param(1, IMenuService),
    __param(2, IExtensionService),
    __param(3, IInstantiationService),
    __param(4, IKeybindingService),
    __param(5, ICommandService),
    __param(6, ITelemetryService),
    __param(7, IDialogService),
    __param(8, IConfigurationService),
    __param(9, IEditorGroupsService),
    __param(10, IPreferencesService),
    __param(11, IProductService),
    __param(12, IAiRelatedInformationService),
    __param(13, IChatAgentService)
], CommandsQuickAccessProvider);
export { CommandsQuickAccessProvider };
//#region Actions
export class ShowAllCommandsAction extends Action2 {
    static { this.ID = 'workbench.action.showCommands'; }
    constructor() {
        super({
            id: ShowAllCommandsAction.ID,
            title: localize2('showTriggerActions', 'Show All Commands'),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: undefined,
                primary: !isFirefox ? (2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 46 /* KeyCode.KeyP */) : undefined,
                secondary: [59 /* KeyCode.F1 */]
            },
            f1: true
        });
    }
    async run(accessor) {
        accessor.get(IQuickInputService).quickAccess.show(CommandsQuickAccessProvider.PREFIX);
    }
}
export class ClearCommandHistoryAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.clearCommandHistory',
            title: localize2('clearCommandHistory', 'Clear Command History'),
            f1: true
        });
    }
    async run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const storageService = accessor.get(IStorageService);
        const dialogService = accessor.get(IDialogService);
        const commandHistoryLength = CommandsHistory.getConfiguredCommandHistoryLength(configurationService);
        if (commandHistoryLength > 0) {
            // Ask for confirmation
            const { confirmed } = await dialogService.confirm({
                type: 'warning',
                message: localize('confirmClearMessage', "Do you want to clear the history of recently used commands?"),
                detail: localize('confirmClearDetail', "This action is irreversible!"),
                primaryButton: localize({ key: 'clearButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Clear")
            });
            if (!confirmed) {
                return;
            }
            CommandsHistory.clearHistory(configurationService, storageService);
        }
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZHNRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3F1aWNrYWNjZXNzL2Jyb3dzZXIvY29tbWFuZHNRdWlja0FjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSx5Q0FBeUMsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDakYsT0FBTyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLGNBQWMsRUFBcUIsTUFBTSxnREFBZ0QsQ0FBQztBQUNsSSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUE2QixxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzlILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxF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