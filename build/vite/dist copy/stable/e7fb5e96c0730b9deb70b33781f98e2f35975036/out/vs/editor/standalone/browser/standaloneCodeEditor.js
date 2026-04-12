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
import * as aria from '../../../base/browser/ui/aria/aria.js';
import { Disposable, toDisposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../browser/widget/codeEditor/codeEditorWidget.js';
import { InternalEditorAction } from '../../common/editorAction.js';
import { StandaloneKeybindingService, updateConfigurationService } from './standaloneServices.js';
import { IStandaloneThemeService } from '../common/standaloneTheme.js';
import { MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { StandaloneCodeEditorNLS } from '../../common/standaloneStrings.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { IEditorProgressService } from '../../../platform/progress/common/progress.js';
import { IModelService } from '../../common/services/model.js';
import { ILanguageService } from '../../common/languages/language.js';
import { StandaloneCodeEditorService } from './standaloneCodeEditorService.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../common/languages/modesRegistry.js';
import { ILanguageConfigurationService } from '../../common/languages/languageConfigurationRegistry.js';
import { ILanguageFeaturesService } from '../../common/services/languageFeatures.js';
import { DiffEditorWidget } from '../../browser/widget/diffEditor/diffEditorWidget.js';
import { IAccessibilitySignalService } from '../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { mainWindow } from '../../../base/browser/window.js';
import { setHoverDelegateFactory } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../platform/hover/browser/hover.js';
import { setBaseLayerHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegate2.js';
import { IMarkdownRendererService } from '../../../platform/markdown/browser/markdownRenderer.js';
import { EditorMarkdownCodeBlockRenderer } from '../../browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { IUserInteractionService } from '../../../platform/userInteraction/browser/userInteractionService.js';
let LAST_GENERATED_COMMAND_ID = 0;
let ariaDomNodeCreated = false;
/**
 * Create ARIA dom node inside parent,
 * or only for the first editor instantiation inside document.body.
 * @param parent container element for ARIA dom node
 */
function createAriaDomNode(parent) {
    if (!parent) {
        if (ariaDomNodeCreated) {
            return;
        }
        ariaDomNodeCreated = true;
    }
    aria.setARIAContainer(parent || mainWindow.document.body);
}
/**
 * A code editor to be used both by the standalone editor and the standalone diff editor.
 */
let StandaloneCodeEditor = class StandaloneCodeEditor extends CodeEditorWidget {
    constructor(domElement, _options, instantiationService, codeEditorService, commandService, contextKeyService, hoverService, keybindingService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, markdownRendererService, userInteractionService) {
        const options = { ..._options };
        options.ariaLabel = options.ariaLabel || StandaloneCodeEditorNLS.editorViewAccessibleLabel;
        super(domElement, options, {}, instantiationService, codeEditorService, commandService, contextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, userInteractionService);
        if (keybindingService instanceof StandaloneKeybindingService) {
            this._standaloneKeybindingService = keybindingService;
        }
        else {
            this._standaloneKeybindingService = null;
        }
        createAriaDomNode(options.ariaContainerElement);
        setHoverDelegateFactory((placement, enableInstantHover) => instantiationService.createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));
        setBaseLayerHoverDelegate(hoverService);
        markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
    }
    addCommand(keybinding, handler, context) {
        if (!this._standaloneKeybindingService) {
            console.warn('Cannot add command because the editor is configured with an unrecognized KeybindingService');
            return null;
        }
        const commandId = 'DYNAMIC_' + (++LAST_GENERATED_COMMAND_ID);
        const whenExpression = ContextKeyExpr.deserialize(context);
        this._standaloneKeybindingService.addDynamicKeybinding(commandId, keybinding, handler, whenExpression);
        return commandId;
    }
    createContextKey(key, defaultValue) {
        return this._contextKeyService.createKey(key, defaultValue);
    }
    addAction(_descriptor) {
        if ((typeof _descriptor.id !== 'string') || (typeof _descriptor.label !== 'string') || (typeof _descriptor.run !== 'function')) {
            throw new Error('Invalid action descriptor, `id`, `label` and `run` are required properties!');
        }
        if (!this._standaloneKeybindingService) {
            console.warn('Cannot add keybinding because the editor is configured with an unrecognized KeybindingService');
            return Disposable.None;
        }
        // Read descriptor options
        const id = _descriptor.id;
        const label = _descriptor.label;
        const precondition = ContextKeyExpr.and(ContextKeyExpr.equals('editorId', this.getId()), ContextKeyExpr.deserialize(_descriptor.precondition));
        const keybindings = _descriptor.keybindings;
        const keybindingsWhen = ContextKeyExpr.and(precondition, ContextKeyExpr.deserialize(_descriptor.keybindingContext));
        const contextMenuGroupId = _descriptor.contextMenuGroupId || null;
        const contextMenuOrder = _descriptor.contextMenuOrder || 0;
        const run = (_accessor, ...args) => {
            return Promise.resolve(_descriptor.run(this, ...args));
        };
        const toDispose = new DisposableStore();
        // Generate a unique id to allow the same descriptor.id across multiple editor instances
        const uniqueId = this.getId() + ':' + id;
        // Register the command
        toDispose.add(CommandsRegistry.registerCommand(uniqueId, run));
        // Register the context menu item
        if (contextMenuGroupId) {
            const menuItem = {
                command: {
                    id: uniqueId,
                    title: label
                },
                when: precondition,
                group: contextMenuGroupId,
                order: contextMenuOrder
            };
            toDispose.add(MenuRegistry.appendMenuItem(MenuId.EditorContext, menuItem));
        }
        // Register the keybindings
        if (Array.isArray(keybindings)) {
            for (const kb of keybindings) {
                toDispose.add(this._standaloneKeybindingService.addDynamicKeybinding(uniqueId, kb, run, keybindingsWhen));
            }
        }
        // Finally, register an internal editor action
        const internalAction = new InternalEditorAction(uniqueId, label, label, undefined, precondition, (...args) => Promise.resolve(_descriptor.run(this, ...args)), this._contextKeyService);
        // Store it under the original id, such that trigger with the original id will work
        this._actions.set(id, internalAction);
        toDispose.add(toDisposable(() => {
            this._actions.delete(id);
        }));
        return toDispose;
    }
    _triggerCommand(handlerId, payload) {
        if (this._codeEditorService instanceof StandaloneCodeEditorService) {
            // Help commands find this editor as the active editor
            try {
                this._codeEditorService.setActiveCodeEditor(this);
                super._triggerCommand(handlerId, payload);
            }
            finally {
                this._codeEditorService.setActiveCodeEditor(null);
            }
        }
        else {
            super._triggerCommand(handlerId, payload);
        }
    }
};
StandaloneCodeEditor = __decorate([
    __param(2, IInstantiationService),
    __param(3, ICodeEditorService),
    __param(4, ICommandService),
    __param(5, IContextKeyService),
    __param(6, IHoverService),
    __param(7, IKeybindingService),
    __param(8, IThemeService),
    __param(9, INotificationService),
    __param(10, IAccessibilityService),
    __param(11, ILanguageConfigurationService),
    __param(12, ILanguageFeaturesService),
    __param(13, IMarkdownRendererService),
    __param(14, IUserInteractionService)
], StandaloneCodeEditor);
export { StandaloneCodeEditor };
let StandaloneEditor = class StandaloneEditor extends StandaloneCodeEditor {
    constructor(domElement, _options, instantiationService, codeEditorService, commandService, contextKeyService, hoverService, keybindingService, themeService, notificationService, configurationService, accessibilityService, modelService, languageService, languageConfigurationService, languageFeaturesService, markdownRendererService, userInteractionService) {
        const options = { ..._options };
        updateConfigurationService(configurationService, options, false);
        const themeDomRegistration = themeService.registerEditorContainer(domElement);
        if (typeof options.theme === 'string') {
            themeService.setTheme(options.theme);
        }
        if (typeof options.autoDetectHighContrast !== 'undefined') {
            themeService.setAutoDetectHighContrast(Boolean(options.autoDetectHighContrast));
        }
        const _model = options.model;
        delete options.model;
        super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService, hoverService, keybindingService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, markdownRendererService, userInteractionService);
        this._configurationService = configurationService;
        this._standaloneThemeService = themeService;
        this._register(themeDomRegistration);
        let model;
        if (typeof _model === 'undefined') {
            const languageId = languageService.getLanguageIdByMimeType(options.language) || options.language || PLAINTEXT_LANGUAGE_ID;
            model = createTextModel(modelService, languageService, options.value || '', languageId, undefined);
            this._ownsModel = true;
        }
        else {
            model = _model;
            this._ownsModel = false;
        }
        this._attachModel(model);
        if (model) {
            const e = {
                oldModelUrl: null,
                newModelUrl: model.uri
            };
            this._onDidChangeModel.fire(e);
        }
    }
    dispose() {
        super.dispose();
    }
    updateOptions(newOptions) {
        updateConfigurationService(this._configurationService, newOptions, false);
        if (typeof newOptions.theme === 'string') {
            this._standaloneThemeService.setTheme(newOptions.theme);
        }
        if (typeof newOptions.autoDetectHighContrast !== 'undefined') {
            this._standaloneThemeService.setAutoDetectHighContrast(Boolean(newOptions.autoDetectHighContrast));
        }
        super.updateOptions(newOptions);
    }
    _postDetachModelCleanup(detachedModel) {
        super._postDetachModelCleanup(detachedModel);
        if (detachedModel && this._ownsModel) {
            detachedModel.dispose();
            this._ownsModel = false;
        }
    }
};
StandaloneEditor = __decorate([
    __param(2, IInstantiationService),
    __param(3, ICodeEditorService),
    __param(4, ICommandService),
    __param(5, IContextKeyService),
    __param(6, IHoverService),
    __param(7, IKeybindingService),
    __param(8, IStandaloneThemeService),
    __param(9, INotificationService),
    __param(10, IConfigurationService),
    __param(11, IAccessibilityService),
    __param(12, IModelService),
    __param(13, ILanguageService),
    __param(14, ILanguageConfigurationService),
    __param(15, ILanguageFeaturesService),
    __param(16, IMarkdownRendererService),
    __param(17, IUserInteractionService)
], StandaloneEditor);
export { StandaloneEditor };
let StandaloneDiffEditor2 = class StandaloneDiffEditor2 extends DiffEditorWidget {
    constructor(domElement, _options, instantiationService, contextKeyService, codeEditorService, themeService, notificationService, configurationService, contextMenuService, editorProgressService, clipboardService, accessibilitySignalService) {
        const options = { ..._options };
        updateConfigurationService(configurationService, options, true);
        const themeDomRegistration = themeService.registerEditorContainer(domElement);
        if (typeof options.theme === 'string') {
            themeService.setTheme(options.theme);
        }
        if (typeof options.autoDetectHighContrast !== 'undefined') {
            themeService.setAutoDetectHighContrast(Boolean(options.autoDetectHighContrast));
        }
        super(domElement, options, {}, contextKeyService, instantiationService, codeEditorService, accessibilitySignalService, editorProgressService);
        this._configurationService = configurationService;
        this._standaloneThemeService = themeService;
        this._register(themeDomRegistration);
    }
    dispose() {
        super.dispose();
    }
    updateOptions(newOptions) {
        updateConfigurationService(this._configurationService, newOptions, true);
        if (typeof newOptions.theme === 'string') {
            this._standaloneThemeService.setTheme(newOptions.theme);
        }
        if (typeof newOptions.autoDetectHighContrast !== 'undefined') {
            this._standaloneThemeService.setAutoDetectHighContrast(Boolean(newOptions.autoDetectHighContrast));
        }
        super.updateOptions(newOptions);
    }
    _createInnerEditor(instantiationService, container, options) {
        return instantiationService.createInstance(StandaloneCodeEditor, container, options);
    }
    getOriginalEditor() {
        return super.getOriginalEditor();
    }
    getModifiedEditor() {
        return super.getModifiedEditor();
    }
    addCommand(keybinding, handler, context) {
        return this.getModifiedEditor().addCommand(keybinding, handler, context);
    }
    createContextKey(key, defaultValue) {
        return this.getModifiedEditor().createContextKey(key, defaultValue);
    }
    addAction(descriptor) {
        return this.getModifiedEditor().addAction(descriptor);
    }
};
StandaloneDiffEditor2 = __decorate([
    __param(2, IInstantiationService),
    __param(3, IContextKeyService),
    __param(4, ICodeEditorService),
    __param(5, IStandaloneThemeService),
    __param(6, INotificationService),
    __param(7, IConfigurationService),
    __param(8, IContextMenuService),
    __param(9, IEditorProgressService),
    __param(10, IClipboardService),
    __param(11, IAccessibilitySignalService)
], StandaloneDiffEditor2);
export { StandaloneDiffEditor2 };
/**
 * @internal
 */
export function createTextModel(modelService, languageService, value, languageId, uri) {
    value = value || '';
    if (!languageId) {
        const firstLF = value.indexOf('\n');
        let firstLine = value;
        if (firstLF !== -1) {
            firstLine = value.substring(0, firstLF);
        }
        return doCreateModel(modelService, value, languageService.createByFilepathOrFirstLine(uri || null, firstLine), uri);
    }
    return doCreateModel(modelService, value, languageService.createById(languageId), uri);
}
/**
 * @internal
 */
function doCreateModel(modelService, value, languageSelection, uri) {
    return modelService.createModel(value, languageSelection, uri);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUNvZGVFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3Ivc3RhbmRhbG9uZS9icm93c2VyL3N0YW5kYWxvbmVDb2RlRWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxJQUFJLE1BQU0sdUNBQXVDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFM0csT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDakYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFdkYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHcEUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLDBCQUEwQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDbEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdkUsT0FBTyxFQUFhLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RixPQUFPLEVBQUUsZ0JBQWdCLEVBQW1CLGVBQWUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ25ILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQWdDLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDckksT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDM0YsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLHlEQUF5RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUV2RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDL0QsT0FBTyxFQUFzQixnQkFBZ0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTFGLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRXhHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQzFILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNqRyxPQUFPLEVBQUUsYUFBYSxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDN0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDbEcsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDbkksT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUF3TTlHLElBQUkseUJBQXlCLEdBQUcsQ0FBQyxDQUFDO0FBRWxDLElBQUksa0JBQWtCLEdBQUcsS0FBSyxDQUFDO0FBQy9COzs7O0dBSUc7QUFDSCxTQUFTLGlCQUFpQixDQUFDLE1BQStCO0lBQ3pELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNiLElBQUksa0JBQWtCLEVBQUUsQ0FBQztZQUN4QixPQUFPO1FBQ1IsQ0FBQztRQUNELGtCQUFrQixHQUFHLElBQUksQ0FBQztJQUMzQixDQUFDO0lBQ0QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzNELENBQUM7QUFFRDs7R0FFRztBQUNJLElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQXFCLFNBQVEsZ0JBQWdCO0lBSXpELFlBQ0MsVUFBdUIsRUFDdkIsUUFBd0QsRUFDakMsb0JBQTJDLEVBQzlDLGlCQUFxQyxFQUN4QyxjQUErQixFQUM1QixpQkFBcUMsRUFDMUMsWUFBMkIsRUFDdEIsaUJBQXFDLEVBQzFDLFlBQTJCLEVBQ3BCLG1CQUF5QyxFQUN4QyxvQkFBMkMsRUFDbkMsNEJBQTJELEVBQ2hFLHVCQUFpRCxFQUNqRCx1QkFBaUQsRUFDbEQsc0JBQStDO1FBRXhFLE1BQU0sT0FBTyxHQUFHLEVBQUUsR0FBRyxRQUFRLEVBQUUsQ0FBQztRQUNoQyxPQUFPLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLElBQUksdUJBQXVCLENBQUMseUJBQXlCLENBQUM7UUFDM0YsS0FBSyxDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLG9CQUFvQixFQUFFLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsbUJBQW1CLEVBQUUsb0JBQW9CLEVBQUUsNEJBQTRCLEVBQUUsdUJBQXVCLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztRQUVuUCxJQUFJLGlCQUFpQixZQUFZLDJCQUEyQixFQUFFLENBQUM7WUFDOUQsSUFBSSxDQUFDLDRCQUE0QixHQUFHLGlCQUFpQixDQUFDO1FBQ3ZELENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLDRCQUE0QixHQUFHLElBQUksQ0FBQztRQUMxQyxDQUFDO1FBRUQsaUJBQWlCLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFFaEQsdUJBQXVCLENBQUMsQ0FBQyxTQUFTLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsRUFBRSxTQUFTLEVBQUUsRUFBRSxZQUFZLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzdLLHlCQUF5QixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRXhDLHVCQUF1QixDQUFDLDJCQUEyQixDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLENBQUM7SUFDM0gsQ0FBQztJQUVNLFVBQVUsQ0FBQyxVQUFrQixFQUFFLE9BQXdCLEVBQUUsT0FBZ0I7UUFDL0UsSUFBSSxDQUFDLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO1lBQ3hDLE9BQU8sQ0FBQyxJQUFJLENBQUMsNEZBQTRGLENBQUMsQ0FBQztZQUMzRyxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxVQUFVLEdBQUcsQ0FBQyxFQUFFLHlCQUF5QixDQUFDLENBQUM7UUFDN0QsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzRCxJQUFJLENBQUMsNEJBQTRCLENBQUMsb0JBQW9CLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDdkcsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVNLGdCQUFnQixDQUE4QyxHQUFXLEVBQUUsWUFBZTtRQUNoRyxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFTSxTQUFTLENBQUMsV0FBOEI7UUFDOUMsSUFBSSxDQUFDLE9BQU8sV0FBVyxDQUFDLEVBQUUsS0FBSyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sV0FBVyxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sV0FBVyxDQUFDLEdBQUcsS0FBSyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ2hJLE1BQU0sSUFBSSxLQUFLLENBQUMsNkVBQTZFLENBQUMsQ0FBQztRQUNoRyxDQUFDO1FBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO1lBQ3hDLE9BQU8sQ0FBQyxJQUFJLENBQUMsK0ZBQStGLENBQUMsQ0FBQztZQUM5RyxPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUM7UUFDeEIsQ0FBQztRQUVELDBCQUEwQjtRQUMxQixNQUFNLEVBQUUsR0FBRyxXQUFXLENBQUMsRUFBRSxDQUFDO1FBQzFCLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUM7UUFDaEMsTUFBTSxZQUFZLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FDdEMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQy9DLGNBQWMsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUNwRCxDQUFDO1FBQ0YsTUFBTSxXQUFXLEdBQUcsV0FBVyxDQUFDLFdBQVcsQ0FBQztRQUM1QyxNQUFNLGVBQWUsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUN6QyxZQUFZLEVBQ1osY0FBYyxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsQ0FDekQsQ0FBQztRQUNGLE1BQU0sa0JBQWtCLEdBQUcsV0FBVyxDQUFDLGtCQUFrQixJQUFJLElBQUksQ0FBQztRQUNsRSxNQUFNLGdCQUFnQixHQUFHLFdBQVcsQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLENBQUM7UUFDM0QsTUFBTSxHQUFHLEdBQUcsQ0FBQyxTQUE0QixFQUFFLEdBQUcsSUFBZSxFQUFpQixFQUFFO1lBQy9FLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDeEQsQ0FBQyxDQUFDO1FBR0YsTUFBTSxTQUFTLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUV4Qyx3RkFBd0Y7UUFDeEYsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFFekMsdUJBQXVCO1FBQ3ZCLFNBQVMsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRS9ELGlDQUFpQztRQUNqQyxJQUFJLGtCQUFrQixFQUFFLENBQUM7WUFDeEIsTUFBTSxRQUFRLEdBQWM7Z0JBQzNCLE9BQU8sRUFBRTtvQkFDUixFQUFFLEVBQUUsUUFBUTtvQkFDWixLQUFLLEVBQUUsS0FBSztpQkFDWjtnQkFDRCxJQUFJLEVBQUUsWUFBWTtnQkFDbEIsS0FBSyxFQUFFLGtCQUFrQjtnQkFDekIsS0FBSyxFQUFFLGdCQUFnQjthQUN2QixDQUFDO1lBQ0YsU0FBUyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUM1RSxDQUFDO1FBRUQsMkJBQTJCO1FBQzNCLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQ2hDLEtBQUssTUFBTSxFQUFFLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQzlCLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUM7WUFDM0csQ0FBQztRQUNGLENBQUM7UUFFRCw4Q0FBOEM7UUFDOUMsTUFBTSxjQUFjLEdBQUcsSUFBSSxvQkFBb0IsQ0FDOUMsUUFBUSxFQUNSLEtBQUssRUFDTCxLQUFLLEVBQ0wsU0FBUyxFQUNULFlBQVksRUFDWixDQUFDLEdBQUcsSUFBZSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsRUFDdkUsSUFBSSxDQUFDLGtCQUFrQixDQUN2QixDQUFDO1FBRUYsbUZBQW1GO1FBQ25GLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUN0QyxTQUFTLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7WUFDL0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDMUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFa0IsZUFBZSxDQUFDLFNBQWlCLEVBQUUsT0FBZ0I7UUFDckUsSUFBSSxJQUFJLENBQUMsa0JBQWtCLFlBQVksMkJBQTJCLEVBQUUsQ0FBQztZQUNwRSxzREFBc0Q7WUFDdEQsSUFBSSxDQUFDO2dCQUNKLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDbEQsS0FBSyxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDM0MsQ0FBQztvQkFBUyxDQUFDO2dCQUNWLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuRCxDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMzQyxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUFoSlksb0JBQW9CO0lBTzlCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxvQkFBb0IsQ0FBQTtJQUNwQixZQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFlBQUEsNkJBQTZCLENBQUE7SUFDN0IsWUFBQSx3QkFBd0IsQ0FBQTtJQUN4QixZQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFlBQUEsdUJBQXVCLENBQUE7R0FuQmIsb0JBQW9CLENBZ0poQzs7QUFFTSxJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFpQixTQUFRLG9CQUFvQjtJQU16RCxZQUNDLFVBQXVCLEVBQ3ZCLFFBQW9FLEVBQzdDLG9CQUEyQyxFQUM5QyxpQkFBcUMsRUFDeEMsY0FBK0IsRUFDNUIsaUJBQXFDLEVBQzFDLFlBQTJCLEVBQ3RCLGlCQUFxQyxFQUNoQyxZQUFxQyxFQUN4QyxtQkFBeUMsRUFDeEMsb0JBQTJDLEVBQzNDLG9CQUEyQyxFQUNuRCxZQUEyQixFQUN4QixlQUFpQyxFQUNwQiw0QkFBMkQsRUFDaEUsdUJBQWlELEVBQ2pELHVCQUFpRCxFQUNsRCxzQkFBK0M7UUFFeEUsTUFBTSxPQUFPLEdBQUcsRUFBRSxHQUFHLFFBQVEsRUFBRSxDQUFDO1FBQ2hDLDBCQUEwQixDQUFDLG9CQUFvQixFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRSxNQUFNLG9CQUFvQixHQUE0QixZQUFhLENBQUMsdUJBQXVCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDeEcsSUFBSSxPQUFPLE9BQU8sQ0FBQyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDdkMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdEMsQ0FBQztRQUNELElBQUksT0FBTyxPQUFPLENBQUMsc0JBQXNCLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDM0QsWUFBWSxDQUFDLHlCQUF5QixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFDRCxNQUFNLE1BQU0sR0FBa0MsT0FBTyxDQUFDLEtBQUssQ0FBQztRQUM1RCxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUM7UUFDckIsS0FBSyxDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsbUJBQW1CLEVBQUUsb0JBQW9CLEVBQUUsNEJBQTRCLEVBQUUsdUJBQXVCLEVBQUUsdUJBQXVCLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztRQUV6UyxJQUFJLENBQUMscUJBQXFCLEdBQUcsb0JBQW9CLENBQUM7UUFDbEQsSUFBSSxDQUFDLHVCQUF1QixHQUFHLFlBQVksQ0FBQztRQUM1QyxJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFFckMsSUFBSSxLQUF3QixDQUFDO1FBQzdCLElBQUksT0FBTyxNQUFNLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDbkMsTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFDLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxPQUFPLENBQUMsUUFBUSxJQUFJLHFCQUFxQixDQUFDO1lBQzFILEtBQUssR0FBRyxlQUFlLENBQUMsWUFBWSxFQUFFLGVBQWUsRUFBRSxPQUFPLENBQUMsS0FBSyxJQUFJLEVBQUUsRUFBRSxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDbkcsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7UUFDeEIsQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLEdBQUcsTUFBTSxDQUFDO1lBQ2YsSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekIsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sQ0FBQyxHQUF1QjtnQkFDN0IsV0FBVyxFQUFFLElBQUk7Z0JBQ2pCLFdBQVcsRUFBRSxLQUFLLENBQUMsR0FBRzthQUN0QixDQUFDO1lBQ0YsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoQyxDQUFDO0lBQ0YsQ0FBQztJQUVlLE9BQU87UUFDdEIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFFZSxhQUFhLENBQUMsVUFBMkQ7UUFDeEYsMEJBQTBCLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxRSxJQUFJLE9BQU8sVUFBVSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUMxQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6RCxDQUFDO1FBQ0QsSUFBSSxPQUFPLFVBQVUsQ0FBQyxzQkFBc0IsS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUM5RCxJQUFJLENBQUMsdUJBQXVCLENBQUMseUJBQXlCLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFDcEcsQ0FBQztRQUNELEtBQUssQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVrQix1QkFBdUIsQ0FBQyxhQUF5QjtRQUNuRSxLQUFLLENBQUMsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDN0MsSUFBSSxhQUFhLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3RDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUN6QixDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUFyRlksZ0JBQWdCO0lBUzFCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsdUJBQXVCLENBQUE7SUFDdkIsV0FBQSxvQkFBb0IsQ0FBQTtJQUNwQixZQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFlBQUEscUJBQXFCLENBQUE7SUFDckIsWUFBQSxhQUFhLENBQUE7SUFDYixZQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFlBQUEsNkJBQTZCLENBQUE7SUFDN0IsWUFBQSx3QkFBd0IsQ0FBQTtJQUN4QixZQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFlBQUEsdUJBQXVCLENBQUE7R0F4QmIsZ0JBQWdCLENBcUY1Qjs7QUFFTSxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFzQixTQUFRLGdCQUFnQjtJQUsxRCxZQUNDLFVBQXVCLEVBQ3ZCLFFBQXdFLEVBQ2pELG9CQUEyQyxFQUM5QyxpQkFBcUMsRUFDckMsaUJBQXFDLEVBQ2hDLFlBQXFDLEVBQ3hDLG1CQUF5QyxFQUN4QyxvQkFBMkMsRUFDN0Msa0JBQXVDLEVBQ3BDLHFCQUE2QyxFQUNsRCxnQkFBbUMsRUFDekIsMEJBQXVEO1FBRXBGLE1BQU0sT0FBTyxHQUFHLEVBQUUsR0FBRyxRQUFRLEVBQUUsQ0FBQztRQUNoQywwQkFBMEIsQ0FBQyxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEUsTUFBTSxvQkFBb0IsR0FBNEIsWUFBYSxDQUFDLHVCQUF1QixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3hHLElBQUksT0FBTyxPQUFPLENBQUMsS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3ZDLFlBQVksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RDLENBQUM7UUFDRCxJQUFJLE9BQU8sT0FBTyxDQUFDLHNCQUFzQixLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQzNELFlBQVksQ0FBQyx5QkFBeUIsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUNqRixDQUFDO1FBRUQsS0FBSyxDQUNKLFVBQVUsRUFDVixPQUFPLEVBQ1AsRUFBRSxFQUNGLGlCQUFpQixFQUNqQixvQkFBb0IsRUFDcEIsaUJBQWlCLEVBQ2pCLDBCQUEwQixFQUMxQixxQkFBcUIsQ0FDckIsQ0FBQztRQUVGLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxvQkFBb0IsQ0FBQztRQUNsRCxJQUFJLENBQUMsdUJBQXVCLEdBQUcsWUFBWSxDQUFDO1FBRTVDLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRWUsT0FBTztRQUN0QixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVlLGFBQWEsQ0FBQyxVQUErRDtRQUM1RiwwQkFBMEIsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pFLElBQUksT0FBTyxVQUFVLENBQUMsS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pELENBQUM7UUFDRCxJQUFJLE9BQU8sVUFBVSxDQUFDLHNCQUFzQixLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQzlELElBQUksQ0FBQyx1QkFBdUIsQ0FBQyx5QkFBeUIsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUNwRyxDQUFDO1FBQ0QsS0FBSyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBRWtCLGtCQUFrQixDQUFDLG9CQUEyQyxFQUFFLFNBQXNCLEVBQUUsT0FBaUM7UUFDM0ksT0FBTyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3RGLENBQUM7SUFFZSxpQkFBaUI7UUFDaEMsT0FBNkIsS0FBSyxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDeEQsQ0FBQztJQUVlLGlCQUFpQjtRQUNoQyxPQUE2QixLQUFLLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztJQUN4RCxDQUFDO0lBRU0sVUFBVSxDQUFDLFVBQWtCLEVBQUUsT0FBd0IsRUFBRSxPQUFnQjtRQUMvRSxPQUFPLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzFFLENBQUM7SUFFTSxnQkFBZ0IsQ0FBOEMsR0FBVyxFQUFFLFlBQWU7UUFDaEcsT0FBTyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVNLFNBQVMsQ0FBQyxVQUE2QjtRQUM3QyxPQUFPLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN2RCxDQUFDO0NBQ0QsQ0FBQTtBQXBGWSxxQkFBcUI7SUFRL0IsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSx1QkFBdUIsQ0FBQTtJQUN2QixXQUFBLG9CQUFvQixDQUFBO0lBQ3BCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLHNCQUFzQixDQUFBO0lBQ3RCLFlBQUEsaUJBQWlCLENBQUE7SUFDakIsWUFBQSwyQkFBMkIsQ0FBQTtHQWpCakIscUJBQXFCLENBb0ZqQzs7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxlQUFlLENBQUMsWUFBMkIsRUFBRSxlQUFpQyxFQUFFLEtBQWEsRUFBRSxVQUE4QixFQUFFLEdBQW9CO0lBQ2xLLEtBQUssR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO0lBQ3BCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQixNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQztRQUN0QixJQUFJLE9BQU8sS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3BCLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBQ0QsT0FBTyxhQUFhLENBQUMsWUFBWSxFQUFFLEtBQUssRUFBRSxlQUFlLENBQUMsMkJBQTJCLENBQUMsR0FBRyxJQUFJLElBQUksRUFBRSxTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNySCxDQUFDO0lBQ0QsT0FBTyxhQUFhLENBQUMsWUFBWSxFQUFFLEtBQUssRUFBRSxlQUFlLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQ3hGLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsYUFBYSxDQUFDLFlBQTJCLEVBQUUsS0FBYSxFQUFFLGlCQUFxQyxFQUFFLEdBQW9CO0lBQzdILE9BQU8sWUFBWSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDaEUsQ0FBQyJ9