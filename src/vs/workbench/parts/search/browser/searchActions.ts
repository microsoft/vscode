/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import DOM = require('vs/base/browser/dom');
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
import { Keybinding, KeyCode, KeyMod, CommonKeybindings } from 'vs/base/common/keyCodes';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';

export function isSearchViewletFocussed(viewletService: IViewletService):boolean {
	let activeViewlet= viewletService.getActiveViewlet();
	let activeElement= document.activeElement;
	return activeViewlet && activeViewlet.getId() === Constants.VIEWLET_ID && activeElement && DOM.isAncestor(activeElement, (<SearchViewlet>activeViewlet).getContainer().getHTMLElement());
}

export function appendKeyBindingLabel(label: string, keyBinding: Keybinding, keyBindingService2: IKeybindingService):string
export function appendKeyBindingLabel(label: string, keyBinding: number, keyBindingService2: IKeybindingService):string
export function appendKeyBindingLabel(label: string, keyBinding: any, keyBindingService2: IKeybindingService):string {
	keyBinding= typeof keyBinding === 'number' ? new Keybinding(keyBinding) : keyBinding;
	return label + ' (' + keyBindingService2.getLabelFor(keyBinding) + ')';
}

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
			let searchAndReplaceWidget= (<SearchViewlet>viewlet).searchAndReplaceWidget;
			searchAndReplaceWidget.toggleReplace(true);
			searchAndReplaceWidget.focus(false, true);
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

export abstract class AbstractSearchAndReplaceAction extends Action {

	protected getNextFocusElement(viewer: ITree, element: FileMatchOrMatch):FileMatchOrMatch {
		if (element === viewer.getFocus()) {
			let navigator= viewer.getNavigator();
			// navigate to current element
			while (navigator.current() !== element && !!navigator.next()) {};

			let previousElement= navigator.previous();
			if (previousElement) {
				navigator.next();
			} else {
				navigator.first();
			}

			let nextElement;
			if (element instanceof FileMatch) {
				while (!!navigator.next() && !(navigator.current() instanceof FileMatch)) {};
				nextElement= navigator.current();
			} else {
				nextElement= navigator.next();
			}
			return nextElement ? nextElement : previousElement;
		}
		return null;
	}
}

export class RemoveAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private element: FileMatchOrMatch) {
		super('remove', nls.localize('RemoveAction.label', "Remove"), 'action-remove');
	}

	public run(): TPromise<any> {
		let nextFocusElement= this.getNextFocusElement(this.viewer, this.element);
		if (nextFocusElement) {
			this.viewer.setFocus(nextFocusElement);
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

		this.viewer.DOMFocus();
		return this.viewer.refresh(elementToRefresh);
	}

}

export class ReplaceAllAction extends AbstractSearchAndReplaceAction {

	public static get KEY_BINDING(): number {
		return KeyMod.Shift | CommonKeybindings.CTRLCMD_ENTER;
	}

	constructor(private viewer: ITree, private fileMatch: FileMatch, private viewlet: SearchViewlet,
							@IReplaceService private replaceService: IReplaceService,
							@IKeybindingService keyBindingService2: IKeybindingService,
							@ITelemetryService private telemetryService: ITelemetryService) {
		super('file-action-replace-all', appendKeyBindingLabel(nls.localize('file.replaceAll.label', "Replace All"), ReplaceAllAction.KEY_BINDING, keyBindingService2), 'action-replace-all');
	}

	public run(): TPromise<any> {
		this.telemetryService.publicLog('replaceAll.action.selected');
		let nextFocusElement= this.getNextFocusElement(this.viewer, this.fileMatch);
		return this.fileMatch.parent().replace(this.fileMatch).then(() => {
			if (nextFocusElement) {
				this.viewer.setFocus(nextFocusElement);
			}
			this.viewer.DOMFocus();
			this.viewlet.open(this.fileMatch, true);
		});
	}
}

export class ReplaceAction extends AbstractSearchAndReplaceAction {

	public static get KEY_BINDING(): number {
		return KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.KEY_1;
	}

	constructor(private viewer: ITree, private element: Match, private viewlet: SearchViewlet,
				@IReplaceService private replaceService: IReplaceService,
				@IKeybindingService keyBindingService2: IKeybindingService,
				@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
				@ITelemetryService private telemetryService: ITelemetryService) {
		super('action-replace', appendKeyBindingLabel(nls.localize('match.replace.label', "Replace"), ReplaceAction.KEY_BINDING, keyBindingService2), 'action-replace');
	}

	public run(): TPromise<any> {
		this.telemetryService.publicLog('replace.action.selected');
		let nextFocusElement= this.getNextFocusElement(this.viewer, this.element);
		let elementToOpen= nextFocusElement && nextFocusElement instanceof Match ? nextFocusElement : this.element.parent();

		return this.element.parent().replace(this.element).then(() => {
			if (nextFocusElement) {
				this.viewer.setFocus(nextFocusElement);
			}
			this.viewer.DOMFocus();
			if (this.isFileActive(this.element.parent())) {
				this.viewlet.open(elementToOpen, true);
			} else {
				this.replaceService.openReplacePreviewEditor(elementToOpen, true);
			}
		});
	}

	private isFileActive(fileMatch: FileMatch): boolean {
		let activeInput = this.editorService.getActiveEditorInput();
		if (activeInput instanceof FileEditorInput) {
			return activeInput.getResource().fsPath === fileMatch.resource().fsPath;
		}
		return false;
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
