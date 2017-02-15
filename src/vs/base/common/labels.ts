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
	const shortenedPaths: string[] = new Array(paths.length);

	// for every path
	let match = false;
	for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
		const path = paths[pathIndex];
		match = true;

		// pick the first shortest subpath found
		if (typeof path === 'string') { // protect against paths which are not provided if any
			const segments: string[] = path.split(nativeSep);
			for (let subpathLength = 1; match && subpathLength <= segments.length; subpathLength++) {
				for (let start = segments.length - subpathLength; match && start >= 0; start--) {
					match = false;
					const subpath = segments.slice(start, start + subpathLength).join(nativeSep);

					// that is unique to any other path
					for (let otherPathIndex = 0; !match && otherPathIndex < paths.length; otherPathIndex++) {

						// suffix subpath treated specially as we consider no match 'x' and 'x/...'
						if (otherPathIndex !== pathIndex && paths[otherPathIndex] && paths[otherPathIndex].indexOf(subpath) > -1) {
							const isSubpathEnding: boolean = (start + subpathLength === segments.length);
							const isOtherPathEnding: boolean = endsWith(paths[otherPathIndex], subpath);

							match = !isSubpathEnding || isOtherPathEnding;
						}
					}

					// found unique subpath
					if (!match) {
						let result = subpath;
						if (start + subpathLength < segments.length) {
							result = result + nativeSep + ellipsis;
						}

						if (start > 0) {
							result = ellipsis + nativeSep + result;
						}

						shortenedPaths[pathIndex] = result;
					}
				}
			}
		}

		if (match) {
			shortenedPaths[pathIndex] = path; // use full path if no unique subpaths found
		}
	}

	return shortenedPaths;
}

export interface ISeparator {
	label: string;
}

enum Type {
	TEXT,
	VARIABLE,
	SEPARATOR
}

interface ISegment {
	value: string;
	type: Type;
}

/**
 * Helper to insert values for specific template variables into the string. E.g. "this $(is) a $(template)" can be
 * passed to this function together with an object that maps "is" and "template" to strings to have them replaced.
 * @param value string to which templating is applied
 * @param values the values of the templates to use
 */
export function template(template: string, values: { [key: string]: string | ISeparator } = Object.create(null)): string {
	const segments: ISegment[] = [];

	let inVariable = false;
	let char: string;
	let curVal = '';
	for (let i = 0; i < template.length; i++) {
		char = template[i];

		// Beginning of variable
		if (char === '$' || (inVariable && char === '{')) {
			if (curVal) {
				segments.push({ value: curVal, type: Type.TEXT });
			}

			curVal = '';
			inVariable = true;
		}

		// End of variable
		else if (char === '}' && inVariable) {
			const resolved = values[curVal];

			// Variable
			if (typeof resolved === 'string') {
				if (resolved.length) {
					segments.push({ value: resolved, type: Type.VARIABLE });
				}
			}

			// Separator
			else if (resolved) {
				const prevSegment = segments[segments.length - 1];
				if (!prevSegment || prevSegment.type !== Type.SEPARATOR) {
					segments.push({ value: resolved.label, type: Type.SEPARATOR }); // prevent duplicate separators
				}
			}

			curVal = '';
			inVariable = false;
		}

		// Text or Variable Name
		else {
			curVal += char;
		}
	}

	// Tail
	if (curVal && !inVariable) {
		segments.push({ value: curVal, type: Type.TEXT });
	}

	return segments.filter((segment, index) => {

		// Only keep separator if we have values to the left and right
		if (segment.type === Type.SEPARATOR) {
			const left = segments[index - 1];
			const right = segments[index + 1];

			return [left, right].every(segment => segment && segment.type === Type.VARIABLE && segment.value.length > 0);
		}

		// accept any TEXT and VARIABLE
		return true;
	}).map(segment => segment.value).join('');
}