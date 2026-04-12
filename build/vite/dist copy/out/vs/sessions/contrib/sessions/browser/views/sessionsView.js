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
import '../media/sessionsViewPane.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun } from '../../../../../base/common/observable.js';
import { OS } from '../../../../../base/common/platform.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ViewPane } from '../../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../../workbench/common/views.js';
import { sessionsSidebarBackground } from '../../../../common/theme.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { localize } from '../../../../../nls.js';
import { SessionsList, SessionsGrouping, SessionsSorting } from './sessionsList.js';
import { ISessionsManagementService } from '../sessionsManagementService.js';
import { AICustomizationShortcutsWidget } from '../aiCustomizationShortcutsWidget.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { logSessionsInteraction } from '../../../../common/sessionsTelemetry.js';
const $ = DOM.$;
export const SessionsViewId = 'sessions.workbench.view.sessionsView';
const ACTION_ID_NEW_SESSION = 'workbench.action.sessions.newChat';
const GROUPING_STORAGE_KEY = 'sessionsViewPane.grouping';
const SORTING_STORAGE_KEY = 'sessionsViewPane.sorting';
export const SessionsViewFilterSubMenu = new MenuId('SessionsViewPaneFilterSubMenu');
export const SessionsViewFilterOptionsSubMenu = new MenuId('SessionsViewPaneFilterOptionsSubMenu');
export const SessionsViewGroupingContext = new RawContextKey('sessionsViewPane.grouping', SessionsGrouping.Workspace);
export const SessionsViewSortingContext = new RawContextKey('sessionsViewPane.sorting', SessionsSorting.Created);
export const IsWorkspaceGroupCappedContext = new RawContextKey('sessionsViewPane.workspaceGroupCapped', true);
let SessionsView = class SessionsView extends ViewPane {
    constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, sessionsManagementService, hostService, storageService, telemetryService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.sessionsManagementService = sessionsManagementService;
        this.hostService = hostService;
        this.storageService = storageService;
        this.telemetryService = telemetryService;
        this.currentGrouping = SessionsGrouping.Workspace;
        this.currentSorting = SessionsSorting.Created;
        this.filterContextKeys = new Map();
        this.registeredFilterTypeIds = new Set();
        // Restore persisted grouping
        const storedGrouping = this.storageService.get(GROUPING_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        if (storedGrouping && Object.values(SessionsGrouping).includes(storedGrouping)) {
            this.currentGrouping = storedGrouping;
        }
        // Restore persisted sorting
        const storedSorting = this.storageService.get(SORTING_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        if (storedSorting && Object.values(SessionsSorting).includes(storedSorting)) {
            this.currentSorting = storedSorting;
        }
        // Ensure context keys reflect restored state immediately
        this.groupingContextKey = SessionsViewGroupingContext.bindTo(contextKeyService);
        this.groupingContextKey.set(this.currentGrouping);
        this.sortingContextKey = SessionsViewSortingContext.bindTo(contextKeyService);
        this.sortingContextKey.set(this.currentSorting);
        // Bind workspace group capped context key (will be synced with persisted state in renderBody)
        this.workspaceGroupCappedContextKey = IsWorkspaceGroupCappedContext.bindTo(contextKeyService);
    }
    renderBody(parent) {
        super.renderBody(parent);
        this.viewPaneContainer = parent;
        this.viewPaneContainer.classList.add('agent-sessions-viewpane');
        this.createControls(parent);
    }
    getLocationBasedColors() {
        const colors = super.getLocationBasedColors();
        return {
            ...colors,
            background: sessionsSidebarBackground,
            listOverrideStyles: {
                ...colors.listOverrideStyles,
                listBackground: sessionsSidebarBackground,
            }
        };
    }
    createControls(parent) {
        const sessionsContainer = DOM.append(parent, $('.agent-sessions-container'));
        // Sessions section (top, fills available space)
        const sessionsSection = DOM.append(sessionsContainer, $('.agent-sessions-section'));
        // Sessions content container
        const sessionsContent = DOM.append(sessionsSection, $('.agent-sessions-content'));
        // New Session Button
        const newSessionButtonContainer = DOM.append(sessionsContent, $('.agent-sessions-new-button-container'));
        const newSessionButton = this._register(new Button(newSessionButtonContainer, {
            ...defaultButtonStyles,
            secondary: true,
            supportIcons: true,
        }));
        newSessionButton.label = `$(${Codicon.plus.id}) ${localize('sessionLabel', "Session")}`;
        this._register(newSessionButton.onDidClick(() => {
            logSessionsInteraction(this.telemetryService, 'newSession');
            this.sessionsManagementService.openNewSessionView();
        }));
        const buttonLabel = $('.new-session-button-label');
        const keybindingHint = $('span.new-session-keybinding-hint');
        const keybindingHintLabel = this._register(new KeybindingLabel(keybindingHint, OS, {
            disableTitle: true,
            keybindingLabelBackground: 'transparent',
            keybindingLabelForeground: 'inherit',
            keybindingLabelBorder: 'transparent',
            keybindingLabelBottomBorder: undefined,
            keybindingLabelShadow: undefined,
        }));
        DOM.append(buttonLabel, ...Array.from(newSessionButton.element.childNodes));
        DOM.reset(newSessionButton.element, buttonLabel);
        const getNewSessionKeybinding = () => {
            const primaryKeybinding = this.keybindingService.lookupKeybinding(ACTION_ID_NEW_SESSION);
            const resolvedKeybindings = this.keybindingService.lookupKeybindings(ACTION_ID_NEW_SESSION);
            return primaryKeybinding ?? resolvedKeybindings[0];
        };
        let lastRenderedKeybindingLabel;
        let lastRenderedKeybindingAriaLabel;
        const updateNewSessionButtonKeybinding = () => {
            const keybinding = getNewSessionKeybinding();
            const keybindingLabel = keybinding?.getLabel() ?? undefined;
            const keybindingAriaLabel = keybinding?.getAriaLabel() ?? undefined;
            if (lastRenderedKeybindingLabel === keybindingLabel && lastRenderedKeybindingAriaLabel === keybindingAriaLabel) {
                return;
            }
            lastRenderedKeybindingLabel = keybindingLabel;
            lastRenderedKeybindingAriaLabel = keybindingAriaLabel;
            newSessionButton.element.title = keybindingLabel
                ? localize('newSessionButtonTitle', "New Session ({0})", keybindingLabel)
                : localize('newSessionButtonTitleWithoutKeybinding', "New Session");
            newSessionButton.element.setAttribute('aria-label', keybindingAriaLabel
                ? localize('newSessionButtonAriaLabel', "New Session ({0})", keybindingAriaLabel)
                : localize('newSessionButtonAriaLabelWithoutKeybinding', "New Session"));
            DOM.reset(newSessionButton.element, buttonLabel);
            keybindingHintLabel.set(keybinding);
            if (keybinding) {
                DOM.append(newSessionButton.element, keybindingHint);
            }
        };
        this._register(Event.runAndSubscribe(this.keybindingService.onDidUpdateKeybindings, updateNewSessionButtonKeybinding));
        // Sessions List Control
        this.sessionsControlContainer = DOM.append(sessionsContent, $('.agent-sessions-control-container'));
        const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(SessionsList, this.sessionsControlContainer, {
            overrideStyles: this.getLocationBasedColors().listOverrideStyles,
            grouping: () => this.currentGrouping,
            sorting: () => this.currentSorting,
            onSessionOpen: (resource, preserveFocus) => this.sessionsManagementService.openSession(resource, { preserveFocus }),
        }));
        this._register(this.onDidChangeBodyVisibility(visible => sessionsControl.setVisible(visible)));
        // Sync workspace group capped context key with persisted state
        this.workspaceGroupCappedContextKey?.set(sessionsControl.isWorkspaceGroupCapped());
        // Register session type filter actions (re-register when session types change)
        this.registerSessionTypeFilters(sessionsControl);
        this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => {
            this.registerSessionTypeFilters(sessionsControl);
        }));
        // Register status filter actions (static set, registered once)
        this.registerStatusFilters(sessionsControl);
        // Refresh sessions when window gets focus to compensate for missing events
        this._register(this.hostService.onDidChangeFocus(hasFocus => {
            if (hasFocus) {
                sessionsControl.refresh();
            }
        }));
        // Listen to list updates and restore selection if nothing is selected
        this._register(sessionsControl.onDidUpdate(() => {
            if (!sessionsControl.hasFocusOrSelection()) {
                this.restoreLastSelectedSession();
            }
        }));
        // When the active session changes, select it in the list
        this._register(autorun(reader => {
            const activeSession = this.sessionsManagementService.activeSession.read(reader);
            if (activeSession) {
                if (!sessionsControl.reveal(activeSession.resource)) {
                    sessionsControl.clearFocus();
                }
            }
            else {
                sessionsControl.clearFocus();
            }
        }));
        // AI Customization toolbar (bottom, fixed height)
        this._register(this.instantiationService.createInstance(AICustomizationShortcutsWidget, sessionsContainer, {
            onDidChangeLayout: () => {
                if (this.viewPaneContainer) {
                    const { offsetHeight, offsetWidth } = this.viewPaneContainer;
                    this.layoutBody(offsetHeight, offsetWidth);
                }
            },
        }));
    }
    restoreLastSelectedSession() {
        const activeSession = this.sessionsManagementService.activeSession.get();
        if (activeSession && this.sessionsControl) {
            this.sessionsControl.reveal(activeSession.resource);
        }
    }
    registerSessionTypeFilters(sessionsControl) {
        const sessionTypes = this.sessionsManagementService.getAllSessionTypes();
        for (let i = 0; i < sessionTypes.length; i++) {
            const type = sessionTypes[i];
            // Skip if already registered (action IDs are global and can't be re-registered)
            if (this.registeredFilterTypeIds.has(type.id)) {
                continue;
            }
            this.registeredFilterTypeIds.add(type.id);
            const contextKey = new RawContextKey(`sessionsViewPane.filterType.${type.id}`, !sessionsControl.isSessionTypeExcluded(type.id));
            const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);
            this.filterContextKeys.set(contextKey.key, { key: contextKeyInstance, getDefault: () => true });
            this._register(registerAction2(class extends Action2 {
                constructor() {
                    super({
                        id: `sessionsViewPane.filterType.${type.id}`,
                        title: type.label,
                        toggled: ContextKeyExpr.equals(contextKey.key, true),
                        menu: [{
                                id: SessionsViewFilterOptionsSubMenu,
                                group: '1_types',
                                order: i,
                            }]
                    });
                }
                run() {
                    const isExcluded = sessionsControl.isSessionTypeExcluded(type.id);
                    sessionsControl.setSessionTypeExcluded(type.id, !isExcluded);
                    contextKeyInstance.set(isExcluded); // was excluded, now included (toggle)
                }
            }));
        }
    }
    registerStatusFilters(sessionsControl) {
        const statusFilters = [
            { status: 3 /* SessionStatus.Completed */, label: localize('statusCompleted', "Completed") },
            { status: 1 /* SessionStatus.InProgress */, label: localize('statusInProgress', "In Progress") },
            { status: 2 /* SessionStatus.NeedsInput */, label: localize('statusNeedsInput', "Input Needed") },
            { status: 4 /* SessionStatus.Error */, label: localize('statusFailed', "Failed") },
        ];
        for (let i = 0; i < statusFilters.length; i++) {
            const { status, label } = statusFilters[i];
            const contextKey = new RawContextKey(`sessionsViewPane.filterStatus.${status}`, !sessionsControl.isStatusExcluded(status));
            const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);
            this.filterContextKeys.set(contextKey.key, { key: contextKeyInstance, getDefault: () => true });
            this._register(registerAction2(class extends Action2 {
                constructor() {
                    super({
                        id: `sessionsViewPane.filterStatus.${status}`,
                        title: label,
                        toggled: ContextKeyExpr.equals(contextKey.key, true),
                        menu: [{
                                id: SessionsViewFilterOptionsSubMenu,
                                group: '2_status',
                                order: i,
                            }]
                    });
                }
                run() {
                    const isExcluded = sessionsControl.isStatusExcluded(status);
                    sessionsControl.setStatusExcluded(status, !isExcluded);
                    contextKeyInstance.set(isExcluded);
                }
            }));
        }
        // Archived toggle
        const archivedContextKey = new RawContextKey('sessionsViewPane.filter.showArchived', !sessionsControl.isExcludeArchived());
        const archivedContextKeyInstance = archivedContextKey.bindTo(this.scopedContextKeyService);
        this.filterContextKeys.set(archivedContextKey.key, { key: archivedContextKeyInstance, getDefault: () => false });
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'sessionsViewPane.filterArchived',
                    title: localize('filterArchived', "Done"),
                    toggled: ContextKeyExpr.equals(archivedContextKey.key, true),
                    menu: [{
                            id: SessionsViewFilterOptionsSubMenu,
                            group: '3_props',
                            order: 0,
                        }]
                });
            }
            run() {
                const excluding = sessionsControl.isExcludeArchived();
                sessionsControl.setExcludeArchived(!excluding);
                archivedContextKeyInstance.set(excluding); // was excluding → now showing
            }
        }));
        // Read toggle
        const readContextKey = new RawContextKey('sessionsViewPane.filter.showRead', !sessionsControl.isExcludeRead());
        const readContextKeyInstance = readContextKey.bindTo(this.scopedContextKeyService);
        this.filterContextKeys.set(readContextKey.key, { key: readContextKeyInstance, getDefault: () => true });
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'sessionsViewPane.filterRead',
                    title: localize('filterRead', "Read"),
                    toggled: ContextKeyExpr.equals(readContextKey.key, true),
                    menu: [{
                            id: SessionsViewFilterOptionsSubMenu,
                            group: '3_props',
                            order: 1,
                        }]
                });
            }
            run() {
                const excluding = sessionsControl.isExcludeRead();
                sessionsControl.setExcludeRead(!excluding);
                readContextKeyInstance.set(excluding);
            }
        }));
        // Reset filter action
        const filterContextKeys = this.filterContextKeys;
        const workspaceGroupCappedContextKey = this.workspaceGroupCappedContextKey;
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'sessionsViewPane.resetFilters',
                    title: localize('resetFilters', "Reset"),
                    menu: [{
                            id: SessionsViewFilterOptionsSubMenu,
                            group: '4_reset',
                            order: 0,
                        }]
                });
            }
            run() {
                sessionsControl.resetFilters();
                for (const { key, getDefault } of filterContextKeys.values()) {
                    key.set(getDefault());
                }
                workspaceGroupCappedContextKey?.set(sessionsControl.isWorkspaceGroupCapped());
            }
        }));
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        if (!this.sessionsControl || !this.sessionsControlContainer) {
            return;
        }
        this.sessionsControl.layout(this.sessionsControlContainer.offsetHeight, width);
    }
    focus() {
        super.focus();
        this.sessionsControl?.focus();
    }
    refresh() {
        this.sessionsControl?.refresh();
    }
    openFind() {
        this.sessionsControl?.openFind();
    }
    setGrouping(grouping) {
        if (this.currentGrouping === grouping) {
            return;
        }
        this.currentGrouping = grouping;
        this.storageService.store(GROUPING_STORAGE_KEY, this.currentGrouping, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.groupingContextKey?.set(this.currentGrouping);
        this.sessionsControl?.resetSectionCollapseState();
        this.sessionsControl?.update(true);
    }
    setSorting(sorting) {
        if (this.currentSorting === sorting) {
            return;
        }
        this.currentSorting = sorting;
        this.storageService.store(SORTING_STORAGE_KEY, this.currentSorting, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.sortingContextKey?.set(this.currentSorting);
        this.sessionsControl?.update();
    }
};
SessionsView = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService),
    __param(5, IViewDescriptorService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, IThemeService),
    __param(9, IHoverService),
    __param(10, ISessionsManagementService),
    __param(11, IHostService),
    __param(12, IStorageService),
    __param(13, ITelemetryService)
], SessionsView);
export { SessionsView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9ucy9icm93c2VyL3ZpZXdzL3Nlc3Npb25zVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLCtCQUErQixDQUFDO0FBQ3ZDLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsY0FBYyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUE2QyxRQUFRLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMvSCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNsRixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw2QkFB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