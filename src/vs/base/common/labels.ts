/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import platform = require('vs/base/common/platform');
import types = require('vs/base/common/types');
import { nativeSep, isEqualOrParent, normalize } from 'vs/base/common/paths';
import { endsWith, ltrim } from 'vs/base/common/strings';

export interface ILabelProvider {

	/**
	 * Given an element returns a label for it to display in the UI.
	 */
	getLabel(element: any): string;
}

export interface IWorkspaceProvider {
	getWorkspace(): {
		resource: URI;
	};
}

export class PathLabelProvider implements ILabelProvider {
	private root: string;

	constructor(arg1?: URI | string | IWorkspaceProvider) {
		this.root = arg1 && getPath(arg1);
	}

	public getLabel(arg1: URI | string | IWorkspaceProvider): string {
		return getPathLabel(getPath(arg1), this.root);
	}
}

export function getPathLabel(resource: URI | string, basePathProvider?: URI | string | IWorkspaceProvider): string {
	const absolutePath = getPath(resource);
	if (!absolutePath) {
		return null;
	}

	const basepath = basePathProvider && getPath(basePathProvider);

	if (basepath && isEqualOrParent(absolutePath, basepath)) {
		if (basepath === absolutePath) {
			return ''; // no label if pathes are identical
		}

		return normalize(ltrim(absolutePath.substr(basepath.length), nativeSep), true);
	}

	if (platform.isWindows && absolutePath && absolutePath[1] === ':') {
		return normalize(absolutePath.charAt(0).toUpperCase() + absolutePath.slice(1), true); // convert c:\something => C:\something
	}

	return normalize(absolutePath, true);
}

function getPath(arg1: URI | string | IWorkspaceProvider): string {
	if (!arg1) {
		return null;
	}

	if (typeof arg1 === 'string') {
		return arg1;
	}

	if (types.isFunction((<IWorkspaceProvider>arg1).getWorkspace)) {
		const ws = (<IWorkspaceProvider>arg1).getWorkspace();
		return ws ? ws.resource.fsPath : void 0;
	}

	return (<URI>arg1).fsPath;
}

/**
 * Shortens the paths but keeps them easy to distinguish.
 * Replaces not important parts with ellipsis.
 * Every shorten path matches only one original path and vice versa.
 */
export function shorten(paths: string[]): string[] {
	const ellipsis = '\u2026';
	let shortenedPaths: string[] = new Array(paths.length);
	let match = false;

	// for every path
	for (let path = 0; path < paths.length; path++) {
		let segments: string[] = paths[path].split(nativeSep);
		match = true;

		// pick the first shortest subpath found
		for (let subpathLength = 1; match && subpathLength <= segments.length; subpathLength++) {
			for (let start = segments.length - subpathLength; match && start >= 0; start--) {
				match = false;
				let subpath = segments.slice(start, start + subpathLength).join(nativeSep);

				// that is unique to any other path
				for (let otherPath = 0; !match && otherPath < paths.length; otherPath++) {
					if (otherPath !== path && paths[otherPath].indexOf(subpath) > -1) {
						// suffix subpath treated specially as we consider no match 'x' and 'x/...'
						let isSubpathEnding: boolean = (start + subpathLength === segments.length);
						let isOtherPathEnding: boolean = endsWith(paths[otherPath], subpath);
						match = !isSubpathEnding || isOtherPathEnding;
					}
				}

				if (!match) {
					// found unique subpath
					let result = subpath;
					if (start + subpathLength < segments.length) {
						result = result + nativeSep + ellipsis;
					}
					if (start > 0) {
						result = ellipsis + nativeSep + result;
					}
					shortenedPaths[path] = result;
				}
			}
		}

		if (match) {
			// use full path if no unique subpaths found
			shortenedPaths[path] = paths[path];
		}
	}

	return shortenedPaths;
}