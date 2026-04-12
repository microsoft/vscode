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
var BulkEditPreviewContribution_1;
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { BulkEditPane } from './bulkEditPane.js';
import { Extensions as ViewContainerExtensions } from '../../../../common/views.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { FocusedViewContext } from '../../../../common/contextkeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { RawContextKey, IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { WorkbenchListFocusContextKey } from '../../../../../platform/list/browser/listService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { MenuId, registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../../../base/common/severity.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
async function getBulkEditPane(viewsService) {
    const view = await viewsService.openView(BulkEditPane.ID, true);
    if (view instanceof BulkEditPane) {
        return view;
    }
    return undefined;
}
let UXState = class UXState {
    constructor(_paneCompositeService, _editorGroupsService) {
        this._paneCompositeService = _paneCompositeService;
        this._editorGroupsService = _editorGroupsService;
        this._activePanel = _paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */)?.getId();
    }
    async restore(panels, editors) {
        // (1) restore previous panel
        if (panels) {
            if (typeof this._activePanel === 'string') {
                await this._paneCompositeService.openPaneComposite(this._activePanel, 1 /* ViewContainerLocation.Panel */);
            }
            else {
                this._paneCompositeService.hideActivePaneComposite(1 /* ViewContainerLocation.Panel */);
            }
        }
        // (2) close preview editors
        if (editors) {
            for (const group of this._editorGroupsService.groups) {
                const previewEditors = [];
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
};
UXState = __decorate([
    __param(0, IPaneCompositePartService),
    __param(1, IEditorGroupsService)
], UXState);
class PreviewSession {
    constructor(uxState, cts = new CancellationTokenSource()) {
        this.uxState = uxState;
        this.cts = cts;
    }
}
let BulkEditPreviewContribution = class BulkEditPreviewContribution {
    static { BulkEditPreviewContribution_1 = this; }
    static { this.ID = 'workbench.contrib.bulkEditPreview'; }
    static { this.ctxEnabled = new RawContextKey('refactorPreview.enabled', false); }
    constructor(_paneCompositeService, _viewsService, _editorGroupsService, _dialogService, bulkEditService, contextKeyService) {
        this._paneCompositeService = _paneCompositeService;
        this._viewsService = _viewsService;
        this._editorGroupsService = _editorGroupsService;
        this._dialogService = _dialogService;
        bulkEditService.setPreviewHandler(edits => this._previewEdit(edits));
        this._ctxEnabled = BulkEditPreviewContribution_1.ctxEnabled.bindTo(contextKeyService);
    }
    async _previewEdit(edits) {
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
        let session;
        if (this._activeSession) {
            await this._activeSession.uxState.restore(false, true);
            this._activeSession.cts.dispose(true);
            session = new PreviewSession(uxState);
        }
        else {
            session = new PreviewSession(uxState);
        }
        this._activeSession = session;
        // the actual work...
        try {
            return await view.setInput(edits, session.cts.token) ?? [];
        }
        finally {
            // restore UX state
            if (this._activeSession === session) {
                await this._activeSession.uxState.restore(true, true);
                this._activeSession.cts.dispose();
                this._ctxEnabled.set(false);
                this._activeSession = undefined;
            }
        }
    }
};
BulkEditPreviewContribution = BulkEditPreviewContribution_1 = __decorate([
    __param(0, IPaneCompositePartService),
    __param(1, IViewsService),
    __param(2, IEditorGroupsService),
    __param(3, IDialogService),
    __param(4, IBulkEditService),
    __param(5, IContextKeyService)
], BulkEditPreviewContribution);
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
                weight: 100 /* KeybindingWeight.EditorContrib */ - 10,
                when: ContextKeyExpr.and(BulkEditPreviewContribution.ctxEnabled, FocusedViewContext.isEqualTo(BulkEditPane.ID)),
                primary: 2048 /* KeyMod.CtrlCmd */ + 3 /* KeyCode.Enter */,
            }
        });
    }
    async run(accessor) {
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
    async run(accessor) {
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: WorkbenchListFocusContextKey,
                primary: 10 /* KeyCode.Space */,
            },
            menu: {
                id: MenuId.BulkEditContext,
                group: 'navigation'
            }
        });
    }
    async run(accessor) {
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
    async run(accessor) {
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
    async run(accessor) {
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
    async run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = await getBulkEditPane(viewsService);
        view?.toggleGrouping();
    }
});
registerWorkbenchContribution2(BulkEditPreviewContribution.ID, BulkEditPreviewContribution, 2 /* WorkbenchPhase.BlockRestore */);
const refactorPreviewViewIcon = registerIcon('refactor-preview-view-icon', Codicon.lightbulb, localize('refactorPreviewViewIcon', 'View icon of the refactor preview view.'));
const container = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
    id: BulkEditPane.ID,
    title: localize2('panel', "Refactor Preview"),
    hideIfEmpty: true,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [BulkEditPane.ID, { mergeViewWithContainerWhenSingleView: true }]),
    icon: refactorPreviewViewIcon,
    storageId: BulkEditPane.ID
}, 1 /* ViewContainerLocation.Panel */);
Registry.as(ViewContainerExtensions.ViewsRegistry).registerViews([{
        id: BulkEditPane.ID,
        name: localize2('panel', "Refactor Preview"),
        when: BulkEditPreviewContribution.ctxEnabled,
        ctorDescriptor: new SyncDescriptor(BulkEditPane),
        containerIcon: refactorPreviewViewIcon,
    }], container);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa0VkaXQuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnVsa0VkaXQvYnJvd3Nlci9wcmV2aWV3L2J1bGtFZGl0LmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBa0IsOEJBQThCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQWdCLE1BQU0sMkRBQTJELENBQUM7QUFDM0csT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ2pELE9BQU8sRUFBMkIsVUFBVSxJQUFJLHVCQUF1QixFQUF5QyxNQUFNLDZCQUE2QixDQUFDO0FBQ3BKLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxhQUFhLEVBQUUsa0JBQWtCLEVBQWUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFHakcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxN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