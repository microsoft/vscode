/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import {asFileResource} from 'vs/workbench/parts/files/common/files';
import {ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IAction} from 'vs/base/common/actions';
import {CreateNewTerminalAction} from 'vs/workbench/parts/terminal/electron-browser/terminalActions';

export class FileViewerActionContributor extends ActionBarContributor {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		return !!asFileResource(context.element);
	}

	public getSecondaryActions(context: any): IAction[] {
		let fileResource = asFileResource(context.element);
		let resource = fileResource.resource;
		if (!fileResource.isDirectory) {
			resource = URI.file(paths.dirname(resource.fsPath));
		}

		let action = this.instantiationService.createInstance(CreateNewTerminalAction, CreateNewTerminalAction.ID, CreateNewTerminalAction.SCOPED_LABEL);
		action.setResource(resource);

		return [action];
	}
}