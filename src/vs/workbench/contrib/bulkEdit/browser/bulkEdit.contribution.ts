/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IBulkEditService, IBulkEditOptions } from 'vs/editor/browser/services/bulkEditService';
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
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { WorkbenchListFocusContextKey } from 'vs/platform/list/browser/listService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';

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

class BulkEditPreviewContribution {

	static readonly ctxEnabled = new RawContextKey('refactorPreview.enabled', false);

	private readonly _ctxEnabled: IContextKey<boolean>;

	constructor(
		@IPanelService private _panelService: IPanelService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		bulkEditService.setPreviewHandler((edit, options) => this._previewEdit(edit, options));
		this._ctxEnabled = BulkEditPreviewContribution.ctxEnabled.bindTo(contextKeyService);
	}

	private async _previewEdit(edit: WorkspaceEdit, options?: IBulkEditOptions) {
		this._ctxEnabled.set(true);
		const oldActivePanel = this._panelService.getActivePanel();

		try {
			const view = getBulkEditPane(this._panelService);
			if (!view) {
				return edit;
			}

			const newEditOrUndefined = await view.setInput(edit, options?.label);
			if (!newEditOrUndefined) {
				return { edits: [] };
			}

			return newEditOrUndefined;

		} finally {
			// restore UX state

			// (1) hide refactor panel
			this._ctxEnabled.set(false);

			// (2) restore previous panel
			if (oldActivePanel) {
				this._panelService.openPanel(oldActivePanel.getId());
			} else {
				this._panelService.hideActivePanel();
			}

			// (3) close preview editors
			for (let group of this._editorGroupsService.groups) {
				for (let input of group.editors) {
					if (input instanceof DiffEditorInput && input.modifiedInput.getResource()?.scheme === BulkEditPreviewProvider.Schema) {
						group.closeEditor(input, { preserveFocus: true });
					}
				}
			}
		}
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'refactorPreview.apply',
	weight: KeybindingWeight.WorkbenchContrib,
	when: BulkEditPreviewContribution.ctxEnabled,
	primary: KeyMod.Shift + KeyCode.Enter,
	handler(accessor) {
		const panelService = accessor.get(IPanelService);
		const view = getBulkEditPane(panelService);
		if (view) {
			view.accept();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'refactorPreview.toggleCheckedState',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(BulkEditPreviewContribution.ctxEnabled, WorkbenchListFocusContextKey),
	primary: KeyCode.Space,
	handler(accessor) {
		const panelService = accessor.get(IPanelService);
		const view = getBulkEditPane(panelService);
		if (view) {
			view.toggleChecked();
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

