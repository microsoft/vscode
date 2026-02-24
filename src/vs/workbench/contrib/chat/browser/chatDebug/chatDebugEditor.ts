/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatDebug.css';

import * as DOM from '../../../../../base/browser/dom.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { DisposableMap, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatWidgetService } from '../chat.js';
import { ViewState, IChatDebugEditorOptions } from './chatDebugTypes.js';
import { ChatDebugFilterState, registerFilterMenuItems } from './chatDebugFilters.js';
import { ChatDebugHomeView } from './chatDebugHomeView.js';
import { ChatDebugOverviewView, OverviewNavigation } from './chatDebugOverviewView.js';
import { ChatDebugLogsView, LogsNavigation } from './chatDebugLogsView.js';
import { ChatDebugFlowChartView, FlowChartNavigation } from './chatDebugFlowChartView.js';

const $ = DOM.$;

type ChatDebugPanelOpenedClassification = {
	owner: 'vijayu';
	comment: 'Event fired when the chat debug panel is opened';
};

type ChatDebugViewSwitchedEvent = {
	viewState: string;
};

type ChatDebugViewSwitchedClassification = {
	viewState: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The view the user navigated to (home, overview, logs, flowchart).' };
	owner: 'vijayu';
	comment: 'Tracks which views users navigate to in the debug panel.';
};

export class ChatDebugEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.chatDebug';

	private container: HTMLElement | undefined;
	private currentDimension: Dimension | undefined;

	private viewState: ViewState = ViewState.Home;

	private homeView: ChatDebugHomeView | undefined;
	private overviewView: ChatDebugOverviewView | undefined;
	private logsView: ChatDebugLogsView | undefined;
	private flowChartView: ChatDebugFlowChartView | undefined;
	private filterState: ChatDebugFilterState | undefined;

	private readonly sessionModelListener = this._register(new MutableDisposable());
	private readonly modelChangeListeners = this._register(new DisposableMap<string>());

	/** Saved session resource so we can restore it after the editor is re-shown. */
	private savedSessionResource: URI | undefined;

	/**
	 * Stops the streaming pipeline and clears cached events for the
	 * active session. Called when navigating away from a session or
	 * when the editor becomes hidden.
	 */
	private endActiveSession(): void {
		const sessionResource = this.chatDebugService.activeSessionResource;
		if (sessionResource) {
			this.chatDebugService.endSession(sessionResource);
		}
		this.chatDebugService.activeSessionResource = undefined;
	}

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(ChatDebugEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
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
				case OverviewNavigation.Home:
					this.endActiveSession();
					this.showView(ViewState.Home);
					break;
				case OverviewNavigation.Logs:
					this.showView(ViewState.Logs);
					break;
				case OverviewNavigation.FlowChart:
					this.showView(ViewState.FlowChart);
					break;
			}
		}));

		this.logsView = this._register(this.instantiationService.createInstance(ChatDebugLogsView, this.container, this.filterState));
		this._register(this.logsView.onNavigate(nav => {
			switch (nav) {
				case LogsNavigation.Home:
					this.endActiveSession();
					this.showView(ViewState.Home);
					break;
				case LogsNavigation.Overview:
					this.showView(ViewState.Overview);
					break;
			}
		}));

		this.flowChartView = this._register(this.instantiationService.createInstance(ChatDebugFlowChartView, this.container, this.filterState));
		this._register(this.flowChartView.onNavigate(nav => {
			switch (nav) {
				case FlowChartNavigation.Home:
					this.endActiveSession();
					this.showView(ViewState.Home);
					break;
				case FlowChartNavigation.Overview:
					this.showView(ViewState.Overview);
					break;
			}
		}));

		// When new debug events arrive, refresh the active session view
		this._register(this.chatDebugService.onDidAddEvent(event => {
			if (this.viewState === ViewState.Home) {
				this.homeView?.render();
			} else if (this.chatDebugService.activeSessionResource && event.sessionResource.toString() === this.chatDebugService.activeSessionResource.toString()) {
				if (this.viewState === ViewState.Overview) {
					this.overviewView?.refresh();
				} else if (this.viewState === ViewState.Logs) {
					this.logsView?.refreshList();
				} else if (this.viewState === ViewState.FlowChart) {
					this.flowChartView?.refresh();
				}
			}
		}));

		// When the focused chat widget changes, refresh home view session list
		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => {
			if (this.viewState === ViewState.Home) {
				this.homeView?.render();
			}
		}));

		this._register(this.chatService.onDidCreateModel(model => {
			if (this.viewState === ViewState.Home) {
				this.homeView?.render();
			}

			// Track title changes per model, disposing the previous listener
			// for the same model URI to avoid leaks.
			const key = model.sessionResource.toString();
			this.modelChangeListeners.set(key, model.onDidChange(e => {
				if (e.kind === 'setCustomTitle') {
					if (this.viewState === ViewState.Home) {
						this.homeView?.render();
					} else if (this.viewState === ViewState.Overview || this.viewState === ViewState.Logs || this.viewState === ViewState.FlowChart) {
						this.overviewView?.updateBreadcrumb();
						this.logsView?.updateBreadcrumb();
						this.flowChartView?.updateBreadcrumb();
					}
				}
			}));
		}));

		this._register(this.chatService.onDidDisposeSession(() => {
			if (this.viewState === ViewState.Home) {
				this.homeView?.render();
			}
		}));

		this.showView(ViewState.Home);
	}

	// =====================================================================
	// View switching
	// =====================================================================

	private showView(state: ViewState): void {
		this.viewState = state;

		this.telemetryService.publicLog2<ChatDebugViewSwitchedEvent, ChatDebugViewSwitchedClassification>('chatDebugViewSwitched', {
			viewState: state,
		});

		if (state === ViewState.Home) {
			this.homeView?.show();
		} else {
			this.homeView?.hide();
		}

		if (state === ViewState.Overview) {
			this.overviewView?.show();
		} else {
			this.overviewView?.hide();
		}

		if (state === ViewState.Logs) {
			this.logsView?.show();
			this.doLayout();
			this.logsView?.focus();
		} else {
			this.logsView?.hide();
		}

		if (state === ViewState.FlowChart) {
			this.flowChartView?.show();
		} else {
			this.flowChartView?.hide();
		}

	}

	navigateToSession(sessionResource: URI, view?: 'logs' | 'overview' | 'flowchart'): void {
		// End the previous session's streaming pipeline before switching
		const previousSessionResource = this.chatDebugService.activeSessionResource;
		if (previousSessionResource && previousSessionResource.toString() !== sessionResource.toString()) {
			this.chatDebugService.endSession(previousSessionResource);
		}

		this.chatDebugService.activeSessionResource = sessionResource;
		this.chatDebugService.invokeProviders(sessionResource);
		this.trackSessionModelChanges(sessionResource);

		this.overviewView?.setSession(sessionResource);
		this.logsView?.setSession(sessionResource);
		this.flowChartView?.setSession(sessionResource);

		this.showView(view === 'logs' ? ViewState.Logs : view === 'flowchart' ? ViewState.FlowChart : ViewState.Overview);
	}

	private trackSessionModelChanges(sessionResource: URI): void {
		const model = this.chatService.getSession(sessionResource);
		if (!model) {
			this.sessionModelListener.clear();
			return;
		}
		this.sessionModelListener.value = model.onDidChange(e => {
			if (e.kind === 'addRequest' || e.kind === 'completedRequest') {
				if (this.viewState === ViewState.Overview) {
					this.overviewView?.refresh();
				}
			}
		});
	}

	// =====================================================================
	// EditorPane overrides
	// =====================================================================

	override focus(): void {
		if (this.viewState === ViewState.Logs) {
			this.logsView?.focus();
		} else {
			this.container?.focus();
		}
	}

	override setOptions(options: IChatDebugEditorOptions | undefined): void {
		super.setOptions(options);
		if (options) {
			this._applyNavigationOptions(options);
		}
	}

	override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);
		if (visible) {
			this.telemetryService.publicLog2<{}, ChatDebugPanelOpenedClassification>('chatDebugPanelOpened');
			const options = this.options as IChatDebugEditorOptions | undefined;
			if (options) {
				this._applyNavigationOptions(options);
			} else if (this.viewState === ViewState.Home) {
				// Restore the saved session resource if the editor was temporarily hidden
				const sessionResource = this.chatDebugService.activeSessionResource ?? this.savedSessionResource;
				this.savedSessionResource = undefined;
				if (sessionResource) {
					this.navigateToSession(sessionResource, 'overview');
				} else {
					this.showView(ViewState.Home);
				}
			} else {
				// Re-activate the streaming pipeline for the current session,
				// restoring the saved session resource if the editor was temporarily hidden.
				const sessionResource = this.chatDebugService.activeSessionResource ?? this.savedSessionResource;
				this.savedSessionResource = undefined;
				if (sessionResource) {
					this.chatDebugService.activeSessionResource = sessionResource;
					this.chatDebugService.invokeProviders(sessionResource);
				} else {
					this.showView(ViewState.Home);
				}
			}
		} else {
			// Remember the active session so we can restore when re-shown
			this.savedSessionResource = this.chatDebugService.activeSessionResource;
			// Stop the streaming pipeline when the editor is hidden
			this.endActiveSession();
		}
	}

	private _applyNavigationOptions(options: IChatDebugEditorOptions): void {
		const { sessionResource, viewHint } = options;
		if (viewHint === 'logs' && sessionResource) {
			this.navigateToSession(sessionResource, 'logs');
		} else if (viewHint === 'flowchart' && sessionResource) {
			this.navigateToSession(sessionResource, 'flowchart');
		} else if (viewHint === 'overview' && sessionResource) {
			this.navigateToSession(sessionResource, 'overview');
		} else if (viewHint === 'home') {
			this.endActiveSession();
			this.showView(ViewState.Home);
		} else if (sessionResource) {
			this.navigateToSession(sessionResource, 'overview');
		} else if (this.viewState === ViewState.Home) {
			this.showView(ViewState.Home);
		}
	}

	override layout(dimension: Dimension): void {
		this.currentDimension = dimension;
		if (this.container) {
			this.container.style.width = `${dimension.width}px`;
			this.container.style.height = `${dimension.height}px`;
		}
		this.doLayout();
	}

	private doLayout(): void {
		if (!this.currentDimension || this.viewState !== ViewState.Logs) {
			return;
		}
		this.logsView?.layout(this.currentDimension);
	}
}
