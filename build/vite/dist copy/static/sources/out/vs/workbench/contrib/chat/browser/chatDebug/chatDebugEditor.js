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
var ChatDebugEditor_1;
import './media/chatDebug.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { DisposableMap, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { AGENT_DEBUG_LOG_ENABLED_SETTING } from '../../common/promptSyntax/promptTypes.js';
import { IChatWidgetService } from '../chat.js';
import { ChatDebugFilterState, registerFilterMenuItems } from './chatDebugFilters.js';
import { ChatDebugHomeView } from './chatDebugHomeView.js';
import { ChatDebugOverviewView } from './chatDebugOverviewView.js';
import { ChatDebugLogsView } from './chatDebugLogsView.js';
import { ChatDebugFlowChartView } from './chatDebugFlowChartView.js';
const $ = DOM.$;
let ChatDebugEditor = class ChatDebugEditor extends EditorPane {
    static { ChatDebugEditor_1 = this; }
    static { this.ID = 'workbench.editor.chatDebug'; }
    /**
     * Stops the streaming pipeline and clears cached events for the
     * active session. Called when navigating away from a session or
     * when the editor becomes hidden.
     */
    endActiveSession() {
        const sessionResource = this.chatDebugService.activeSessionResource;
        if (sessionResource) {
            this.chatDebugService.endSession(sessionResource);
        }
        this.chatDebugService.activeSessionResource = undefined;
    }
    constructor(group, telemetryService, themeService, storageService, instantiationService, chatDebugService, chatWidgetService, chatService, contextKeyService, configurationService) {
        super(ChatDebugEditor_1.ID, group, telemetryService, themeService, storageService);
        this.instantiationService = instantiationService;
        this.chatDebugService = chatDebugService;
        this.chatWidgetService = chatWidgetService;
        this.chatService = chatService;
        this.contextKeyService = contextKeyService;
        this.configurationService = configurationService;
        this.viewState = "home" /* ViewState.Home */;
        this.sessionModelListener = this._register(new MutableDisposable());
        this.modelChangeListeners = this._register(new DisposableMap());
    }
    createEditor(parent) {
        this.container = DOM.append(parent, $('.chat-debug-editor'));
        // Shared filter state used by both Logs and FlowChart views
        this.filterState = this._register(new ChatDebugFilterState());
        const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.container));
        this._register(registerFilterMenuItems(this.filterState, scopedContextKeyService));
        // Create sub-views via DI
        this.homeView = this._register(this.instantiationService.createInstance(ChatDebugHomeView, this.container));
        this._register(this.homeView.onNavigateToSession(sessionResource => {
            this.navigateToSession(sessionResource);
        }));
        this.overviewView = this._register(this.instantiationService.createInstance(ChatDebugOverviewView, this.container));
        this._register(this.overviewView.onNavigate(nav => {
            switch (nav) {
                case "home" /* OverviewNavigation.Home */:
                    this.endActiveSession();
                    this.showView("home" /* ViewState.Home */);
                    break;
                case "logs" /* OverviewNavigation.Logs */:
                    this.showView("logs" /* ViewState.Logs */);
                    break;
                case "flowchart" /* OverviewNavigation.FlowChart */:
                    this.showView("flowchart" /* ViewState.FlowChart */);
                    break;
            }
        }));
        this.logsView = this._register(this.instantiationService.createInstance(ChatDebugLogsView, this.container, this.filterState));
        this._register(this.logsView.onNavigate(nav => {
            switch (nav) {
                case "home" /* LogsNavigation.Home */:
                    this.endActiveSession();
                    this.showView("home" /* ViewState.Home */);
                    break;
                case "overview" /* LogsNavigation.Overview */:
                    this.showView("overview" /* ViewState.Overview */);
                    break;
            }
        }));
        this.flowChartView = this._register(this.instantiationService.createInstance(ChatDebugFlowChartView, this.container, this.filterState));
        this._register(this.flowChartView.onNavigate(nav => {
            switch (nav) {
                case "home" /* FlowChartNavigation.Home */:
                    this.endActiveSession();
                    this.showView("home" /* ViewState.Home */);
                    break;
                case "overview" /* FlowChartNavigation.Overview */:
                    this.showView("overview" /* ViewState.Overview */);
                    break;
            }
        }));
        // When new debug events arrive, refresh the active session view
        this._register(this.chatDebugService.onDidAddEvent(event => {
            if (this.viewState === "home" /* ViewState.Home */) {
                this.homeView?.render();
            }
            else if (this.chatDebugService.activeSessionResource && event.sessionResource.toString() === this.chatDebugService.activeSessionResource.toString()) {
                if (this.viewState === "overview" /* ViewState.Overview */) {
                    this.overviewView?.refresh();
                }
                else if (this.viewState === "logs" /* ViewState.Logs */) {
                    this.logsView?.refreshList();
                }
                else if (this.viewState === "flowchart" /* ViewState.FlowChart */) {
                    this.flowChartView?.refresh();
                }
            }
        }));
        // When the focused chat widget changes, refresh home view session list
        this._register(this.chatWidgetService.onDidChangeFocusedSession(() => {
            if (this.viewState === "home" /* ViewState.Home */) {
                this.homeView?.render();
            }
        }));
        this._register(this.chatService.onDidCreateModel(model => {
            // Track title changes per model, disposing the previous listener
            // for the same model URI to avoid leaks.
            const key = model.sessionResource.toString();
            this.modelChangeListeners.set(key, model.onDidChange(e => {
                if (e.kind === 'setCustomTitle') {
                    if (this.viewState === "home" /* ViewState.Home */) {
                        this.homeView?.render();
                    }
                    else if (this.viewState === "overview" /* ViewState.Overview */ || this.viewState === "logs" /* ViewState.Logs */ || this.viewState === "flowchart" /* ViewState.FlowChart */) {
                        this.overviewView?.updateBreadcrumb();
                        this.logsView?.updateBreadcrumb();
                        this.flowChartView?.updateBreadcrumb();
                    }
                }
            }));
        }));
        this._register(this.chatService.onDidDisposeSession(() => {
            if (this.viewState === "home" /* ViewState.Home */) {
                this.homeView?.render();
            }
        }));
        this.showView("home" /* ViewState.Home */);
    }
    // =====================================================================
    // View switching
    // =====================================================================
    showView(state) {
        this.viewState = state;
        this.telemetryService.publicLog2('chatDebugViewSwitched', {
            viewState: state,
        });
        if (state === "home" /* ViewState.Home */) {
            this.homeView?.show();
        }
        else {
            this.homeView?.hide();
        }
        if (state === "overview" /* ViewState.Overview */) {
            this.overviewView?.show();
        }
        else {
            this.overviewView?.hide();
        }
        if (state === "logs" /* ViewState.Logs */) {
            this.logsView?.show();
            this.doLayout();
            this.logsView?.focus();
        }
        else {
            this.logsView?.hide();
        }
        if (state === "flowchart" /* ViewState.FlowChart */) {
            this.flowChartView?.show();
        }
        else {
            this.flowChartView?.hide();
        }
    }
    navigateToSession(sessionResource, view) {
        // End the previous session's streaming pipeline before switching
        const previousSessionResource = this.chatDebugService.activeSessionResource;
        if (previousSessionResource && previousSessionResource.toString() !== sessionResource.toString()) {
            this.chatDebugService.endSession(previousSessionResource);
        }
        this.chatDebugService.activeSessionResource = sessionResource;
        if (!this.chatDebugService.hasInvokedProviders(sessionResource)) {
            this.chatDebugService.invokeProviders(sessionResource);
        }
        this.trackSessionModelChanges(sessionResource);
        this.overviewView?.setSession(sessionResource);
        this.logsView?.setSession(sessionResource);
        this.flowChartView?.setSession(sessionResource);
        this.showView(view === 'logs' ? "logs" /* ViewState.Logs */ : view === 'flowchart' ? "flowchart" /* ViewState.FlowChart */ : "overview" /* ViewState.Overview */);
    }
    trackSessionModelChanges(sessionResource) {
        const model = this.chatService.getSession(sessionResource);
        if (!model) {
            this.sessionModelListener.clear();
            return;
        }
        this.sessionModelListener.value = model.onDidChange(e => {
            if (e.kind === 'addRequest' || e.kind === 'completedRequest') {
                if (this.viewState === "overview" /* ViewState.Overview */) {
                    this.overviewView?.refresh();
                }
            }
        });
    }
    // =====================================================================
    // EditorPane overrides
    // =====================================================================
    focus() {
        if (this.viewState === "logs" /* ViewState.Logs */) {
            this.logsView?.focus();
        }
        else {
            this.container?.focus();
        }
    }
    async setInput(input, options, context, token) {
        await super.setInput(input, options, context, token);
        if (options) {
            this._applyNavigationOptions(options);
        }
    }
    setOptions(options) {
        super.setOptions(options);
        if (options) {
            this._applyNavigationOptions(options);
        }
    }
    setEditorVisible(visible) {
        super.setEditorVisible(visible);
        if (visible) {
            this.telemetryService.publicLog2('chatDebugPanelOpened');
            // If the feature flag is disabled, always reset to the home view
            if (!this.configurationService.getValue(AGENT_DEBUG_LOG_ENABLED_SETTING)) {
                this.endActiveSession();
                this.showView("home" /* ViewState.Home */);
                return;
            }
            // Re-show the current view so it reloads events from scratch,
            // ensuring correct ordering and no stale duplicates.
            // Navigation from new openEditor() options is handled by
            // setOptions → _applyNavigationOptions (fires after this).
            this.showView(this.viewState);
        }
    }
    _applyNavigationOptions(options) {
        // If the feature flag is disabled, always show the home view
        if (!this.configurationService.getValue(AGENT_DEBUG_LOG_ENABLED_SETTING)) {
            this.endActiveSession();
            this.showView("home" /* ViewState.Home */);
            return;
        }
        const { sessionResource, viewHint, filter } = options;
        if (viewHint === 'logs' && sessionResource) {
            this.navigateToSession(sessionResource, 'logs');
        }
        else if (viewHint === 'flowchart' && sessionResource) {
            this.navigateToSession(sessionResource, 'flowchart');
        }
        else if (viewHint === 'overview' && sessionResource) {
            this.navigateToSession(sessionResource, 'overview');
        }
        else if (viewHint === 'home') {
            this.endActiveSession();
            this.showView("home" /* ViewState.Home */);
        }
        else if (sessionResource) {
            this.navigateToSession(sessionResource, 'overview');
        }
        else if (this.viewState === "home" /* ViewState.Home */) {
            this.showView("home" /* ViewState.Home */);
        }
        // Apply filter text if provided (e.g. from debug events snapshot)
        if (filter !== undefined && this.filterState) {
            this.filterState.setTextFilter(filter);
            this.logsView?.setFilterText(filter);
        }
    }
    layout(dimension) {
        this.currentDimension = dimension;
        if (this.container) {
            this.container.style.width = `${dimension.width}px`;
            this.container.style.height = `${dimension.height}px`;
        }
        this.doLayout();
    }
    doLayout() {
        if (!this.currentDimension || this.viewState !== "logs" /* ViewState.Logs */) {
            return;
        }
        this.logsView?.layout(this.currentDimension);
    }
};
ChatDebugEditor = ChatDebugEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IInstantiationService),
    __param(5, IChatDebugService),
    __param(6, IChatWidgetService),
    __param(7, IChatService),
    __param(8, IContextKeyService),
    __param(9, IConfigurationService)
], ChatDebugEditor);
export { ChatDebugEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXREZWJ1Zy9jaGF0RGVidWdFZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sdUJBQXVCLENBQUM7QUFFL0IsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUcxRCxPQUFPLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFM0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUVyRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFJNUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDckUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUVoRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN0RixPQUFPLEVBQUUsaUJBQWlC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