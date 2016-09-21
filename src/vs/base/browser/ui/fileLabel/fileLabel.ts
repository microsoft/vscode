/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IconLabel} from 'vs/base/browser/ui/iconLabel/iconLabel';
import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import types = require('vs/base/common/types');
import {IWorkspaceProvider, getPathLabel} from 'vs/base/common/labels';

export class FileLabel extends IconLabel {

	constructor(container: HTMLElement, file: uri, provider: IWorkspaceProvider) {
		super(container);

		this.setFile(file, provider);
	}

	public setFile(file: uri, provider: IWorkspaceProvider): void {
		const path = getPath(file);
		const parent = paths.dirname(path);
		
		this.setValue(paths.basename(path), parent && parent !== '.' ? getPathLabel(parent, provider) : '', { title: path });
	}
}

function getPath(arg1: uri | IWorkspaceProvider): string {
	if (!arg1) {
		return null;
	}

	if (types.isFunction((<IWorkspaceProvider>arg1).getWorkspace)) {
		const ws = (<IWorkspaceProvider>arg1).getWorkspace();

		return ws ? ws.resource.fsPath : void 0;
	}

	return (<uri>arg1).fsPath;
}