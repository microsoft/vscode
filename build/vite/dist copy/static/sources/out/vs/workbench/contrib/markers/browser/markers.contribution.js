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
import './markersFileDecorations.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { localize, localize2 } from '../../../../nls.js';
import { Marker, RelatedInformation, ResourceMarkers } from './markersModel.js';
import { MarkersView } from './markersView.js';
import { MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Markers, MarkersContextKeys } from '../common/markers.js';
import Messages from './messages.js';
import { Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { Extensions as ViewContainerExtensions } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { getVisbileViewContextKey, FocusedViewContext } from '../../../common/contextkeys.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewAction } from '../../../browser/parts/views/viewPane.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { viewFilterSubmenu } from '../../../browser/parts/views/viewFilter.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { problemsConfigurationNodeBase } from '../../../common/configuration.js';
import { MarkerChatContextContribution } from './markersChatContext.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ProblemsAccessibilityHelp } from './markersAccessibilityHelp.js';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: Markers.MARKER_OPEN_ACTION_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(MarkersContextKeys.MarkerFocusContextKey),
    primary: 3 /* KeyCode.Enter */,
    mac: {
        primary: 3 /* KeyCode.Enter */,
        secondary: [2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */]
    },
    handler: (accessor, args) => {
        const markersView = accessor.get(IViewsService).getActiveViewWithId(Markers.MARKERS_VIEW_ID);
        markersView.openFileAtElement(markersView.getFocusElement(), false, false, true);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: Markers.MARKER_OPEN_SIDE_ACTION_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(MarkersContextKeys.MarkerFocusContextKey),
    primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
    mac: {
        primary: 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */
    },
    handler: (accessor, args) => {
        const markersView = accessor.get(IViewsService).getActiveViewWithId(Markers.MARKERS_VIEW_ID);
        markersView.openFileAtElement(markersView.getFocusElement(), false, true, true);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: Markers.MARKER_SHOW_PANEL_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: undefined,
    primary: undefined,
    handler: async (accessor, args) => {
        await accessor.get(IViewsService).openView(Markers.MARKERS_VIEW_ID);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: Markers.MARKER_SHOW_QUICK_FIX,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: MarkersContextKeys.MarkerFocusContextKey,
    primary: 2048 /* KeyMod.CtrlCmd */ | 89 /* KeyCode.Period */,
    handler: (accessor, args) => {
        const markersView = accessor.get(IViewsService).getActiveViewWithId(Markers.MARKERS_VIEW_ID);
        const focusedElement = markersView.getFocusElement();
        if (focusedElement instanceof Marker) {
            markersView.showQuickFixes(focusedElement);
        }
    }
});
// configuration
Registry.as(Extensions.Configuration).registerConfiguration({
    ...problemsConfigurationNodeBase,
    'properties': {
        'problems.autoReveal': {
            'description': Messages.PROBLEMS_PANEL_CONFIGURATION_AUTO_REVEAL,
            'type': 'boolean',
            'default': true
        },
        'problems.defaultViewMode': {
            'description': Messages.PROBLEMS_PANEL_CONFIGURATION_VIEW_MODE,
            'type': 'string',
            'default': 'tree',
            'enum': ['table', 'tree'],
        },
        'problems.showCurrentInStatus': {
            'description': Messages.PROBLEMS_PANEL_CONFIGURATION_SHOW_CURRENT_STATUS,
            'type': 'boolean',
            'default': false
        },
        'problems.sortOrder': {
            'description': Messages.PROBLEMS_PANEL_CONFIGURATION_COMPARE_ORDER,
            'type': 'string',
            'default': 'severity',
            'enum': ['severity', 'position'],
            'enumDescriptions': [
                Messages.PROBLEMS_PANEL_CONFIGURATION_COMPARE_ORDER_SEVERITY,
                Messages.PROBLEMS_PANEL_CONFIGURATION_COMPARE_ORDER_POSITION,
            ],
        },
    }
});
const markersViewIcon = registerIcon('markers-view-icon', Codicon.warning, localize('markersViewIcon', 'View icon of the markers view.'));
// markers view container
const VIEW_CONTAINER = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
    id: Markers.MARKERS_CONTAINER_ID,
    title: Messages.MARKERS_PANEL_TITLE_PROBLEMS,
    icon: markersViewIcon,
    hideIfEmpty: true,
    order: 0,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [Markers.MARKERS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
    storageId: Markers.MARKERS_VIEW_STORAGE_ID,
}, 1 /* ViewContainerLocation.Panel */, { doNotRegisterOpenCommand: true });
Registry.as(ViewContainerExtensions.ViewsRegistry).registerViews([{
        id: Markers.MARKERS_VIEW_ID,
        containerIcon: markersViewIcon,
        name: Messages.MARKERS_PANEL_TITLE_PROBLEMS,
        canToggleVisibility: true,
        canMoveView: true,
        ctorDescriptor: new SyncDescriptor(MarkersView),
        openCommandActionDescriptor: {
            id: 'workbench.actions.view.problems',
            mnemonicTitle: localize({ key: 'miMarker', comment: ['&& denotes a mnemonic'] }, "&&Problems"),
            keybindings: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 43 /* KeyCode.KeyM */ },
            order: 0,
        }
    }], VIEW_CONTAINER);
// workbench
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
// actions
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.table.${Markers.MARKERS_VIEW_ID}.viewAsTree`,
            title: localize('viewAsTree', "View as Tree"),
            metadata: {
                description: localize2('viewAsTreeDescription', "Show the problems view as a tree.")
            },
            menu: {
                id: MenuId.ViewTitle,
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', Markers.MARKERS_VIEW_ID), MarkersContextKeys.MarkersViewModeContextKey.isEqualTo("table" /* MarkersViewMode.Table */)),
                group: 'navigation',
                order: 3
            },
            icon: Codicon.listTree,
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, view) {
        view.setViewMode("tree" /* MarkersViewMode.Tree */);
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.table.${Markers.MARKERS_VIEW_ID}.viewAsTable`,
            title: localize('viewAsTable', "View as Table"),
            metadata: {
                description: localize2('viewAsTableDescription', "Show the problems view as a table.")
            },
            menu: {
                id: MenuId.ViewTitle,
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', Markers.MARKERS_VIEW_ID), MarkersContextKeys.MarkersViewModeContextKey.isEqualTo("tree" /* MarkersViewMode.Tree */)),
                group: 'navigation',
                order: 3
            },
            icon: Codicon.listFlat,
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, view) {
        view.setViewMode("table" /* MarkersViewMode.Table */);
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.${Markers.MARKERS_VIEW_ID}.toggleErrors`,
            title: localize('show errors', "Show Errors"),
            metadata: {
                description: localize2('toggleErrorsDescription', "Show or hide errors in the problems view.")
            },
            category: localize('problems', "Problems"),
            toggled: MarkersContextKeys.ShowErrorsFilterContextKey,
            menu: {
                id: viewFilterSubmenu,
                group: '1_filter',
                when: ContextKeyExpr.equals('view', Markers.MARKERS_VIEW_ID),
                order: 1
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, view) {
        view.filters.showErrors = !view.filters.showErrors;
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.${Markers.MARKERS_VIEW_ID}.toggleWarnings`,
            title: localize('show warnings', "Show Warnings"),
            metadata: {
                description: localize2('toggleWarningsDescription', "Show or hide warnings in the problems view.")
            },
            category: localize('problems', "Problems"),
            toggled: MarkersContextKeys.ShowWarningsFilterContextKey,
            menu: {
                id: viewFilterSubmenu,
                group: '1_filter',
                when: ContextKeyExpr.equals('view', Markers.MARKERS_VIEW_ID),
                order: 2
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, view) {
        view.filters.showWarnings = !view.filters.showWarnings;
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.${Markers.MARKERS_VIEW_ID}.toggleInfos`,
            title: localize('show infos', "Show Infos"),
            category: localize('problems', "Problems"),
            toggled: MarkersContextKeys.ShowInfoFilterContextKey,
            metadata: {
                description: localize2('toggleInfosDescription', "Show or hide infos in the problems view.")
            },
            menu: {
                id: viewFilterSubmenu,
                group: '1_filter',
                when: ContextKeyExpr.equals('view', Markers.MARKERS_VIEW_ID),
                order: 3
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, view) {
        view.filters.showInfos = !view.filters.showInfos;
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.${Markers.MARKERS_VIEW_ID}.toggleActiveFile`,
            title: localize('show active file', "Show Active File Only"),
            metadata: {
                description: localize2('toggleActiveFileDescription', "Show or hide problems (errors, warnings, info) only from the active file in the problems view.")
            },
            category: localize('problems', "Problems"),
            toggled: MarkersContextKeys.ShowActiveFileFilterContextKey,
            menu: {
                id: viewFilterSubmenu,
                group: '2_filter',
                when: ContextKeyExpr.equals('view', Markers.MARKERS_VIEW_ID),
                order: 1
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, view) {
        view.filters.activeFile = !view.filters.activeFile;
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.${Markers.MARKERS_VIEW_ID}.toggleExcludedFiles`,
            title: localize('show excluded files', "Show Excluded Files"),
            metadata: {
                description: localize2('toggleExcludedFilesDescription', "Show or hide excluded files in the problems view.")
            },
            category: localize('problems', "Problems"),
            toggled: MarkersContextKeys.ShowExcludedFilesFilterContextKey.negate(),
            menu: {
                id: viewFilterSubmenu,
                group: '2_filter',
                when: ContextKeyExpr.equals('view', Markers.MARKERS_VIEW_ID),
                order: 2
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, view) {
        view.filters.excludedFiles = !view.filters.excludedFiles;
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.problems.focus',
            title: Messages.MARKERS_PANEL_SHOW_LABEL,
            category: Categories.View,
            f1: true,
        });
    }
    async run(accessor) {
        accessor.get(IViewsService).openView(Markers.MARKERS_VIEW_ID, true);
    }
});
class MarkersViewAction extends ViewAction {
    getSelectedMarkers(markersView) {
        const selection = markersView.getFocusedSelectedElements() || markersView.getAllResourceMarkers();
        const markers = [];
        const addMarker = (marker) => {
            if (!markers.includes(marker)) {
                markers.push(marker);
            }
        };
        for (const selected of selection) {
            if (selected instanceof ResourceMarkers) {
                selected.markers.forEach(addMarker);
            }
            else if (selected instanceof Marker) {
                addMarker(selected);
            }
        }
        return markers;
    }
}
registerAction2(class extends MarkersViewAction {
    constructor() {
        const when = ContextKeyExpr.and(FocusedViewContext.isEqualTo(Markers.MARKERS_VIEW_ID), MarkersContextKeys.MarkersTreeVisibilityContextKey, MarkersContextKeys.RelatedInformationFocusContextKey.toNegated());
        super({
            id: Markers.MARKER_COPY_ACTION_ID,
            title: localize2('copyMarker', 'Copy'),
            menu: {
                id: MenuId.ProblemsPanelContext,
                when,
                group: 'navigation'
            },
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */,
                when
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, markersView) {
        const clipboardService = serviceAccessor.get(IClipboardService);
        const markers = this.getSelectedMarkers(markersView);
        if (markers.length) {
            await clipboardService.writeText(`[${markers}]`);
        }
    }
});
registerAction2(class extends MarkersViewAction {
    constructor() {
        super({
            id: Markers.MARKER_COPY_MESSAGE_ACTION_ID,
            title: localize2('copyMessage', 'Copy Message'),
            menu: {
                id: MenuId.ProblemsPanelContext,
                when: MarkersContextKeys.MarkerFocusContextKey,
                group: 'navigation'
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, markersView) {
        const clipboardService = serviceAccessor.get(IClipboardService);
        const markers = this.getSelectedMarkers(markersView);
        if (markers.length) {
            await clipboardService.writeText(markers.map(m => m.marker.message).join('\n'));
        }
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: Markers.RELATED_INFORMATION_COPY_MESSAGE_ACTION_ID,
            title: localize2('copyMessage', 'Copy Message'),
            menu: {
                id: MenuId.ProblemsPanelContext,
                when: MarkersContextKeys.RelatedInformationFocusContextKey,
                group: 'navigation'
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, markersView) {
        const clipboardService = serviceAccessor.get(IClipboardService);
        const element = markersView.getFocusElement();
        if (element instanceof RelatedInformation) {
            await clipboardService.writeText(element.raw.message);
        }
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: Markers.FOCUS_PROBLEMS_FROM_FILTER,
            title: localize('focusProblemsList', "Focus problems view"),
            keybinding: {
                when: MarkersContextKeys.MarkerViewFilterFocusContextKey,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, markersView) {
        markersView.focus();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: Markers.MARKERS_VIEW_FOCUS_FILTER,
            title: localize('focusProblemsFilter', "Focus problems filter"),
            keybinding: {
                when: FocusedViewContext.isEqualTo(Markers.MARKERS_VIEW_ID),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 36 /* KeyCode.KeyF */
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, markersView) {
        markersView.focusFilter();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: Markers.MARKERS_VIEW_SHOW_MULTILINE_MESSAGE,
            title: localize2('show multiline', "Show message in multiple lines"),
            category: localize('problems', "Problems"),
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.has(getVisbileViewContextKey(Markers.MARKERS_VIEW_ID))
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, markersView) {
        markersView.setMultiline(true);
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: Markers.MARKERS_VIEW_SHOW_SINGLELINE_MESSAGE,
            title: localize2('show singleline', "Show message in single line"),
            category: localize('problems', "Problems"),
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.has(getVisbileViewContextKey(Markers.MARKERS_VIEW_ID))
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, markersView) {
        markersView.setMultiline(false);
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: Markers.MARKERS_VIEW_CLEAR_FILTER_TEXT,
            title: localize('clearFiltersText', "Clear filters text"),
            category: localize('problems', "Problems"),
            keybinding: {
                when: MarkersContextKeys.MarkerViewFilterFocusContextKey,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 9 /* KeyCode.Escape */
            },
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, markersView) {
        markersView.clearFilterText();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.treeView.${Markers.MARKERS_VIEW_ID}.collapseAll`,
            title: localize('collapseAll', "Collapse All"),
            menu: {
                id: MenuId.ViewTitle,
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', Markers.MARKERS_VIEW_ID), MarkersContextKeys.MarkersViewModeContextKey.isEqualTo("tree" /* MarkersViewMode.Tree */)),
                group: 'navigation',
                order: 2,
            },
            icon: Codicon.collapseAll,
            viewId: Markers.MARKERS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, view) {
        return view.collapseAll();
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: Markers.TOGGLE_MARKERS_VIEW_ACTION_ID,
            title: Messages.MARKERS_PANEL_TOGGLE_LABEL,
        });
    }
    async run(accessor) {
        const viewsService = accessor.get(IViewsService);
        if (viewsService.isViewVisible(Markers.MARKERS_VIEW_ID)) {
            viewsService.closeView(Markers.MARKERS_VIEW_ID);
        }
        else {
            viewsService.openView(Markers.MARKERS_VIEW_ID, true);
        }
    }
});
let MarkersStatusBarContributions = class MarkersStatusBarContributions extends Disposable {
    constructor(markerService, statusbarService, configurationService) {
        super();
        this.markerService = markerService;
        this.statusbarService = statusbarService;
        this.configurationService = configurationService;
        this.markersStatusItem = this._register(this.statusbarService.addEntry(this.getMarkersItem(), 'status.problems', 0 /* StatusbarAlignment.LEFT */, 50 /* Medium Priority */));
        const addStatusBarEntry = () => {
            this.markersStatusItemOff = this.statusbarService.addEntry(this.getMarkersItemTurnedOff(), 'status.problemsVisibility', 0 /* StatusbarAlignment.LEFT */, 49);
        };
        // Add the status bar entry if the problems is not visible
        let config = this.configurationService.getValue('problems.visibility');
        if (!config) {
            addStatusBarEntry();
        }
        this._register(this.markerService.onMarkerChanged(() => {
            this.markersStatusItem.update(this.getMarkersItem());
        }));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('problems.visibility')) {
                this.markersStatusItem.update(this.getMarkersItem());
                // Update based on what setting was changed to.
                config = this.configurationService.getValue('problems.visibility');
                if (!config && !this.markersStatusItemOff) {
                    addStatusBarEntry();
                }
                else if (config && this.markersStatusItemOff) {
                    this.markersStatusItemOff.dispose();
                    this.markersStatusItemOff = undefined;
                }
            }
        }));
    }
    getMarkersItem() {
        const markersStatistics = this.markerService.getStatistics();
        const tooltip = this.getMarkersTooltip(markersStatistics);
        return {
            name: localize('status.problems', "Problems"),
            text: this.getMarkersText(markersStatistics),
            ariaLabel: tooltip,
            tooltip,
            command: 'workbench.actions.view.toggleProblems'
        };
    }
    getMarkersItemTurnedOff() {
        // Update to true, config checked before `getMarkersItemTurnedOff` is called.
        this.statusbarService.updateEntryVisibility('status.problemsVisibility', true);
        const openSettingsCommand = 'workbench.action.openSettings';
        const configureSettingsLabel = '@id:problems.visibility';
        const tooltip = localize('status.problemsVisibilityOff', "Problems are turned off. Click to open settings.");
        return {
            name: localize('status.problemsVisibility', "Problems Visibility"),
            text: '$(whole-word)',
            ariaLabel: tooltip,
            tooltip,
            kind: 'warning',
            command: { title: openSettingsCommand, arguments: [configureSettingsLabel], id: openSettingsCommand }
        };
    }
    getMarkersTooltip(stats) {
        const errorTitle = (n) => localize('totalErrors', "Errors: {0}", n);
        const warningTitle = (n) => localize('totalWarnings', "Warnings: {0}", n);
        const infoTitle = (n) => localize('totalInfos', "Infos: {0}", n);
        const titles = [];
        if (stats.errors > 0) {
            titles.push(errorTitle(stats.errors));
        }
        if (stats.warnings > 0) {
            titles.push(warningTitle(stats.warnings));
        }
        if (stats.infos > 0) {
            titles.push(infoTitle(stats.infos));
        }
        if (titles.length === 0) {
            return localize('noProblems', "No Problems");
        }
        return titles.join(', ');
    }
    getMarkersText(stats) {
        const problemsText = [];
        // Errors
        problemsText.push('$(error) ' + this.packNumber(stats.errors));
        // Warnings
        problemsText.push('$(warning) ' + this.packNumber(stats.warnings));
        // Info (only if any)
        if (stats.infos > 0) {
            problemsText.push('$(info) ' + this.packNumber(stats.infos));
        }
        return problemsText.join(' ');
    }
    packNumber(n) {
        const manyProblems = localize('manyProblems', "10K+");
        return n > 9999 ? manyProblems : n > 999 ? n.toString().charAt(0) + 'K' : n.toString();
    }
};
MarkersStatusBarContributions = __decorate([
    __param(0, IMarkerService),
    __param(1, IStatusbarService),
    __param(2, IConfigurationService)
], MarkersStatusBarContributions);
workbenchRegistry.registerWorkbenchContribution(MarkersStatusBarContributions, 3 /* LifecyclePhase.Restored */);
registerWorkbenchContribution2(MarkerChatContextContribution.ID, MarkerChatContextContribution, 3 /* WorkbenchPhase.AfterRestored */);
let ActivityUpdater = class ActivityUpdater extends Disposable {
    constructor(activityService, markerService) {
        super();
        this.activityService = activityService;
        this.markerService = markerService;
        this.activity = this._register(new MutableDisposable());
        this._register(this.markerService.onMarkerChanged(() => this.updateBadge()));
        this.updateBadge();
    }
    updateBadge() {
        const { errors, warnings, infos } = this.markerService.getStatistics();
        const total = errors + warnings + infos;
        if (total > 0) {
            const message = localize('totalProblems', 'Total {0} Problems', total);
            this.activity.value = this.activityService.showViewActivity(Markers.MARKERS_VIEW_ID, { badge: new NumberBadge(total, () => message) });
        }
        else {
            this.activity.value = undefined;
        }
    }
};
ActivityUpdater = __decorate([
    __param(0, IActivityService),
    __param(1, IMarkerService)
], ActivityUpdater);
workbenchRegistry.registerWorkbenchContribution(ActivityUpdater, 3 /* LifecyclePhase.Restored */);
// Register Accessible View Help
AccessibleViewRegistry.register(new ProblemsAccessibilityHelp());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vycy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tYXJrZXJzL2Jyb3dzZXIvbWFya2Vycy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyw2QkFBNkIsQ0FBQztBQUNyQyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLFVBQVUsRUFBMEIsTUFBTSxvRUFBb0UsQ0FBQztBQUN4SCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOERBQThELENBQUM7QUFDMUYsT0FBTyxFQUFFLG1CQUFtQixFQUFvQixNQUFNLCtEQUErRCxDQUFDO0FBRXRILE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNoRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDL0MsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBbUIsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDcEYsT0FBTyxRQUFRLE1BQU0sZUFBZSxDQUFDO0FBQ3JDLE9BQU8sRUFBbUMsVUFBVSxJQUFJLG1CQUFtQixFQUEwQiw4QkFBOEIsRUFBa0IsTUFBTSxrQ0FBa0MsQ0FBQztBQUc5TCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUM5RixPQUFP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