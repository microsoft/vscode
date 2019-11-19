/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { PANEL_ID } from 'vs/workbench/services/search/common/search';
import { SearchView, SearchViewPosition } from 'vs/workbench/contrib/search/browser/searchView';
import { Panel } from 'vs/workbench/browser/panel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { IAction } from 'vs/base/common/actions';

export class SearchPanel extends Panel {

	private readonly searchView: SearchView;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(PANEL_ID, telemetryService, themeService, storageService);
		this.searchView = this._register(instantiationService.createInstance(SearchView, SearchViewPosition.Panel, { id: PANEL_ID, title: localize('search', "Search"), actionRunner: this.getActionRunner() }));
		this._register(this.searchView.onDidChangeTitleArea(() => this.updateTitleArea()));
		this._register(this.onDidChangeVisibility(visible => this.searchView.setVisible(visible)));
	}

	create(parent: HTMLElement): void {
		dom.addClasses(parent, 'monaco-panel-view', 'search-panel');
		this.searchView.render();
		dom.append(parent, this.searchView.element);
		this.searchView.setExpanded(true);
		this.searchView.headerVisible = false;
	}

	public getTitle(): string {
		return this.searchView.title;
	}

	public layout(dimension: dom.Dimension): void {
		this.searchView.width = dimension.width;
		this.searchView.layout(dimension.height);
	}

	public focus(): void {
		this.searchView.focus();
	}

	getActions(): IAction[] {
		return this.searchView.getActions();
	}

	getSecondaryActions(): IAction[] {
		return this.searchView.getSecondaryActions();
	}

	saveState(): void {
		this.searchView.saveState();
		super.saveState();
	}

	getSearchView(): SearchView {
		return this.searchView;
	}
}
