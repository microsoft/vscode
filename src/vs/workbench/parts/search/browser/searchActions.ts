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
import { SearchResult, Match, FileMatch, FileMatchOrMatch } from 'vs/workbench/parts/search/common/searchModel';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { CollapseAllAction as TreeCollapseAction } from 'vs/base/parts/tree/browser/treeDefaults';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { OpenGlobalSettingsAction } from 'vs/workbench/browser/actions/openSettings';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class OpenSearchViewletAction extends ToggleViewletAction {

	public static ID = Constants.VIEWLET_ID;
	public static LABEL = nls.localize('showSearchViewlet', "Show Search");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, Constants.VIEWLET_ID, viewletService, editorService);
	}

}

export class ReplaceInFilesAction extends Action {

	public static ID = 'workbench.action.replaceInFiles';
	public static LABEL = nls.localize('replaceInFiles', "Replace in Files");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true).then((viewlet) => {
			(<SearchViewlet>viewlet).showReplace();
		});
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

export class RemoveAction extends Action {

	constructor(private viewer: ITree, private element: FileMatchOrMatch) {
		super('remove', nls.localize('RemoveAction.label', "Remove"), 'action-remove');
	}

	public run(retainFocus: boolean= true): TPromise<any> {

		if (this.element === this.viewer.getFocus()) {
			let nextFocusElement= this.getNextFocusElement();
			if (nextFocusElement) {
				this.viewer.setFocus(nextFocusElement);
			} else {
				this.viewer.focusPrevious();
			}
		}

		let elementToRefresh: any;
		if (this.element instanceof FileMatch) {
			let parent:SearchResult= <SearchResult>this.element.parent();
			parent.remove(<FileMatch>this.element);
			elementToRefresh= parent;
		} else {
			let parent: FileMatch= <FileMatch>this.element.parent();
			parent.remove(<Match>this.element);
			elementToRefresh= parent.count() === 0 ? parent.parent() : parent;
		}

		if (retainFocus && this.viewer.getFocus()) {
			this.viewer.DOMFocus();
		}
		return this.viewer.refresh(elementToRefresh);
	}

	private getNextFocusElement():FileMatchOrMatch {
		let navigator= this.viewer.getNavigator();
		while (navigator.current() !== this.element && !!navigator.next()) {};
		if (this.element instanceof FileMatch) {
			while (!!navigator.next() && !(navigator.current() instanceof FileMatch)) {};
			return navigator.current();
		} else {
			return navigator.next();
		}
	}
}

export class ReplaceAllAction extends Action {

	constructor(private viewer: ITree, private fileMatch: FileMatch, private viewlet: SearchViewlet,
							@IReplaceService private replaceService: IReplaceService,
							@ITelemetryService private telemetryService: ITelemetryService) {
		super('file-action-replace-all', nls.localize('file.replaceAll.label', "Replace All"), 'action-replace-all');
	}

	public run(): TPromise<any> {
		this.telemetryService.publicLog('replaceAll.action.selected');
		return this.replaceService.replace([this.fileMatch], this.fileMatch.parent().replaceText).then(() => {
			this.viewlet.open(this.fileMatch).done(() => {
				new RemoveAction(this.viewer, this.fileMatch).run();
			}, errors.onUnexpectedError);
		});
	}
}

export class ReplaceAction extends Action {

	constructor(private viewer: ITree, private element: Match, private viewlet: SearchViewlet,
				@IReplaceService private replaceService: IReplaceService,
				@ITelemetryService private telemetryService: ITelemetryService) {
		super('action-replace', nls.localize('match.replace.label', "Replace"), 'action-replace');
	}

	public run(): TPromise<any> {
		this.telemetryService.publicLog('replace.action.selected');
		return this.replaceService.replace(this.element, this.element.parent().parent().replaceText).then(() => {
			this.viewlet.open(this.element).done(() => {
				new RemoveAction(this.viewer, this.element).run(false);
			}, errors.onUnexpectedError);
		});
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
