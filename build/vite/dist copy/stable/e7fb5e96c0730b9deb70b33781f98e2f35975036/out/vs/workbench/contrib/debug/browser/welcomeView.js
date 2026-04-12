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
import { createCommandUri } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize, localize2 } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { OpenFileAction, OpenFolderAction } from '../../../browser/actions/workspaceActions.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { WorkbenchStateContext } from '../../../common/contextkeys.js';
import { Extensions, IViewDescriptorService, ViewContentGroups } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_EXTENSION_AVAILABLE, IDebugService } from '../common/debug.js';
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_START_COMMAND_ID } from './debugCommands.js';
const debugStartLanguageKey = 'debugStartLanguage';
const CONTEXT_DEBUG_START_LANGUAGE = new RawContextKey(debugStartLanguageKey, undefined);
const CONTEXT_DEBUGGER_INTERESTED_IN_ACTIVE_EDITOR = new RawContextKey('debuggerInterestedInActiveEditor', false);
let WelcomeView = class WelcomeView extends ViewPane {
    static { this.ID = 'workbench.debug.welcome'; }
    static { this.LABEL = localize2('run', "Run"); }
    constructor(options, themeService, keybindingService, contextMenuService, configurationService, contextKeyService, debugService, editorService, instantiationService, viewDescriptorService, openerService, storageSevice, hoverService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.debugService = debugService;
        this.editorService = editorService;
        this.debugStartLanguageContext = CONTEXT_DEBUG_START_LANGUAGE.bindTo(contextKeyService);
        this.debuggerInterestedContext = CONTEXT_DEBUGGER_INTERESTED_IN_ACTIVE_EDITOR.bindTo(contextKeyService);
        const lastSetLanguage = storageSevice.get(debugStartLanguageKey, 1 /* StorageScope.WORKSPACE */);
        this.debugStartLanguageContext.set(lastSetLanguage);
        const setContextKey = () => {
            let editorControl = this.editorService.activeTextEditorControl;
            if (isDiffEditor(editorControl)) {
                editorControl = editorControl.getModifiedEditor();
            }
            if (isCodeEditor(editorControl)) {
                const model = editorControl.getModel();
                const language = model ? model.getLanguageId() : undefined;
                if (language && this.debugService.getAdapterManager().someDebuggerInterestedInLanguage(language)) {
                    this.debugStartLanguageContext.set(language);
                    this.debuggerInterestedContext.set(true);
                    storageSevice.store(debugStartLanguageKey, language, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
                    return;
                }
            }
            this.debuggerInterestedContext.set(false);
        };
        const disposables = new DisposableStore();
        this._register(disposables);
        this._register(editorService.onDidActiveEditorChange(() => {
            disposables.clear();
            let editorControl = this.editorService.activeTextEditorControl;
            if (isDiffEditor(editorControl)) {
                editorControl = editorControl.getModifiedEditor();
            }
            if (isCodeEditor(editorControl)) {
                disposables.add(editorControl.onDidChangeModelLanguage(setContextKey));
            }
            setContextKey();
        }));
        this._register(this.debugService.getAdapterManager().onDidRegisterDebugger(setContextKey));
        this._register(this.onDidChangeBodyVisibility(visible => {
            if (visible) {
                setContextKey();
            }
        }));
        setContextKey();
        debugKeybindingLabel = this.keybindingService.appendKeybinding('', DEBUG_START_COMMAND_ID);
    }
    shouldShowWelcome() {
        return true;
    }
};
WelcomeView = __decorate([
    __param(1, IThemeService),
    __param(2, IKeybindingService),
    __param(3, IContextMenuService),
    __param(4, IConfigurationService),
    __param(5, IContextKeyService),
    __param(6, IDebugService),
    __param(7, IEditorService),
    __param(8, IInstantiationService),
    __param(9, IViewDescriptorService),
    __param(10, IOpenerService),
    __param(11, IStorageService),
    __param(12, IHoverService)
], WelcomeView);
export { WelcomeView };
const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
viewsRegistry.registerViewWelcomeContent(WelcomeView.ID, {
    content: localize({
        key: 'openAFileWhichCanBeDebugged',
        comment: [
            'Please do not translate the word "command", it is part of our internal syntax which must not change',
            '{Locked="](command:{0})"}'
        ]
    }, "[Open a file](command:{0}) which can be debugged or run.", OpenFileAction.ID),
    when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUGGER_INTERESTED_IN_ACTIVE_EDITOR.toNegated()),
    group: ViewContentGroups.Open,
});
let debugKeybindingLabel = '';
viewsRegistry.registerViewWelcomeContent(WelcomeView.ID, {
    content: `[${localize('runAndDebugAction', "Run and Debug")}${debugKeybindingLabel}](command:${DEBUG_START_COMMAND_ID})`,
    when: CONTEXT_DEBUGGERS_AVAILABLE,
    group: ViewContentGroups.Debug,
    // Allow inserting more buttons directly after this one (by setting order to 1).
    order: 1
});
viewsRegistry.registerViewWelcomeContent(WelcomeView.ID, {
    content: localize({ key: 'customizeRunAndDebug2', comment: ['{Locked="launch.json"}', '{Locked="["}', '{Locked="]({0})"}'] }, "To customize Run and Debug [create a launch.json file]({0}).", `${createCommandUri(DEBUG_CONFIGURE_COMMAND_ID, { addNew: true }).toString()}`),
    when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, WorkbenchStateContext.notEqualsTo('empty')),
    group: ViewContentGroups.Debug
});
viewsRegistry.registerViewWelcomeContent(WelcomeView.ID, {
    content: localize({
        key: 'customizeRunAndDebugOpenFolder2',
        comment: [
            '{Locked="launch.json"}',
            '{Locked="["}',
            '{Locked="]({0})"}',
        ]
    }, "To customize Run and Debug, [open a folder]({0}) and create a launch.json file.", createCommandUri(OpenFolderAction.ID).toString()),
    when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, WorkbenchStateContext.isEqualTo('empty')),
    group: ViewContentGroups.Debug
});
viewsRegistry.registerViewWelcomeContent(WelcomeView.ID, {
    content: localize('allDebuggersDisabled', "All debug extensions are disabled. Enable a debug extension or install a new one from the Marketplace."),
    when: CONTEXT_DEBUG_EXTENSION_AVAILABLE.toNegated(),
    group: ViewContentGroups.Debug
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2VsY29tZVZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL3dlbGNvbWVWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFekQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBZSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0SSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsY0FBYyxFQUFFLGdCQUFnQixFQUFFLE1BQU0s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