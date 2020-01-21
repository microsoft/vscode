/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { WorkspaceEdit } from 'vs/editor/common/modes';
import { BulkEditPane } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditPane';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, IViewsRegistry } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { ViewPaneContainer, ViewPane } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { PaneCompositePanel } from 'vs/workbench/browser/panel';
import { RawContextKey, IContextKeyService, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { BulkEditPreviewProvider } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditPreview';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { WorkbenchListFocusContextKey } from 'vs/platform/list/browser/listService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { URI } from 'vs/base/common/uri';
import { MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { IEditorInput } from 'vs/workbench/common/editor';
import type { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

function getBulkEditPane(panelService: IPanelService): BulkEditPane | undefined {
	let view: ViewPane | undefined;
	const activePanel = panelService.openPanel(BulkEditPane.ID, true);
	if (activePanel instanceof PaneCompositePanel) {
		view = activePanel.getViewPaneContainer().getView(BulkEditPane.ID);
	}
	if (view instanceof BulkEditPane) {
		return view;
	}
	return undefined;
}

class UXState {

	private readonly _activePanel: string | undefined;

	constructor(
		@IPanelService private readonly _panelService: IPanelService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		this._activePanel = _panelService.getActivePanel()?.getId();
	}

	restore(): void {

		// (1) restore previous panel
		if (typeof this._activePanel === 'string') {
			this._panelService.openPanel(this._activePanel);
		} else {
			this._panelService.hideActivePanel();
		}

		// (2) close preview editors
		for (let group of this._editorGroupsService.groups) {
			let previewEditors: IEditorInput[] = [];
			for (let input of group.editors) {

				let resource: URI | undefined;
				if (input instanceof DiffEditorInput) {
					resource = input.modifiedInput.getResource();
				} else {
					resource = input.getResource();
				}

				if (resource?.scheme === BulkEditPreviewProvider.Schema) {
					previewEditors.push(input);
				}
			}

			if (previewEditors.length) {
				group.closeEditors(previewEditors, { preserveFocus: true });
			}
		}
	}
}

class PreviewSession {
	constructor(
		readonly uxState: UXState,
		readonly cts: CancellationTokenSource = new CancellationTokenSource(),
	) { }
}

class BulkEditPreviewContribution {

	static readonly ctxEnabled = new RawContextKey('refactorPreview.enabled', false);

	private readonly _ctxEnabled: IContextKey<boolean>;

	private _activeSession: PreviewSession | undefined;

	constructor(
		@IPanelService private readonly _panelService: IPanelService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		bulkEditService.setPreviewHandler((edit) => this._previewEdit(edit));
		this._ctxEnabled = BulkEditPreviewContribution.ctxEnabled.bindTo(contextKeyService);
	}

	private async _previewEdit(edit: WorkspaceEdit) {
		this._ctxEnabled.set(true);

		// session
		let session: PreviewSession;
		if (this._activeSession) {
			this._activeSession.cts.dispose(true);
			session = new PreviewSession(this._activeSession.uxState);
		} else {
			session = new PreviewSession(new UXState(this._panelService, this._editorGroupsService));
		}
		this._activeSession = session;

		// the actual work...
		try {
			const view = getBulkEditPane(this._panelService);
			if (!view) {
				return edit;
			}

			const newEditOrUndefined = await view.setInput(edit, session.cts.token);
			if (!newEditOrUndefined) {
				return { edits: [] };
			}

			return newEditOrUndefined;

		} finally {
			// restore UX state
			if (this._activeSession === session) {
				this._activeSession.uxState.restore();
				this._activeSession.cts.dispose();
				this._ctxEnabled.set(false);
				this._activeSession = undefined;
			}
		}
	}
}


// CMD: accept
registerAction2(class ApplyAction extends Action2 {

	constructor() {
		super({
			id: 'refactorPreview.apply',
			title: { value: localize('apply', "Apply Refactoring"), original: 'Apply Refactoring' },
			category: localize('cat', "Refactor Preview"),
			icon: { id: 'codicon/check' },
			precondition: BulkEditPreviewContribution.ctxEnabled,
			menu: [{
				id: MenuId.BulkEditTitle,
				group: 'navigation'
			}, {
				id: MenuId.BulkEditContext,
				order: 1
			}],
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 10,
				when: ContextKeyExpr.and(BulkEditPreviewContribution.ctxEnabled, ContextKeyExpr.equals('activePanel', BulkEditPane.ID)),
				primary: KeyMod.Shift + KeyCode.Enter,
			}
		});
	}

	run(accessor: ServicesAccessor): any {
		const panelService = accessor.get(IPanelService);
		const view = getBulkEditPane(panelService);
		if (view) {
			view.accept();
		}
	}
});

// CMD: discard
registerAction2(class DiscardAction extends Action2 {

	constructor() {
		super({
			id: 'refactorPreview.discard',
			title: { value: localize('Discard', "Discard Refactoring"), original: 'Discard Refactoring' },
			category: localize('cat', "Refactor Preview"),
			icon: { id: 'codicon/clear-all' },
			precondition: BulkEditPreviewContribution.ctxEnabled,
			menu: [{
				id: MenuId.BulkEditTitle,
				group: 'navigation'
			}, {
				id: MenuId.BulkEditContext,
				order: 2
			}]
		});
	}

	run(accessor: ServicesAccessor): void | Promise<void> {
		const panelService = accessor.get(IPanelService);
		const view = getBulkEditPane(panelService);
		if (view) {
			view.discard();
		}
	}
});


// CMD: toggle change
registerAction2(class ToggleAction extends Action2 {

	constructor() {
		super({
			id: 'refactorPreview.toggleCheckedState',
			title: { value: localize('toogleSelection', "Toggle Change"), original: 'Toggle Change' },
			category: localize('cat', "Refactor Preview"),
			precondition: BulkEditPreviewContribution.ctxEnabled,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: WorkbenchListFocusContextKey,
				primary: KeyCode.Space,
			},
			menu: {
				id: MenuId.BulkEditContext,
				group: 'navigation'
			}
		});
	}

	run(accessor: ServicesAccessor): void | Promise<void> {
		const panelService = accessor.get(IPanelService);
		const view = getBulkEditPane(panelService);
		if (view) {
			view.toggleChecked();
		}
	}
});


// CMD: toggle category
registerAction2(class ToggleCategoryAction extends Action2 {

	constructor() {
		super({
			id: 'refactorPreview.groupByFile',
			title: { value: localize('groupByFile', "Group Changes By File"), original: 'Group Changes By File' },
			category: localize('cat', "Refactor Preview"),
			icon: { id: 'codicon/list-tree' },
			toggled: BulkEditPane.ctxGroupByFile,
			precondition: ContextKeyExpr.and(BulkEditPreviewContribution.ctxEnabled),
			menu: [{
				id: MenuId.BulkEditContext,
				order: 3
				// }, {
				// 	id: MenuId.BulkEditTitle,
				// 	group: 'navigation',
				// 	order: 3
			}]
		});
	}

	run(accessor: ServicesAccessor): void | Promise<void> {
		const panelService = accessor.get(IPanelService);
		const view = getBulkEditPane(panelService);
		if (view) {
			view.toggleGrouping();
		}
	}
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	BulkEditPreviewContribution, LifecyclePhase.Ready
);

const container = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: BulkEditPane.ID,
	name: localize('panel', "Refactor Preview"),
	hideIfEmpty: true,
	ctorDescriptor: new SyncDescriptor(
		ViewPaneContainer,
		[BulkEditPane.ID, BulkEditPane.ID, { mergeViewWithContainerWhenSingleView: true, donotShowContainerTitleWhenMergedWithContainer: true }]
	)
}, ViewContainerLocation.Panel);

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: BulkEditPane.ID,
	name: localize('panel', "Refactor Preview"),
	when: BulkEditPreviewContribution.ctxEnabled,
	ctorDescriptor: new SyncDescriptor(BulkEditPane),
}], container);

