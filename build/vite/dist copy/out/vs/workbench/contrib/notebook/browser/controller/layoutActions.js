/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { NOTEBOOK_ACTIONS_CATEGORY } from './coreActions.js';
import { getNotebookEditorFromEditorPane } from '../notebookBrowser.js';
import { INotebookEditorService } from '../services/notebookEditorService.js';
import { NotebookSetting } from '../../common/notebookCommon.js';
import { NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from '../../common/notebookContextKeys.js';
import { INotebookService } from '../../common/notebookService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
registerAction2(class NotebookConfigureLayoutAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.notebook.layout.select',
            title: localize2('workbench.notebook.layout.select.label', "Select between Notebook Layouts"),
            f1: true,
            precondition: ContextKeyExpr.equals(`config.${NotebookSetting.openGettingStarted}`, true),
            category: NOTEBOOK_ACTIONS_CATEGORY,
            menu: [
                {
                    id: MenuId.EditorTitle,
                    group: 'notebookLayout',
                    when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, ContextKeyExpr.notEquals('config.notebook.globalToolbar', true), ContextKeyExpr.equals(`config.${NotebookSetting.openGettingStarted}`, true)),
                    order: 0
                },
                {
                    id: MenuId.NotebookToolbar,
                    group: 'notebookLayout',
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.globalToolbar', true), ContextKeyExpr.equals(`config.${NotebookSetting.openGettingStarted}`, true)),
                    order: 0
                }
            ]
        });
    }
    run(accessor) {
        accessor.get(ICommandService).executeCommand('workbench.action.openWalkthrough', { category: 'notebooks', step: 'notebookProfile' }, true);
    }
});
registerAction2(class NotebookConfigureLayoutAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.notebook.layout.configure',
            title: localize2('workbench.notebook.layout.configure.label', "Customize Notebook Layout"),
            f1: true,
            category: NOTEBOOK_ACTIONS_CATEGORY,
            menu: [
                {
                    id: MenuId.NotebookToolbar,
                    group: 'notebookLayout',
                    when: ContextKeyExpr.equals('config.notebook.globalToolbar', true),
                    order: 1
                }
            ]
        });
    }
    run(accessor) {
        accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@tag:notebookLayout' });
    }
});
registerAction2(class NotebookConfigureLayoutFromEditorTitle extends Action2 {
    constructor() {
        super({
            id: 'workbench.notebook.layout.configure.editorTitle',
            title: localize2('workbench.notebook.layout.configure.label', "Customize Notebook Layout"),
            f1: false,
            category: NOTEBOOK_ACTIONS_CATEGORY,
            menu: [
                {
                    id: MenuId.NotebookEditorLayoutConfigure,
                    group: 'notebookLayout',
                    when: NOTEBOOK_IS_ACTIVE_EDITOR,
                    order: 1
                }
            ]
        });
    }
    run(accessor) {
        accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@tag:notebookLayout' });
    }
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
    submenu: MenuId.NotebookEditorLayoutConfigure,
    title: localize2('customizeNotebook', "Customize Notebook..."),
    icon: Codicon.gear,
    group: 'navigation',
    order: -1,
    when: NOTEBOOK_IS_ACTIVE_EDITOR
});
registerAction2(class ToggleLineNumberFromEditorTitle extends Action2 {
    constructor() {
        super({
            id: 'notebook.toggleLineNumbersFromEditorTitle',
            title: localize2('notebook.toggleLineNumbers', 'Toggle Notebook Line Numbers'),
            shortTitle: localize2('notebook.toggleLineNumbers.short', 'Line Numbers'),
            precondition: NOTEBOOK_EDITOR_FOCUSED,
            menu: [
                {
                    id: MenuId.NotebookEditorLayoutConfigure,
                    group: 'notebookLayoutDetails',
                    order: 1,
                    when: NOTEBOOK_IS_ACTIVE_EDITOR
                }
            ],
            category: NOTEBOOK_ACTIONS_CATEGORY,
            f1: true,
            toggled: {
                condition: ContextKeyExpr.notEquals('config.notebook.lineNumbers', 'off'),
                title: localize('notebook.showLineNumbers', "Line Numbers"),
            }
        });
    }
    async run(accessor) {
        return accessor.get(ICommandService).executeCommand('notebook.toggleLineNumbers');
    }
});
registerAction2(class ToggleCellToolbarPositionFromEditorTitle extends Action2 {
    constructor() {
        super({
            id: 'notebook.toggleCellToolbarPositionFromEditorTitle',
            title: localize2('notebook.toggleCellToolbarPosition', 'Toggle Cell Toolbar Position'),
            menu: [{
                    id: MenuId.NotebookEditorLayoutConfigure,
                    group: 'notebookLayoutDetails',
                    order: 3
                }],
            category: NOTEBOOK_ACTIONS_CATEGORY,
            f1: false
        });
    }
    async run(accessor, ...args) {
        return accessor.get(ICommandService).executeCommand('notebook.toggleCellToolbarPosition', ...args);
    }
});
registerAction2(class ToggleBreadcrumbFromEditorTitle extends Action2 {
    constructor() {
        super({
            id: 'breadcrumbs.toggleFromEditorTitle',
            title: localize2('notebook.toggleBreadcrumb', 'Toggle Breadcrumbs'),
            shortTitle: localize2('notebook.toggleBreadcrumb.short', 'Breadcrumbs'),
            toggled: {
                condition: ContextKeyExpr.equals('config.breadcrumbs.enabled', true),
                title: localize('cmd.toggle2', "Breadcrumbs")
            },
            menu: [{
                    id: MenuId.NotebookEditorLayoutConfigure,
                    group: 'notebookLayoutDetails',
                    order: 2
                }],
            category: NOTEBOOK_ACTIONS_CATEGORY,
            f1: false
        });
    }
    async run(accessor) {
        return accessor.get(ICommandService).executeCommand('breadcrumbs.toggle');
    }
});
registerAction2(class SaveMimeTypeDisplayOrder extends Action2 {
    constructor() {
        super({
            id: 'notebook.saveMimeTypeOrder',
            title: localize2('notebook.saveMimeTypeOrder', "Save Mimetype Display Order"),
            f1: true,
            category: NOTEBOOK_ACTIONS_CATEGORY,
            precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
        });
    }
    run(accessor) {
        const service = accessor.get(INotebookService);
        const disposables = new DisposableStore();
        const qp = disposables.add(accessor.get(IQuickInputService).createQuickPick());
        qp.placeholder = localize('notebook.placeholder', 'Settings file to save in');
        qp.items = [
            { target: 2 /* ConfigurationTarget.USER */, label: localize('saveTarget.machine', 'User Settings') },
            { target: 5 /* ConfigurationTarget.WORKSPACE */, label: localize('saveTarget.workspace', 'Workspace Settings') },
        ];
        disposables.add(qp.onDidAccept(() => {
            const target = qp.selectedItems[0]?.target;
            if (target !== undefined) {
                service.saveMimeDisplayOrder(target);
            }
            qp.dispose();
        }));
        disposables.add(qp.onDidHide(() => disposables.dispose()));
        qp.show();
    }
});
registerAction2(class NotebookWebviewResetAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.notebook.layout.webview.reset',
            title: localize2('workbench.notebook.layout.webview.reset.label', "Reset Notebook Webview"),
            f1: false,
            category: NOTEBOOK_ACTIONS_CATEGORY
        });
    }
    run(accessor, args) {
        const editorService = accessor.get(IEditorService);
        if (args) {
            const uri = URI.revive(args);
            const notebookEditorService = accessor.get(INotebookEditorService);
            const widgets = notebookEditorService.listNotebookEditors().filter(widget => widget.hasModel() && widget.textModel.uri.toString() === uri.toString());
            for (const widget of widgets) {
                if (widget.hasModel()) {
                    widget.getInnerWebview()?.reload();
                }
            }
        }
        else {
            const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
            if (!editor) {
                return;
            }
            editor.getInnerWebview()?.reload();
        }
    }
});
registerAction2(class ToggleNotebookStickyScroll extends Action2 {
    constructor() {
        super({
            id: 'notebook.action.toggleNotebookStickyScroll',
            title: {
                ...localize2('toggleStickyScroll', "Toggle Notebook Sticky Scroll"),
                mnemonicTitle: localize({ key: 'mitoggleNotebookStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Sticky Scroll"),
            },
            shortTitle: localize2('toggleStickyScroll.short', "Sticky Scroll"),
            category: Categories.View,
            toggled: {
                condition: ContextKeyExpr.equals('config.notebook.stickyScroll.enabled', true),
                title: localize('notebookStickyScroll', "Sticky Scroll"),
                mnemonicTitle: localize({ key: 'mitoggleNotebookStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Sticky Scroll"),
            },
            menu: [
                { id: MenuId.CommandPalette },
                { id: MenuId.NotebookStickyScrollContext, group: 'notebookView', order: 2 },
                { id: MenuId.NotebookToolbarContext, group: 'notebookView', order: 2 }
            ]
        });
    }
    async run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const newValue = !configurationService.getValue('notebook.stickyScroll.enabled');
        return configurationService.updateValue('notebook.stickyScroll.enabled', newValue);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0QWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJvbGxlci9sYXlvdXRBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbkgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUMzSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFFekYsT0FBTyxFQUFFLGtCQUFrQixFQUFrQixNQUFNLHlEQUF5RCxDQUFDO0FBQzdHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQzdELE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlC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