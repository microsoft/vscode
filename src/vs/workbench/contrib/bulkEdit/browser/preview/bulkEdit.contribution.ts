/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { IBulkEditService, ResourceEdit } from 'vs/editor/browser/services/bulkEditService';
import { BulkEditPane, OpenMultiDiffEditor, getBulkEditPane } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPane';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, IViewsRegistry } from 'vs/workbench/common/views';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { FocusedViewContext } from 'vs/workbench/common/contextkeys';
import { localize, localize2 } from 'vs/nls';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { RawContextKey, IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { BulkEditPreviewProvider } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { WorkbenchListFocusContextKey } from 'vs/platform/list/browser/listService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { EditorExtensions, EditorResourceAccessor, IEditorFactoryRegistry, SideBySideEditor } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IInstantiationService, type ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { BulkEditEditor, BulkEditEditorInput, BulkEditEditorResolver, BulkEditEditorSerializer } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IStorageService } from 'vs/platform/storage/common/storage';

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

	static readonly ID = 'workbench.contrib.bulkEditPreview';

	static readonly ctxEnabled = new RawContextKey('refactorPreview.enabled', false);

	private _activeSession: PreviewSession | undefined;

	constructor(
		@IPaneCompositePartService private readonly _paneCompositeService: IPaneCompositePartService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IStorageService private readonly _storageService: IStorageService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		bulkEditService.setPreviewHandler(edits => this._previewEdit(edits));
	}

	private async _previewEdit(edits: ResourceEdit[]): Promise<ResourceEdit[]> {
		console.log('inside of _previewEdit of BulkEditPreviewContribution');

		const openMultiDiffEditor = new OpenMultiDiffEditor(
			this._instantiationService,
			this._editorService,
			this._textModelService,
			this._storageService
		);

		// session
		const uxState = this._activeSession?.uxState ?? new UXState(this._paneCompositeService, this._editorGroupsService);
		let session: PreviewSession;
		if (this._activeSession) {
			await this._activeSession.uxState.restore(false, true);
			this._activeSession.cts.dispose(true);
			session = new PreviewSession(uxState);
		} else {
			session = new PreviewSession(uxState);
		}
		this._activeSession = session;

		try {

			await openMultiDiffEditor.setInput(edits, session.cts.token);
			return await openMultiDiffEditor.openMultiDiffEditorReturnInput(edits) ?? [];

		} finally {
			// restore UX state
			if (this._activeSession === session) {
				await this._activeSession.uxState.restore(true, true);
				this._activeSession.cts.dispose();
				this._activeSession = undefined;
			}
		}

		// The reason the apply discard buttons do not work is because this _previewEdit method returns early
		// It should return after one of the buttons has been clicked, which is what the code below has been doing
		// Meaning we need to change the code here in order to make it work correctly
		// By looking at the code on the left, it looks like we need to await the setInput method of the preview editor
		// currently we are just awaiting the opening of the editor, which is not what we should be awaiting on as the end condition.
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

// Refactor preview contribution
registerWorkbenchContribution2(BulkEditEditorResolver.ID, BulkEditEditorResolver, WorkbenchPhase.BlockStartup /* only registering an editor resolver */);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane)
	.registerEditorPane(
		EditorPaneDescriptor.create(BulkEditEditor, BulkEditEditor.ID, localize('name', "Bulk Edit Editor")),
		[new SyncDescriptor(BulkEditEditorInput)]
	);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(BulkEditEditorInput.ID, BulkEditEditorSerializer);
