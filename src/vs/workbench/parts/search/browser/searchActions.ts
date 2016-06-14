/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { SearchViewlet } from 'vs/workbench/parts/search/browser/searchViewlet';
import { Match, FileMatch } from 'vs/workbench/parts/search/common/searchModel';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { CollapseAllAction as TreeCollapseAction } from 'vs/base/parts/tree/browser/treeDefaults';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { OpenGlobalSettingsAction } from 'vs/workbench/browser/actions/openSettings';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';

export class OpenSearchViewletAction extends ToggleViewletAction {

	public static ID = Constants.VIEWLET_ID;
	public static LABEL = nls.localize('showSearchViewlet', "Show Search");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, Constants.VIEWLET_ID, viewletService, editorService);
	}
}

export class FindInFolderAction extends Action {

	private resource: URI;

	constructor(resource: URI, @IViewletService private viewletService: IViewletService) {
		super('workbench.search.action.findInFolder', nls.localize('findInFolder', "Find in Folder"));

		this.resource = resource;
	}

	public run(event?: any): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true).then((viewlet: SearchViewlet) => {
			viewlet.searchInFolder(this.resource);
		});
	}
}

export class RefreshAction extends Action {

	constructor(private viewlet: SearchViewlet) {
		super('refresh');

		this.label = nls.localize('RefreshAction.label', "Refresh");
		this.enabled = false;
		this.class = 'search-action refresh';
	}

	public run(): TPromise<void> {
		this.viewlet.onQueryChanged(true);

		return TPromise.as(null);
	}
}

export class CollapseAllAction extends TreeCollapseAction {

	constructor(viewlet: SearchViewlet) {
		super(viewlet.getControl(), false);
		this.class = 'search-action collapse';
	}
}

export class ClearSearchResultsAction extends Action {

	constructor(private viewlet: SearchViewlet) {
		super('clearSearchResults');

		this.label = nls.localize('ClearSearchResultsAction.label', "Clear Search Results");
		this.enabled = false;
		this.class = 'search-action clear-search-results';
	}

	public run(): TPromise<void> {
		this.viewlet.clearSearchResults();

		return TPromise.as(null);
	}
}

export class SelectOrRemoveAction extends Action {
	private selectMode: boolean;
	private viewlet: SearchViewlet;

	constructor(viewlet: SearchViewlet) {
		super('selectOrRemove');

		this.label = nls.localize('SelectOrRemoveAction.selectLabel', "Select");
		this.enabled = false;
		this.selectMode = true;
		this.viewlet = viewlet;
	}

	public run(): TPromise<any> {
		let result: TPromise<any>;

		if (this.selectMode) {
			result = this.runAsSelect();
		} else {
			result = this.runAsRemove();
		}

		this.selectMode = !this.selectMode;
		this.label = this.selectMode ? nls.localize('SelectOrRemoveAction.selectLabel', "Select") : nls.localize('SelectOrRemoveAction.removeLabel', "Remove");

		return result;
	}

	private runAsSelect(): TPromise<void> {
		this.viewlet.getResults().addClass('select');

		return TPromise.as(null);
	}

	private runAsRemove(): TPromise<void> {
		let elements: any[] = [];
		let tree: ITree = this.viewlet.getControl();

		tree.getInput().matches().forEach((fileMatch: FileMatch) => {
			fileMatch.matches().filter((lineMatch: Match) => {
				return (<any>lineMatch).$checked;
			}).forEach((lineMatch: Match) => {
				lineMatch.parent().remove(lineMatch);
				elements.push(lineMatch.parent());
			});
		});

		this.viewlet.getResults().removeClass('select');

		if (elements.length > 0) {
			return tree.refreshAll(elements).then(() => {
				return tree.refresh();
			});
		}

		return TPromise.as(null);
	}
}

export class RemoveAction extends Action {

	private viewer: ITree;
	private fileMatch: FileMatch;

	constructor(viewer: ITree, element: FileMatch) {
		super('remove', nls.localize('RemoveAction.label', "Remove"), 'action-remove');

		this.viewer = viewer;
		this.fileMatch = element;
	}

	public run(): TPromise<any> {
		let parent = this.fileMatch.parent();
		parent.remove(this.fileMatch);

		return this.viewer.refresh(parent);
	}
}

export class ConfigureGlobalExclusionsAction extends Action {

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
		super('configureGlobalExclusionsAction');

		this.label = nls.localize('ConfigureGlobalExclusionsAction.label', "Open Settings");
		this.enabled = true;
		this.class = 'search-configure-exclusions';
	}

	public run(): TPromise<void> {
		let action = this.instantiationService.createInstance(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL);
		action.run().done(() => action.dispose(), errors.onUnexpectedError);

		return TPromise.as(null);
	}
}
