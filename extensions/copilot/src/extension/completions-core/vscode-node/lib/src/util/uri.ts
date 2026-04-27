/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { platform } from 'os';
import { normalize } from 'path';
import { dirname as VSCODE_dirname } from '../../../../../../util/vs/base/common/resources';
import { URI } from '../../../../../../util/vs/base/common/uri';

type URIContainer = { readonly uri: string };

// Borrowed from vscode-uri internals
function decodeURIComponentGraceful(str: string): string {
	try {
		return decodeURIComponent(str);
	} catch {
		if (str.length > 3) {
			return str.substring(0, 3) + decodeURIComponentGraceful(str.substring(3));
		} else {
			return str;
		}
	}
}
const _rEncodedAsHex = /(%[0-9A-Za-z][0-9A-Za-z])+/g;
function percentDecode(str: string): string {
	if (!str.match(_rEncodedAsHex)) {
		return str;
	}
	return str.replace(_rEncodedAsHex, match => decodeURIComponentGraceful(match));
}

export function makeFsUri(fsPath: string): string {
	if (/^[A-Za-z][A-Za-z0-9+.-]+:/.test(fsPath)) {
		throw new Error('Path must not contain a scheme');
	} else if (!fsPath) {
		throw new Error('Path must not be empty');
	}
	return URI.file(fsPath).toString();
}

function parseUri(uri: URIContainer | string): URI {
	if (typeof uri !== 'string') { uri = uri.uri; }
	if (/^[A-Za-z]:\\/.test(uri)) {
		throw new Error(`Could not parse <${uri}>: Windows-style path`);
	}
	try {
		// Based on the regexp vscode-uri uses for parsing
		const match = uri.match(/^(?:([^:/?#]+?:)?\/\/)(\/\/.*)$/);
		if (match) {
			return URI.parse(match[1] + match[2], true);
		} else {
			return URI.parse(uri, true);
		}
	} catch (cause) {
		throw new Error(`Could not parse <${uri}>`, { cause });
	}
}

/**
 * Throw an exception if the URI is unparsable.
 */
/** @public KEEPING FOR TESTS */
export function validateUri<T extends URIContainer | string>(uri: T): T {
	parseUri(uri);
	return uri;
}

export function normalizeUri(uri: string): string {
	try {
		return parseUri(uri).toString();
	} catch {
		// not normalizable, return as is
		return uri;
	}
}

/**
 * URI schemes that map to real file system paths.
 */
const fsSchemes = new Set(['file', 'notebook', 'vscode-notebook', 'vscode-notebook-cell']);

/**
 * For a file system URI, returns the corresponding file system path. Otherwise
 * throws an error.
 */
export function fsPath(arg: URIContainer | string): string {
	const uri = parseUri(arg);

	if (!fsSchemes.has(uri.scheme)) {
		throw new Error(`Copilot currently does not support URI with scheme: ${uri.scheme}`);
	}

	if (platform() === 'win32') {
		let path = uri.path;

		if (uri.authority) {
			path = `//${uri.authority}${uri.path}`; // UNC path
		} else if (/^\/[A-Za-z]:/.test(path)) {
			// omit leading slash from paths with a drive letter
			path = path.substring(1);
		}
		return normalize(path);
	} else if (uri.authority) {
		throw new Error('Unsupported remote file path');
	} else {
		return uri.path;
	}
}

/**
 * For a file system URI, returns the corresponding file system path. Returns
 * undefined otherwise.
 */
export function getFsPath(uri: URIContainer | string): string | undefined {
	try {
		return fsPath(uri);
	} catch {
		return undefined;
	}
}

/**
 * Ensure a file system URI has a file: scheme.  If it's not a file system URI, return undefined.
 */
export function getFsUri(uri: URIContainer | string): string | undefined {
	const fsPath = getFsPath(uri);
	if (fsPath) {
		return URI.file(fsPath).toString();
	}
}

/**
 * Joins together multiple path components, with a URI as the base.
 */
export function joinPath(uri: string, ...paths: string[]): string;
export function joinPath(uri: URIContainer, ...paths: string[]): URIContainer;
export function joinPath(uri: URIContainer | string, ...paths: string[]): URIContainer | string;
export function joinPath(arg: URIContainer | string, ...paths: string[]): URIContainer | string {
	const uri = URI.joinPath(parseUri(arg), ...paths.map(pathToURIPath)).toString();
	return typeof arg === 'string' ? uri : { uri };
}

function pathToURIPath(fileSystemPath: string): string {
	if (isWinPath(fileSystemPath)) {
		return fileSystemPath.replaceAll('\\', '/');
	}

	return fileSystemPath;
}

/**
 * Returns true if backlash proceeds any use of forward slash in the string. E.g.:
 *
 *  - ..\path\to\file.txt is a Win path
 *  - C:\path\to\file.txt is a Win path
 *  - /unix/style/path is not
 *  - ../path/to/unusal\file.txt is not
 */
function isWinPath(path: string): boolean {
	return /^[^/\\]*\\/.test(path);
}

/**
 * Returns the base filename (no directory path) of a URI.
 */
export function basename(uri: URIContainer | string): string {
	return percentDecode(
		(typeof uri === 'string' ? uri : uri.uri)
			.replace(/[#?].*$/, '')
			.replace(/\/$/, '')
			.replace(/^.*[/:]/, '')
	);
}

/**
 * Returns the directory name of a URI.
 * If the uri scheme is a notebook, will remove the fragment and change the scheme to file.
 */
export function dirname(uri: string): string;
export function dirname(uri: URIContainer): URIContainer;
export function dirname(uri: URIContainer | string): URIContainer | string;
export function dirname(arg: URIContainer | string): URIContainer | string {
	const directoryName = VSCODE_dirname(parseUri(arg));
	let uri: string;
	if (fsSchemes.has(directoryName.scheme) && directoryName.scheme !== 'file') {
		uri = directoryName.with({ scheme: 'file', fragment: '' }).toString();
	} else {
		uri = directoryName.toString();
	}
	return typeof arg === 'string' ? uri : { uri };
}
