/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import uri from 'vs/base/common/uri';
import platform = require('vs/base/common/platform');
import types = require('vs/base/common/types');
import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');

export interface ILabelProvider {

	/**
	 * Given an element returns a label for it to display in the UI.
	 */
	getLabel(element: any): string;
}

export interface IWorkspaceProvider {
	getWorkspace(): {
		resource: uri;
	}
}

export class PathLabelProvider implements ILabelProvider {
	private root: string;

	constructor(arg1?: uri|string|IWorkspaceProvider) {
		this.root = arg1 && getPath(arg1);
	}

	public getLabel(arg1: uri|string|IWorkspaceProvider): string {
		return getPathLabel(getPath(arg1), this.root);
	}
}

export function getPathLabel(arg1: uri|string, arg2?: uri|string|IWorkspaceProvider): string {
	var basepath = arg2 && getPath(arg2);
	var absolutePath = getPath(arg1);

	if (basepath && paths.isEqualOrParent(absolutePath, basepath)) {
		return paths.normalize(absolutePath.substr(basepath.length + 1 /* no leading slash/backslash */), platform.isNative);
	}

	if (platform.isWindows && absolutePath[1] === ':') {
		return paths.normalize(absolutePath.charAt(0).toUpperCase() + absolutePath.slice(1), platform.isNative);
	}

	return paths.normalize(absolutePath, platform.isNative);
}

function getPath(arg1: uri|string|IWorkspaceProvider): string {
	if (!arg1) {
		return null;
	}

	if (typeof arg1 === 'string') {
		return arg1;
	}

	if (types.isFunction((<IWorkspaceProvider>arg1).getWorkspace)) {
		var ws = (<IWorkspaceProvider>arg1).getWorkspace();
		return ws ? ws.resource.fsPath : void 0;
	}

	return (<uri>arg1).fsPath;
}