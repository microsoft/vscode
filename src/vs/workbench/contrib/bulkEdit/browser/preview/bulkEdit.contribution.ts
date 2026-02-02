/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IBulkEditService, ResourceEdit } from 'vs/editor/browser/services/bulkEditService';
import { BulkEditPane } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPane';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, IViewsRegistry, IViewsService } from 'vs/workbench/common/views';
import { FocusedViewContext } from 'vs/workbench/common/contextkeys';
import { localize } from 'vs/nls';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { RawContextKey, IContextKeyService, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { BulkEditPreviewProvider } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { WorkbenchListFocusContextKey } from 'vs/platform/list/browser/listService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { EditorResourceAccessor, SideBySideEditor } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import type { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';

async function getBulkEditPane(viewsService: IViewsService): Promise<BulkEditPane | undefined> {
	const view = await viewsService.openView(BulkEditPane.ID, true);
	if (view instanceof BulkEditPane) {
		return view;
	}
	return undefined;
}

class UXState {

	private readonly _activePanel: string | undefined;

	constructor(
		@IPaneCompositePartService private readonly _paneCompositeService: IPaneCompositePartService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		this._activePanel = _paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.getId();
	}

	async restore(panels: boolean, editors: boolean): Promise<void> {

		// (1) restore previous panel
		if (panels) {
			if (typeof this._activePanel === 'string') {
				await this._paneCompositeService.openPaneComposite(this._activePanel, ViewContainerLocation.Panel);
			} else {
				this._paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Panel);
			}
		}

		// (2) close preview editors
		if (editors) {
			for (const group of this._editorGroupsService.groups) {
				const previewEditors: EditorInput[] = [];
				for (const input of group.editors) {

					const resource = EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.PRIMARY });
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
		@IPaneCompositePartService private readonly _paneCompositeService: IPaneCompositePartService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		bulkEditService.setPreviewHandler(edits => this._previewEdit(edits));
		this._ctxEnabled = BulkEditPreviewContribution.ctxEnabled.bindTo(contextKeyService);
	}

	private async _previewEdit(edits: ResourceEdit[]): Promise<ResourceEdit[]> {
		this._ctxEnabled.set(true);

		const uxState = this._activeSession?.uxState ?? new UXState(this._paneCompositeService, this._editorGroupsService);
		const view = await getBulkEditPane(this._viewsService);
		if (!view) {
			this._ctxEnabled.set(false);
			return edits;
		}

		// check for active preview session and let the user decide
		if (view.hasInput()) {
			const { confirmed } = await this._dialogService.confirm({
				type: Severity.Info,
				message: localize('overlap', "Another refactoring is being previewed."),
				detail: localize('detail', "Press 'Continue' to discard the previous refactoring and continue with the current refactoring."),
				primaryButton: localize({ key: 'continue', comment: ['&& denotes a mnemonic'] }, "&&Continue")
			});

			if (!confirmed) {
				return [];
			}
		}

		// session
		let session: PreviewSession;
		if (this._activeSession) {
			await this._activeSession.uxState.restore(false, true);
			this._activeSession.cts.dispose(true);
			session = new PreviewSession(uxState);
		} else {
			session = new PreviewSession(uxState);
		}
		this._activeSession = session;

		// the actual work...
		try {

			return await view.setInput(edits, session.cts.token) ?? [];

		} finally {
			// restore UX state
			if (this._activeSession === session) {
				await this._activeSession.uxState.restore(true, true);
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
			category: { value: localize('cat', "Refactor Preview"), original: 'Refactor Preview' },
			icon: Codicon.check,
			precondition: ContextKeyExpr.and(BulkEditPreviewContribution.ctxEnabled, BulkEditPane.ctxHasCheckedChanges),
			menu: [{
				id: MenuId.BulkEditContext,
				order: 1
			}],
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 10,
				when: ContextKeyExpr.and(BulkEditPreviewContribution.ctxEnabled, FocusedViewContext.isEqualTo(BulkEditPane.ID)),
				primary: KeyMod.Shift + KeyCode.Enter,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<any> {
		const viewsService = accessor.get(IViewsService);
		const view = await getBulkEditPane(viewsService);
		view?.accept();
	}
});

// CMD: discard
registerAction2(class DiscardAction extends Action2 {

	constructor() {
		super({
			id: 'refactorPreview.discard',
			title: { value: localize('Discard', "Discard Refactoring"), original: 'Discard Refactoring' },
			category: { value: localize('cat', "Refactor Preview"), original: 'Refactor Preview' },
			icon: Codicon.clearAll,
			precondition: BulkEditPreviewContribution.ctxEnabled,
			menu: [{
				id: MenuId.BulkEditContext,
				order: 2
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = await getBulkEditPane(viewsService);
		view?.discard();
	}
});


// CMD: toggle change
registerAction2(class ToggleAction extends Action2 {

	constructor() {
		super({
			id: 'refactorPreview.toggleCheckedState',
			title: { value: localize('toogleSelection', "Toggle Change"), original: 'Toggle Change' },
			category: { value: localize('cat', "Refactor Preview"), original: 'Refactor Preview' },
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

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = await getBulkEditPane(viewsService);
		view?.toggleChecked();
	}
});


// CMD: toggle category
registerAction2(class GroupByFile extends Action2 {

	constructor() {
		super({
			id: 'refactorPreview.groupByFile',
			title: { value: localize('groupByFile', "Group Changes By File"), original: 'Group Changes By File' },
			category: { value: localize('cat', "Refactor Preview"), original: 'Refactor Preview' },
			icon: Codicon.ungroupByRefType,
			precondition: ContextKeyExpr.and(BulkEditPane.ctxHasCategories, BulkEditPane.ctxGroupByFile.negate(), BulkEditPreviewContribution.ctxEnabled),
			menu: [{
				id: MenuId.BulkEditTitle,
				when: ContextKeyExpr.and(BulkEditPane.ctxHasCategories, BulkEditPane.ctxGroupByFile.negate()),
				group: 'navigation',
				order: 3,
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = await getBulkEditPane(viewsService);
		view?.groupByFile();
	}
});

registerAction2(class GroupByType extends Action2 {

	constructor() {
		super({
			id: 'refactorPreview.groupByType',
			title: { value: localize('groupByType', "Group Changes By Type"), original: 'Group Changes By Type' },
			category: { value: localize('cat', "Refactor Preview"), original: 'Refactor Preview' },
			icon: Codicon.groupByRefType,
			precondition: ContextKeyExpr.and(BulkEditPane.ctxHasCategories, BulkEditPane.ctxGroupByFile, BulkEditPreviewContribution.ctxEnabled),
			menu: [{
				id: MenuId.BulkEditTitle,
				when: ContextKeyExpr.and(BulkEditPane.ctxHasCategories, BulkEditPane.ctxGroupByFile),
				group: 'navigation',
				order: 3
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = await getBulkEditPane(viewsService);
		view?.groupByType();
	}
});

registerAction2(class ToggleGrouping extends Action2 {

	constructor() {
		super({
			id: 'refactorPreview.toggleGrouping',
			title: { value: localize('groupByType', "Group Changes By Type"), original: 'Group Changes By Type' },
			category: { value: localize('cat', "Refactor Preview"), original: 'Refactor Preview' },
			icon: Codicon.listTree,
			toggled: BulkEditPane.ctxGroupByFile.negate(),
			precondition: ContextKeyExpr.and(BulkEditPane.ctxHasCategories, BulkEditPreviewContribution.ctxEnabled),
			menu: [{
				id: MenuId.BulkEditContext,
				order: 3
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = await getBulkEditPane(viewsService);
		view?.toggleGrouping();
	}
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	BulkEditPreviewContribution, LifecyclePhase.Ready
);

const refactorPreviewViewIcon = registerIcon('refactor-preview-view-icon', Codicon.lightbulb, localize('refactorPreviewViewIcon', 'View icon of the refactor preview view.'));

const container = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: BulkEditPane.ID,
	title: { value: localize('panel', "Refactor Preview"), original: 'Refactor Preview' },
	hideIfEmpty: true,
	ctorDescriptor: new SyncDescriptor(
		ViewPaneContainer,
		[BulkEditPane.ID, { mergeViewWithContainerWhenSingleView: true }]
	),
	icon: refactorPreviewViewIcon,
	storageId: BulkEditPane.ID
}, ViewContainerLocation.Panel);

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: BulkEditPane.ID,
	name: localize('panel', "Refactor Preview"),
	when: BulkEditPreviewContribution.ctxEnabled,
	ctorDescriptor: new SyncDescriptor(BulkEditPane),
	containerIcon: refactorPreviewViewIcon,
}], container);
