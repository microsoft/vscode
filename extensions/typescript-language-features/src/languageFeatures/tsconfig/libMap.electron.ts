/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { TypeScriptVersion, TypeScriptVersionSource } from '../../tsServer/versionProvider';
import { TsLibMap } from './libMap';

const libMaps = new Map<string, TsLibMap>();

/**
 * Reads the lib map from the `typescript.js` that sits beside every install's
 * `tsserver.js`, so the map is exact for that install rather than for the
 * TypeScript this extension was built against.
 *
 * Loading the module runs it. An install inside the workspace only runs once
 * the workspace is trusted, which is the same rule tsserver follows.
 */
export async function readLibMapFromInstall(version: TypeScriptVersion): Promise<TsLibMap | undefined> {
	const cached = libMaps.get(version.path);

	if (cached) {
		return cached;
	}

	if (!vscode.workspace.isTrusted && isWorkspaceInstall(version)) {
		return undefined;
	}

	let libMap: unknown;

	try {
		// The install is only known at run time, so this cannot be a static import.
		// eslint-disable-next-line no-restricted-syntax
		const typescript: { libMap?: unknown } = require(path.join(path.dirname(version.path), 'typescript.js'));
		libMap = typescript.libMap;
	} catch {
		return undefined;
	}

	if (!(libMap instanceof Map)) {
		return undefined;
	}

	libMaps.set(version.path, libMap);
	return libMap;
}

function isWorkspaceInstall(version: TypeScriptVersion): boolean {
	return version.source === TypeScriptVersionSource.NodeModules
		|| version.source === TypeScriptVersionSource.WorkspaceSetting;
}
