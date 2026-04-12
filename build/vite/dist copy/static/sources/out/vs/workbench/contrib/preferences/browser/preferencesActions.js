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
import { Action } from '../../../../base/common/actions.js';
import { URI } from '../../../../base/common/uri.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import * as nls from '../../../../nls.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../platform/actions/common/actions.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { isLocalizedString } from '../../../../platform/action/common/action.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
let ConfigureLanguageBasedSettingsAction = class ConfigureLanguageBasedSettingsAction extends Action {
    static { this.ID = 'workbench.action.configureLanguageBasedSettings'; }
    static { this.LABEL = nls.localize2('configureLanguageBasedSettings', "Configure Language Specific Settings..."); }
    constructor(id, label, modelService, languageService, quickInputService, preferencesService) {
        super(id, label);
        this.modelService = modelService;
        this.languageService = languageService;
        this.quickInputService = quickInputService;
        this.preferencesService = preferencesService;
    }
    async run() {
        const languages = this.languageService.getSortedRegisteredLanguageNames();
        const picks = languages.map(({ languageName, languageId }) => {
            const description = nls.localize('languageDescriptionConfigured', "({0})", languageId);
            // construct a fake resource to be able to show nice icons if any
            let fakeResource;
            const extensions = this.languageService.getExtensions(languageId);
            if (extensions.length) {
                fakeResource = URI.file(extensions[0]);
            }
            else {
                const filenames = this.languageService.getFilenames(languageId);
                if (filenames.length) {
                    fakeResource = URI.file(filenames[0]);
                }
            }
            return {
                label: languageName,
                iconClasses: getIconClasses(this.modelService, this.languageService, fakeResource),
                description
            };
        });
        await this.quickInputService.pick(picks, { placeHolder: nls.localize('pickLanguage', "Select Language") })
            .then(pick => {
            if (pick) {
                const languageId = this.languageService.getLanguageIdByLanguageName(pick.label);
                if (typeof languageId === 'string') {
                    return this.preferencesService.openLanguageSpecificSettings(languageId);
                }
            }
            return undefined;
        });
    }
};
ConfigureLanguageBasedSettingsAction = __decorate([
    __param(2, IModelService),
    __param(3, ILanguageService),
    __param(4, IQuickInputService),
    __param(5, IPreferencesService)
], ConfigureLanguageBasedSettingsAction);
export { ConfigureLanguageBasedSettingsAction };
// Register a command that gets all settings
CommandsRegistry.registerCommand({
    id: '_getAllSettings',
    handler: () => {
        const configRegistry = Registry.as(Extensions.Configuration);
        const allSettings = configRegistry.getConfigurationProperties();
        return allSettings;
    }
});
//#region --- Register a command to get all actions from the command palette
CommandsRegistry.registerCommand('_getAllCommands', function (accessor, filterByPrecondition) {
    const keybindingService = accessor.get(IKeybindingService);
    const contextKeyService = accessor.get(IContextKeyService);
    const actions = [];
    for (const editorAction of EditorExtensionsRegistry.getEditorActions()) {
        const keybinding = keybindingService.lookupKeybinding(editorAction.id);
        if (filterByPrecondition && !contextKeyService.contextMatchesRules(editorAction.precondition)) {
            continue;
        }
        actions.push({
            command: editorAction.id,
            label: editorAction.label,
            description: isLocalizedString(editorAction.metadata?.description) ? editorAction.metadata.description.value : editorAction.metadata?.description,
            precondition: editorAction.precondition?.serialize(),
            keybinding: keybinding?.getLabel() ?? 'Not set'
        });
    }
    for (const menuItem of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
        if (isIMenuItem(menuItem)) {
            if (filterByPrecondition && !contextKeyService.contextMatchesRules(menuItem.when)) {
                continue;
            }
            const title = typeof menuItem.command.title === 'string' ? menuItem.command.title : menuItem.command.title.value;
            const category = menuItem.command.category ? typeof menuItem.command.category === 'string' ? menuItem.command.category : menuItem.command.category.value : undefined;
            const label = category ? `${category}: ${title}` : title;
            const description = isLocalizedString(menuItem.command.metadata?.description) ? menuItem.command.metadata.description.value : menuItem.command.metadata?.description;
            const keybinding = keybindingService.lookupKeybinding(menuItem.command.id);
            actions.push({
                command: menuItem.command.id,
                label,
                description,
                precondition: menuItem.when?.serialize(),
                keybinding: keybinding?.getLabel() ?? 'Not set'
            });
        }
    }
    return actions;
});
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXNBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcHJlZmVyZW5jZXMvYnJvd3Nlci9wcmVmZXJlbmNlc0FjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ25GLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGtCQUFrQixFQUFrQixNQUFNLHNEQUFzRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQ3hILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FB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