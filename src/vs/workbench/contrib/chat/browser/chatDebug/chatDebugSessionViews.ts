/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { CacheExplorerNavigation, ChatDebugCacheExplorerView } from './chatDebugCacheExplorerView.js';
import { ChatDebugFilterState } from './chatDebugFilters.js';
import { ChatDebugFlowChartView, FlowChartNavigation } from './chatDebugFlowChartView.js';
import { ChatDebugLogsView, LogsNavigation } from './chatDebugLogsView.js';
import { ChatDebugWireLogView, WireLogNavigation } from './chatDebugWireLogView.js';

export const enum ChatDebugSessionView {
	Logs = 'logs',
	Flow = 'flowchart',
	Cache = 'cache',
	Wire = 'wirelog',
}

export const enum ChatDebugSessionNavigation {
	Home = 'home',
	Overview = 'overview',
}

export class ChatDebugSessionViews extends Disposable {

	private readonly _onNavigate = this._register(new Emitter<ChatDebugSessionNavigation>());
	readonly onNavigate = this._onNavigate.event;

	private readonly logsView: ChatDebugLogsView;
	private readonly flowChartView: ChatDebugFlowChartView;
	private readonly cacheExplorerView: ChatDebugCacheExplorerView;
	private readonly wireLogView: ChatDebugWireLogView;
	private currentSessionResource: URI | undefined;
	private currentView: ChatDebugSessionView | undefined;
	private currentDimension: Dimension | undefined;

	constructor(
		parent: HTMLElement,
		filterState: ChatDebugFilterState,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatDebugService chatDebugService: IChatDebugService,
	) {
		super();
		this.logsView = this._register(instantiationService.createInstance(ChatDebugLogsView, parent, filterState));
		this.flowChartView = this._register(instantiationService.createInstance(ChatDebugFlowChartView, parent, filterState));
		this.cacheExplorerView = this._register(instantiationService.createInstance(ChatDebugCacheExplorerView, parent));
		this.wireLogView = this._register(instantiationService.createInstance(ChatDebugWireLogView, parent));

		this._register(this.logsView.onNavigate(navigation => this.navigate(
			navigation === LogsNavigation.Home ? ChatDebugSessionNavigation.Home : ChatDebugSessionNavigation.Overview
		)));
		this._register(this.flowChartView.onNavigate(navigation => this.navigate(
			navigation === FlowChartNavigation.Home ? ChatDebugSessionNavigation.Home : ChatDebugSessionNavigation.Overview
		)));
		this._register(this.cacheExplorerView.onNavigate(navigation => this.navigate(
			navigation === CacheExplorerNavigation.Home ? ChatDebugSessionNavigation.Home : ChatDebugSessionNavigation.Overview
		)));
		this._register(this.wireLogView.onNavigate(navigation => this.navigate(
			navigation === WireLogNavigation.Home ? ChatDebugSessionNavigation.Home : ChatDebugSessionNavigation.Overview
		)));

		this._register(chatDebugService.onDidAddEvent(event => {
			if (!isEqual(event.sessionResource, this.currentSessionResource)) {
				return;
			}
			if (this.currentView === ChatDebugSessionView.Flow) {
				this.flowChartView.refresh();
			} else if (this.currentView === ChatDebugSessionView.Cache) {
				this.cacheExplorerView.refresh();
			} else if (this.currentView === ChatDebugSessionView.Wire) {
				this.wireLogView.refresh();
			}
		}));
	}

	private navigate(navigation: ChatDebugSessionNavigation): void {
		this._onNavigate.fire(navigation);
	}

	setSession(sessionResource: URI): void {
		this.currentSessionResource = sessionResource;
		this.logsView.setSession(sessionResource);
		this.flowChartView.setSession(sessionResource);
		this.cacheExplorerView.setSession(sessionResource);
		this.wireLogView.setSession(sessionResource);
	}

	showView(view: ChatDebugSessionView | undefined): void {
		this.currentView = view;
		view === ChatDebugSessionView.Logs ? this.logsView.show() : this.logsView.hide();
		view === ChatDebugSessionView.Flow ? this.flowChartView.show() : this.flowChartView.hide();
		view === ChatDebugSessionView.Cache ? this.cacheExplorerView.show() : this.cacheExplorerView.hide();
		view === ChatDebugSessionView.Wire ? this.wireLogView.show() : this.wireLogView.hide();
		this.doLayout();
	}

	setFilterText(filter: string): void {
		this.logsView.setFilterText(filter);
	}

	updateBreadcrumbs(): void {
		this.logsView.updateBreadcrumb();
		this.flowChartView.updateBreadcrumb();
		this.cacheExplorerView.updateBreadcrumb();
		this.wireLogView.updateBreadcrumb();
	}

	focus(): void {
		if (this.currentView === ChatDebugSessionView.Logs) {
			this.logsView.focus();
		} else if (this.currentView === ChatDebugSessionView.Wire) {
			this.wireLogView.focus();
		}
	}

	layout(dimension: Dimension): void {
		this.currentDimension = dimension;
		this.doLayout();
	}

	private doLayout(): void {
		if (!this.currentDimension) {
			return;
		}
		if (this.currentView === ChatDebugSessionView.Logs) {
			this.logsView.layout(this.currentDimension);
		} else if (this.currentView === ChatDebugSessionView.Wire) {
			this.wireLogView.layout();
		}
	}
}
