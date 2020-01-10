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
import { BulkEditPanel as BulkEditPane } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditPane';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, IViewsRegistry } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { ViewPaneContainer, ViewPane } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { PaneCompositePanel } from 'vs/workbench/browser/panel';
import { RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';

class BulkEditPreviewContribution {

	static readonly ctxEnabled = new RawContextKey('refactorPreviewIsEnabled', false);

	private readonly _ctxEnabled: IContextKey<boolean>;

	constructor(
		@IPanelService private _panelService: IPanelService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		bulkEditService.setPreviewHandler(edit => this._previewEdit(edit));
		this._ctxEnabled = BulkEditPreviewContribution.ctxEnabled.bindTo(contextKeyService);
	}

	private async _previewEdit(edit: WorkspaceEdit) {
		this._ctxEnabled.set(true);
		try {

			let view: ViewPane | undefined;
			const activePanel = this._panelService.openPanel(BulkEditPane.ID, true);
			if (activePanel instanceof PaneCompositePanel) {
				view = activePanel.getViewPaneContainer().getView(BulkEditPane.ID);
			}

			if (!(view instanceof BulkEditPane)) {
				return edit;
			}

			const newEditOrUndefined = await view.setInput(edit);
			if (!newEditOrUndefined) {
				return { edits: [] };
			}

			// todo@joh/steVen add view state
			// if (this._panelService.getLastActivePanelId() === BulkEditPanel.ID) {
			// 	this._panelService.hideActivePanel();
			// }

			return newEditOrUndefined;

		} finally {
			this._ctxEnabled.set(false);
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	BulkEditPreviewContribution, LifecyclePhase.Ready
);


const container = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: BulkEditPane.ID,
	name: localize('panel', "Refactor Preview"),
	hideIfEmpty: true,
	ctorDescriptor: {
		ctor: ViewPaneContainer,
		arguments: [BulkEditPane.ID, BulkEditPane.ID, { mergeViewWithContainerWhenSingleView: true, donotShowContainerTitleWhenMergedWithContainer: true }]
	}
}, ViewContainerLocation.Panel);

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: BulkEditPane.ID,
	name: localize('panel', "Refactor Preview"),
	when: BulkEditPreviewContribution.ctxEnabled,
	ctorDescriptor: { ctor: BulkEditPane },
}], container);

