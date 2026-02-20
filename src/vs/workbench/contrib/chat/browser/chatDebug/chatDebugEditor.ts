/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatDebug.css';

import * as DOM from '../../../../../base/browser/dom.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { DisposableMap, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { chatSessionResourceToId, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IChatWidgetService } from '../chat.js';
import { ViewState, IChatDebugEditorOptions } from './chatDebugTypes.js';
import { ChatDebugHomeView } from './chatDebugHomeView.js';
import { ChatDebugOverviewView, OverviewNavigation } from './chatDebugOverviewView.js';
import { ChatDebugLogsView, LogsNavigation } from './chatDebugLogsView.js';
import { ChatDebugFlowChartView, FlowChartNavigation } from './chatDebugFlowChartView.js';

const $ = DOM.$;

export class ChatDebugEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.chatDebug';

	private container: HTMLElement | undefined;
	private currentDimension: Dimension | undefined;

	private viewState: ViewState = ViewState.Home;

	private homeView: ChatDebugHomeView | undefined;
	private overviewView: ChatDebugOverviewView | undefined;
	private logsView: ChatDebugLogsView | undefined;
	private flowChartView: ChatDebugFlowChartView | undefined;

	private readonly sessionModelListener = this._register(new MutableDisposable());
	private readonly modelChangeListeners = this._register(new DisposableMap<string>());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
	) {
		super(ChatDebugEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = DOM.append(parent, $('.chat-debug-editor'));

		// Create sub-views via DI
		this.homeView = this._register(this.instantiationService.createInstance(ChatDebugHomeView, this.container));
		this._register(this.homeView.onNavigateToSession(sessionId => {
			this.navigateToSession(sessionId);
		}));

		this.overviewView = this._register(this.instantiationService.createInstance(ChatDebugOverviewView, this.container));
		this._register(this.overviewView.onNavigate(nav => {
			switch (nav) {
				case OverviewNavigation.Home:
					this.chatDebugService.activeSessionId = undefined;
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

		this.logsView = this._register(this.instantiationService.createInstance(ChatDebugLogsView, this.container));
		this._register(this.logsView.onNavigate(nav => {
			switch (nav) {
				case LogsNavigation.Home:
					this.chatDebugService.activeSessionId = undefined;
					this.showView(ViewState.Home);
					break;
				case LogsNavigation.Overview:
					this.showView(ViewState.Overview);
					break;
			}
		}));

		this.flowChartView = this._register(this.instantiationService.createInstance(ChatDebugFlowChartView, this.container));
		this._register(this.flowChartView.onNavigate(nav => {
			switch (nav) {
				case FlowChartNavigation.Home:
					this.chatDebugService.activeSessionId = undefined;
					this.showView(ViewState.Home);
					break;
				case FlowChartNavigation.Overview:
					this.showView(ViewState.Overview);
					break;
			}
		}));

		// When new debug events arrive, refresh the current view
		this._register(this.chatDebugService.onDidAddEvent(event => {
			if (this.viewState === ViewState.Home) {
				this.homeView?.render();
			} else if (event.sessionId === this.chatDebugService.activeSessionId) {
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
			// Set up a debug event pipeline for the new session so events
			// are captured regardless of which session the debug view shows.
			const sid = chatSessionResourceToId(model.sessionResource);
			this.chatDebugService.invokeProviders(sid);
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

		// Invoke providers for all existing chat sessions so their event
		// pipelines are established and events start flowing immediately.
		for (const model of this.chatService.chatModels.get()) {
			const sid = chatSessionResourceToId(model.sessionResource);
			this.chatDebugService.invokeProviders(sid);
		}

		this.showView(ViewState.Home);
	}

	// =====================================================================
	// View switching
	// =====================================================================

	private showView(state: ViewState): void {
		this.viewState = state;

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
		} else {
			this.logsView?.hide();
		}

		if (state === ViewState.FlowChart) {
			this.flowChartView?.show();
		} else {
			this.flowChartView?.hide();
		}

	}

	navigateToSession(sessionId: string, view?: 'logs' | 'overview' | 'flowchart'): void {
		this.chatDebugService.activeSessionId = sessionId;
		this.trackSessionModelChanges(sessionId);

		this.overviewView?.setSession(sessionId);
		this.logsView?.setSession(sessionId);
		this.flowChartView?.setSession(sessionId);

		this.showView(view === 'logs' ? ViewState.Logs : view === 'flowchart' ? ViewState.FlowChart : ViewState.Overview);
	}

	private trackSessionModelChanges(sessionId: string): void {
		const sessionUri = LocalChatSessionUri.forSession(sessionId);
		const model = this.chatService.getSession(sessionUri);
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
			const options = this.options as IChatDebugEditorOptions | undefined;
			if (options) {
				this._applyNavigationOptions(options);
			} else if (this.viewState === ViewState.Home) {
				const sessionId = this.chatDebugService.activeSessionId;
				if (sessionId) {
					this.navigateToSession(sessionId, 'overview');
				} else {
					this.showView(ViewState.Home);
				}
			}
			// Otherwise, preserve the current view state (e.g. Logs)
		}
	}

	private _applyNavigationOptions(options: IChatDebugEditorOptions): void {
		const { sessionId, viewHint } = options;
		if (viewHint === 'logs' && sessionId) {
			this.navigateToSession(sessionId, 'logs');
		} else if (viewHint === 'flowchart' && sessionId) {
			this.navigateToSession(sessionId, 'flowchart');
		} else if (viewHint === 'overview' && sessionId) {
			this.navigateToSession(sessionId, 'overview');
		} else if (viewHint === 'home') {
			this.chatDebugService.activeSessionId = undefined;
			this.showView(ViewState.Home);
		} else if (sessionId) {
			this.navigateToSession(sessionId, 'overview');
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
