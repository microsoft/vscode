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
var ShareWorkbenchContribution_1;
import './share.css';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { WorkspaceFolderCountContext } from '../../../common/contextkeys.js';
import { Extensions } from '../../../common/contributions.js';
import { ShareProviderCountContext, ShareService } from './shareService.js';
import { IShareService } from '../common/share.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
const targetMenus = [
    MenuId.EditorContextShare,
    MenuId.SCMResourceContextShare,
    MenuId.OpenEditorsContextShare,
    MenuId.EditorTitleContextShare,
    MenuId.MenubarShare,
    // MenuId.EditorLineNumberContext, // todo@joyceerhl add share
    MenuId.ExplorerContextShare
];
let ShareWorkbenchContribution = class ShareWorkbenchContribution extends Disposable {
    static { ShareWorkbenchContribution_1 = this; }
    static { this.SHARE_ENABLED_SETTING = 'workbench.experimental.share.enabled'; }
    constructor(shareService, configurationService) {
        super();
        this.shareService = shareService;
        this.configurationService = configurationService;
        if (this.configurationService.getValue(ShareWorkbenchContribution_1.SHARE_ENABLED_SETTING)) {
            this.registerActions();
        }
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ShareWorkbenchContribution_1.SHARE_ENABLED_SETTING)) {
                const settingValue = this.configurationService.getValue(ShareWorkbenchContribution_1.SHARE_ENABLED_SETTING);
                if (settingValue === true && this._disposables === undefined) {
                    this.registerActions();
                }
                else if (settingValue === false && this._disposables !== undefined) {
                    this._disposables?.clear();
                    this._disposables = undefined;
                }
            }
        }));
    }
    dispose() {
        super.dispose();
        this._disposables?.dispose();
    }
    registerActions() {
        if (!this._disposables) {
            this._disposables = new DisposableStore();
        }
        this._disposables.add(registerAction2(class ShareAction extends Action2 {
            static { this.ID = 'workbench.action.share'; }
            static { this.LABEL = localize2('share', 'Share...'); }
            constructor() {
                super({
                    id: ShareAction.ID,
                    title: ShareAction.LABEL,
                    f1: true,
                    icon: Codicon.linkExternal,
                    precondition: ContextKeyExpr.and(ShareProviderCountContext.notEqualsTo(0), WorkspaceFolderCountContext.notEqualsTo(0)),
                    keybinding: {
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                        primary: 512 /* KeyMod.Alt */ | 2048 /* KeyMod.CtrlCmd */ | 49 /* KeyCode.KeyS */,
                    },
                    menu: [
                        { id: MenuId.CommandCenter, order: 3 }
                    ]
                });
            }
            async run(accessor, ...args) {
                const shareService = accessor.get(IShareService);
                const activeEditor = accessor.get(IEditorService)?.activeEditor;
                const resourceUri = (activeEditor && EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }))
                    ?? accessor.get(IWorkspaceContextService).getWorkspace().folders[0].uri;
                const clipboardService = accessor.get(IClipboardService);
                const dialogService = accessor.get(IDialogService);
                const urlService = accessor.get(IOpenerService);
                const progressService = accessor.get(IProgressService);
                const selection = accessor.get(ICodeEditorService).getActiveCodeEditor()?.getSelection() ?? undefined;
                const result = await progressService.withProgress({
                    location: 10 /* ProgressLocation.Window */,
                    detail: localize('generating link', 'Generating link...')
                }, async () => shareService.provideShare({ resourceUri, selection }, CancellationToken.None));
                if (result) {
                    const uriText = result.toString();
                    const isResultText = typeof result === 'string';
                    await clipboardService.writeText(uriText);
                    dialogService.prompt({
                        type: Severity.Info,
                        message: isResultText ? localize('shareTextSuccess', 'Copied text to clipboard!') : localize('shareSuccess', 'Copied link to clipboard!'),
                        custom: {
                            icon: Codicon.check,
                            markdownDetails: [{
                                    markdown: new MarkdownString(`<div aria-label='${uriText}'>${uriText}</div>`, { supportHtml: true }),
                                    classes: [isResultText ? 'share-dialog-input-text' : 'share-dialog-input-link']
                                }]
                        },
                        cancelButton: localize('close', 'Close'),
                        buttons: isResultText ? [] : [{ label: localize('open link', 'Open Link'), run: () => { urlService.open(result, { openExternal: true }); } }]
                    });
                }
            }
        }));
        const actions = this.shareService.getShareActions();
        for (const menuId of targetMenus) {
            for (const action of actions) {
                // todo@joyceerhl avoid duplicates
                this._disposables.add(MenuRegistry.appendMenuItem(menuId, action));
            }
        }
    }
};
ShareWorkbenchContribution = ShareWorkbenchContribution_1 = __decorate([
    __param(0, IShareService),
    __param(1, IConfigurationService)
], ShareWorkbenchContribution);
registerSingleton(IShareService, ShareService, 1 /* InstantiationType.Delayed */);
const workbenchContributionsRegistry = Registry.as(Extensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ShareWorkbenchContribution, 4 /* LifecyclePhase.Eventually */);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    ...workbenchConfigurationNodeBase,
    properties: {
        'workbench.experimental.share.enabled': {
            type: 'boolean',
            default: false,
            tags: ['experimental'],
            markdownDescription: localize('experimental.share.enabled', "Controls whether to render the Share action next to the command center when {0} is {1}.", '`#window.commandCenter#`', '`true`'),
            restricted: false,
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhcmUuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2hhcmUvYnJvd3Nlci9zaGFyZS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sYUFBYSxDQUFDO0FBQ3JCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3JGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFHL0csT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENB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