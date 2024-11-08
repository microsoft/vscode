/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
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
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true),
						ContextKeyExpr.equals(`config.${NotebookSetting.openGettingStarted}`, true)
					),
					order: 0
				},
				{
					id: MenuId.NotebookToolbar,
					group: 'notebookLayout',
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals('config.notebook.globalToolbar', true),
						ContextKeyExpr.equals(`config.${NotebookSetting.openGettingStarted}`, true)
					),
					order: 0
				}
			]
		});
	}
	run(accessor: ServicesAccessor): void {
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
	run(accessor: ServicesAccessor): void {
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
	run(accessor: ServicesAccessor): void {
		accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@tag:notebookLayout' });
	}
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	submenu: MenuId.NotebookEditorLayoutConfigure,
	rememberDefaultAction: false,
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
			precondition: NOTEBOOK_EDITOR_FOCUSED,
			menu: [
				{
					id: MenuId.NotebookEditorLayoutConfigure,
					group: 'notebookLayoutDetails',
					order: 1,
					when: NOTEBOOK_IS_ACTIVE_EDITOR
				}],
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true,
			toggled: {
				condition: ContextKeyExpr.notEquals('config.notebook.lineNumbers', 'off'),
				title: localize('notebook.showLineNumbers', "Notebook Line Numbers"),
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
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

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		return accessor.get(ICommandService).executeCommand('notebook.toggleCellToolbarPosition', ...args);
	}
});

registerAction2(class ToggleBreadcrumbFromEditorTitle extends Action2 {
	constructor() {
		super({
			id: 'breadcrumbs.toggleFromEditorTitle',
			title: localize2('notebook.toggleBreadcrumb', 'Toggle Breadcrumbs'),
			menu: [{
				id: MenuId.NotebookEditorLayoutConfigure,
				group: 'notebookLayoutDetails',
				order: 2
			}],
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
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

	run(accessor: ServicesAccessor) {
		const service = accessor.get(INotebookService);
		const disposables = new DisposableStore();
		const qp = disposables.add(accessor.get(IQuickInputService).createQuickPick<IQuickPickItem & { target: ConfigurationTarget }>());
		qp.placeholder = localize('notebook.placeholder', 'Settings file to save in');
		qp.items = [
			{ target: ConfigurationTarget.USER, label: localize('saveTarget.machine', 'User Settings') },
			{ target: ConfigurationTarget.WORKSPACE, label: localize('saveTarget.workspace', 'Workspace Settings') },
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
	run(accessor: ServicesAccessor, args?: UriComponents): void {
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
		} else {
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
				mnemonicTitle: localize({ key: 'mitoggleNotebookStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Toggle Notebook Sticky Scroll"),
			},
			category: Categories.View,
			toggled: {
				condition: ContextKeyExpr.equals('config.notebook.stickyScroll.enabled', true),
				title: localize('notebookStickyScroll', "Toggle Notebook Sticky Scroll"),
				mnemonicTitle: localize({ key: 'mitoggleNotebookStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Toggle Notebook Sticky Scroll"),
			},
			menu: [
				{ id: MenuId.CommandPalette },
				{
					id: MenuId.NotebookStickyScrollContext,
					group: 'notebookView',
					order: 2
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue('notebook.stickyScroll.enabled');
		return configurationService.updateValue('notebook.stickyScroll.enabled', newValue);
	}
});
