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
import * as DOM from '../../../../base/browser/dom.js';
import { Action } from '../../../../base/common/actions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import Messages from './messages.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { MarkersContextKeys } from '../common/markers.js';
import './markersViewActions.css';
export class MarkersFilters extends Disposable {
    constructor(options, contextKeyService) {
        super();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._excludedFiles = MarkersContextKeys.ShowExcludedFilesFilterContextKey.bindTo(contextKeyService);
        this._excludedFiles.set(options.excludedFiles);
        this._activeFile = MarkersContextKeys.ShowActiveFileFilterContextKey.bindTo(contextKeyService);
        this._activeFile.set(options.activeFile);
        this._showWarnings = MarkersContextKeys.ShowWarningsFilterContextKey.bindTo(contextKeyService);
        this._showWarnings.set(options.showWarnings);
        this._showInfos = MarkersContextKeys.ShowInfoFilterContextKey.bindTo(contextKeyService);
        this._showInfos.set(options.showInfos);
        this._showErrors = MarkersContextKeys.ShowErrorsFilterContextKey.bindTo(contextKeyService);
        this._showErrors.set(options.showErrors);
        this.filterHistory = options.filterHistory;
    }
    get excludedFiles() {
        return !!this._excludedFiles.get();
    }
    set excludedFiles(filesExclude) {
        if (this._excludedFiles.get() !== filesExclude) {
            this._excludedFiles.set(filesExclude);
            this._onDidChange.fire({ excludedFiles: true });
        }
    }
    get activeFile() {
        return !!this._activeFile.get();
    }
    set activeFile(activeFile) {
        if (this._activeFile.get() !== activeFile) {
            this._activeFile.set(activeFile);
            this._onDidChange.fire({ activeFile: true });
        }
    }
    get showWarnings() {
        return !!this._showWarnings.get();
    }
    set showWarnings(showWarnings) {
        if (this._showWarnings.get() !== showWarnings) {
            this._showWarnings.set(showWarnings);
            this._onDidChange.fire({ showWarnings: true });
        }
    }
    get showErrors() {
        return !!this._showErrors.get();
    }
    set showErrors(showErrors) {
        if (this._showErrors.get() !== showErrors) {
            this._showErrors.set(showErrors);
            this._onDidChange.fire({ showErrors: true });
        }
    }
    get showInfos() {
        return !!this._showInfos.get();
    }
    set showInfos(showInfos) {
        if (this._showInfos.get() !== showInfos) {
            this._showInfos.set(showInfos);
            this._onDidChange.fire({ showInfos: true });
        }
    }
}
export class QuickFixAction extends Action {
    static { this.ID = 'workbench.actions.problems.quickfix'; }
    static { this.CLASS = 'markers-panel-action-quickfix ' + ThemeIcon.asClassName(Codicon.lightBulb); }
    static { this.AUTO_FIX_CLASS = QuickFixAction.CLASS + ' autofixable'; }
    get quickFixes() {
        return this._quickFixes;
    }
    set quickFixes(quickFixes) {
        this._quickFixes = quickFixes;
        this.enabled = this._quickFixes.length > 0;
    }
    autoFixable(autofixable) {
        this.class = autofixable ? QuickFixAction.AUTO_FIX_CLASS : QuickFixAction.CLASS;
    }
    constructor(marker) {
        super(QuickFixAction.ID, Messages.MARKERS_PANEL_ACTION_TOOLTIP_QUICKFIX, QuickFixAction.CLASS, false);
        this.marker = marker;
        this._onShowQuickFixes = this._register(new Emitter());
        this.onShowQuickFixes = this._onShowQuickFixes.event;
        this._quickFixes = [];
    }
    run() {
        this._onShowQuickFixes.fire();
        return Promise.resolve();
    }
}
let QuickFixActionViewItem = class QuickFixActionViewItem extends ActionViewItem {
    constructor(action, options, contextMenuService) {
        super(null, action, { ...options, icon: true, label: false });
        this.contextMenuService = contextMenuService;
    }
    onClick(event) {
        DOM.EventHelper.stop(event, true);
        this.showQuickFixes();
    }
    showQuickFixes() {
        if (!this.element) {
            return;
        }
        if (!this.isEnabled()) {
            return;
        }
        const elementPosition = DOM.getDomNodePagePosition(this.element);
        const quickFixes = this.action.quickFixes;
        if (quickFixes.length) {
            this.contextMenuService.showContextMenu({
                getAnchor: () => ({ x: elementPosition.left + 10, y: elementPosition.top + elementPosition.height + 4 }),
                getActions: () => quickFixes
            });
        }
    }
};
QuickFixActionViewItem = __decorate([
    __param(2, IContextMenuService)
], QuickFixActionViewItem);
export { QuickFixActionViewItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vyc1ZpZXdBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWFya2Vycy9icm93c2VyL21hcmtlcnNWaWV3QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxNQUFNLEVBQVcsTUFBTSxvQ0FBb0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLFFBQVEsTUFBTSxlQUFlLENBQUM7QUFDckMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR2xFLE9BQU8sRUFBUyxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxjQUFjLEVBQTBCLE1BQU0sMERBQTBELENBQUM7QUFDbEgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDMUQsT0FBTywwQkFBMEIsQ0FBQztBQW1CbEMsTUFBTSxPQUFPLGNBQWUsU0FBUSxVQUFVO0lBSzdDLFlBQVksT0FBK0IsRUFBRSxpQkFBcUM7UUFDakYsS0FBSyxFQUFFLENBQUM7UUFKUSxpQkFBWSxHQUF3QyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUE4QixDQUFDLENBQUM7UUFDdEgsZ0JBQVcsR0FBc0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7UUFLakYsSUFBSSxDQUFDLGNBQWMsR0FBRyxrQkFBa0IsQ0FBQyxpQ0FBaUMsQ0FB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