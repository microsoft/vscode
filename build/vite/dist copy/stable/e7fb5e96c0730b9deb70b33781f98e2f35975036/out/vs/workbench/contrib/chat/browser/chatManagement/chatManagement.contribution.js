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
import { isObject, isString } from '../../../../../base/common/types.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor } from '../../../../browser/editor.js';
import { EditorExtensions } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CONTEXT_MODELS_EDITOR, CONTEXT_MODELS_SEARCH_FOCUS, MANAGE_CHAT_COMMAND_ID } from '../../common/constants.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ChatManagementEditor, ModelsManagementEditor } from './chatManagementEditor.js';
import { ChatManagementEditorInput, ModelsManagementEditorInput } from './chatManagementEditorInput.js';
import { ILanguageModelsConfigurationService } from '../../common/languageModelsConfiguration.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
const languageModelsOpenSettingsIcon = registerIcon('language-models-open-settings', Codicon.goToFile, localize('languageModelsOpenSettings', 'Icon for open language models settings commands.'));
const LANGUAGE_MODELS_ENTITLEMENT_PRECONDITION = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(ChatContextKeys.Entitlement.planFree, ChatContextKeys.Entitlement.planEdu, ChatContextKeys.Entitlement.planPro, ChatContextKeys.Entitlement.planProPlus, ChatContextKeys.Entitlement.planBusiness, ChatContextKeys.Entitlement.planEnterprise, ChatContextKeys.Entitlement.internal));
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(ChatManagementEditor, ChatManagementEditor.ID, localize('chatManagementEditor', "Chat Management Editor")), [
    new SyncDescriptor(ChatManagementEditorInput)
]);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(ModelsManagementEditor, ModelsManagementEditor.ID, localize('modelsManagementEditor', "Models Management Editor")), [
    new SyncDescriptor(ModelsManagementEditorInput)
]);
class ChatManagementEditorInputSerializer {
    canSerialize(editorInput) {
        return true;
    }
    serialize(input) {
        return '';
    }
    deserialize(instantiationService) {
        return instantiationService.createInstance(ChatManagementEditorInput);
    }
}
class ModelsManagementEditorInputSerializer {
    canSerialize(editorInput) {
        return true;
    }
    serialize(input) {
        return '';
    }
    deserialize(instantiationService) {
        return instantiationService.createInstance(ModelsManagementEditorInput);
    }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ChatManagementEditorInput.ID, ChatManagementEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ModelsManagementEditorInput.ID, ModelsManagementEditorInputSerializer);
function sanitizeString(arg) {
    return isString(arg) ? arg : undefined;
}
function sanitizeOpenManageCopilotEditorArgs(input) {
    if (!isObject(input)) {
        input = {};
    }
    const args = input;
    return {
        query: sanitizeString(args?.query),
        section: sanitizeString(args?.section)
    };
}
let ChatManagementActionsContribution = class ChatManagementActionsContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatManagementActions'; }
    constructor(languageModelsConfigurationService) {
        super();
        this.languageModelsConfigurationService = languageModelsConfigurationService;
        this.registerChatManagementActions();
        this.registerLanguageModelsEditorTitleActions();
    }
    registerChatManagementActions() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: MANAGE_CHAT_COMMAND_ID,
                    title: localize2('openAiManagement', "Manage Language Models"),
                    category: CHAT_CATEGORY,
                    precondition: LANGUAGE_MODELS_ENTITLEMENT_PRECONDITION,
                    f1: true,
                });
            }
            async run(accessor, args) {
                const editorService = accessor.get(IEditorService);
                args = sanitizeOpenManageCopilotEditorArgs(args);
                return editorService.openEditor(new ModelsManagementEditorInput(), { pinned: true });
            }
        }));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'chat.models.action.clearSearchResults',
                    precondition: CONTEXT_MODELS_EDITOR,
                    keybinding: {
                        primary: 9 /* KeyCode.Escape */,
                        weight: 100 /* KeybindingWeight.EditorContrib */,
                        when: CONTEXT_MODELS_SEARCH_FOCUS
                    },
                    title: localize2('models.clearResults', "Clear Models Search Results")
                });
            }
            run(accessor) {
                const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
                if (activeEditorPane instanceof ModelsManagementEditor) {
                    activeEditorPane.clearSearch();
                }
                return null;
            }
        }));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.action.openLanguageModelsJson',
                    title: localize2('openLanguageModelsJson', "Open Language Models (JSON)"),
                    category: CHAT_CATEGORY,
                    precondition: LANGUAGE_MODELS_ENTITLEMENT_PRECONDITION,
                    f1: true,
                });
            }
            async run(accessor) {
                const languageModelsConfigurationService = accessor.get(ILanguageModelsConfigurationService);
                await languageModelsConfigurationService.configureLanguageModels();
            }
        }));
    }
    registerLanguageModelsEditorTitleActions() {
        const modelsConfigurationFile = this.languageModelsConfigurationService.configurationFile;
        const openModelsManagementEditorWhen = ContextKeyExpr.and(CONTEXT_MODELS_EDITOR.toNegated(), ResourceContextKey.Resource.isEqualTo(modelsConfigurationFile.toString()), ContextKeyExpr.not('isInDiffEditor'), LANGUAGE_MODELS_ENTITLEMENT_PRECONDITION);
        MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
            command: {
                id: MANAGE_CHAT_COMMAND_ID,
                title: localize2('openAiManagement', "Manage Language Models"),
                icon: languageModelsOpenSettingsIcon
            },
            when: openModelsManagementEditorWhen,
            group: 'navigation',
            order: 1
        });
        const openLanguageModelsJsonWhen = ContextKeyExpr.and(CONTEXT_MODELS_EDITOR, LANGUAGE_MODELS_ENTITLEMENT_PRECONDITION);
        MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
            command: {
                id: 'workbench.action.openLanguageModelsJson',
                title: localize2('openLanguageModelsJson', "Open Language Models (JSON)"),
                icon: languageModelsOpenSettingsIcon
            },
            when: openLanguageModelsJsonWhen,
            group: 'navigation',
            order: 1
        });
    }
};
ChatManagementActionsContribution = __decorate([
    __param(0, ILanguageModelsConfigurationService)
], ChatManagementActionsContribution);
registerWorkbenchContribution2(ChatManagementActionsContribution.ID, ChatManagementActionsContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1hbmFnZW1lbnQuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRNYW5hZ2VtZW50L2NoYXRNYW5hZ2VtZW50LmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25ILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFHN0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBdUIsb0JBQW9CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMxRixPQUFPLEVBQUUsZ0JBQWdCLEVBQTZDLE1BQU0sOEJBQThCLENBQUM7QUFFM0csT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsMkJBQTJCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN2SCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDMUQsT0FB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