/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import resources = require('vs/base/common/resources');
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { SearchViewlet } from 'vs/workbench/parts/search/browser/searchViewlet';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListService } from 'vs/platform/list/browser/listService';
import { explorerItemToFileResource } from 'vs/workbench/parts/files/common/files';
import { relative } from 'path';

export class FindInFolderAction extends Action {

	public static readonly ID = 'filesExplorer.findInFolder';

	private resource: URI;

	constructor(resource: URI, @IInstantiationService private instantiationService: IInstantiationService) {
		super(FindInFolderAction.ID, nls.localize('findInFolder', "Find in Folder..."));

		this.resource = resource;
	}

	public run(event?: any): TPromise<any> {
		return this.instantiationService.invokeFunction.apply(this.instantiationService, [findInFolderCommand, this.resource]);
	}
}

export const findInFolderCommand = (accessor: ServicesAccessor, resource?: URI) => {
	const listService = accessor.get(IListService);
	const viewletService = accessor.get(IViewletService);

	if (!URI.isUri(resource)) {
		const lastFocusedList = listService.lastFocusedList;
		const focus = lastFocusedList ? lastFocusedList.getFocus() : void 0;
		if (focus) {
			const file = explorerItemToFileResource(focus);
			if (file) {
				resource = file.isDirectory ? file.resource : resources.dirname(file.resource);
			}
		}
	}

	viewletService.openViewlet(Constants.VIEWLET_ID, true).then(viewlet => {
		if (resource) {
			(viewlet as SearchViewlet).searchInFolder(resource, (from, to) => relative(from, to));
		}
	}).done(null, errors.onUnexpectedError);
};

export class FindInWorkspaceAction extends Action {

	public static readonly ID = 'filesExplorer.findInWorkspace';

	constructor( @IViewletService private viewletService: IViewletService) {
		super(FindInWorkspaceAction.ID, nls.localize('findInWorkspace', "Find in Workspace..."));
	}

	public run(event?: any): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true).then(viewlet => {
			(viewlet as SearchViewlet).searchInFolder(null, (from, to) => relative(from, to));
		});
	}
}