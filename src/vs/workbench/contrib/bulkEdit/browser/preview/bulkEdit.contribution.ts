/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../../platform/registry/common/platform.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IBulkEditService, ResourceEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { BulkEditPane } from './bulkEditPane.js';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, IViewsRegistry } from '../../../../common/views.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { FocusedViewContext } from '../../../../common/contextkeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { RawContextKey, IContextKeyService, IContextKey, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { WorkbenchListFocusContextKey } from '../../../../../platform/list/browser/listService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { MenuId, registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import type { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../../../base/common/severity.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';

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
					if (resource?.scheme === BulkEditPane.Schema) {
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

	static readonly ID = 'workbench.contrib.bulkEditPreview';

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
			title: localize2('apply', "Apply Refactoring"),
			category: localize2('cat', "Refactor Preview"),
			icon: Codicon.check,
			precondition: ContextKeyExpr.and(BulkEditPreviewContribution.ctxEnabled, BulkEditPane.ctxHasCheckedChanges),
			menu: [{
				id: MenuId.BulkEditContext,
				order: 1
			}],
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 10,
				when: ContextKeyExpr.and(BulkEditPreviewContribution.ctxEnabled, FocusedViewContext.isEqualTo(BulkEditPane.ID)),
				primary: KeyMod.CtrlCmd + KeyCode.Enter,
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
			title: localize2('Discard', "Discard Refactoring"),
			category: localize2('cat', "Refactor Preview"),
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
			title: localize2('toogleSelection', "Toggle Change"),
			category: localize2('cat', "Refactor Preview"),
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
			title: localize2('groupByFile', "Group Changes By File"),
			category: localize2('cat', "Refactor Preview"),
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
			title: localize2('groupByType', "Group Changes By Type"),
			category: localize2('cat', "Refactor Preview"),
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
			title: localize2('groupByType', "Group Changes By Type"),
			category: localize2('cat', "Refactor Preview"),
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

registerWorkbenchContribution2(
	BulkEditPreviewContribution.ID, BulkEditPreviewContribution, WorkbenchPhase.BlockRestore
);

const refactorPreviewViewIcon = registerIcon('refactor-preview-view-icon', Codicon.lightbulb, localize('refactorPreviewViewIcon', 'View icon of the refactor preview view.'));

const container = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: BulkEditPane.ID,
	title: localize2('panel', "Refactor Preview"),
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
	name: localize2('panel', "Refactor Preview"),
	when: BulkEditPreviewContribution.ctxEnabled,
	ctorDescriptor: new SyncDescriptor(BulkEditPane),
	containerIcon: refactorPreviewViewIcon,
}], container);
