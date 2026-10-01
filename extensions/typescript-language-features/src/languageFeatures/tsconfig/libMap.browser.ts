/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TypeScriptVersion } from '../../tsServer/versionProvider';
import { isLibMapEntries, TsLibMap } from './libMap';

const libMaps = new Map<string, TsLibMap>();

/**
 * Reads the `libMap.json` that the bundle step writes beside the web server,
 * from the same TypeScript the lib files themselves were copied from.
 */
export async function readLibMapFromBundle(version: TypeScriptVersion): Promise<TsLibMap | undefined> {
	const cached = libMaps.get(version.path);

	if (cached) {
		return cached;
	}

	let entries: unknown;

	try {
		const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(vscode.Uri.parse(version.path), '..', 'libMap.json'));
		entries = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return undefined;
	}

	if (!isLibMapEntries(entries)) {
		return undefined;
	}

	const libMap = new Map(entries);
	libMaps.set(version.path, libMap);
	return libMap;
}
