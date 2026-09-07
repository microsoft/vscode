/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TypeScriptVersion, TypeScriptVersionSource } from '../../tsServer/versionProvider';
import { TsLibMap } from './libMap';

interface CachedLibMap {
	/** Of the `typescript.js` the map was read from, since an install can be replaced in place. */
	readonly mtime: number;
	readonly libMap: TsLibMap | undefined;
}

const libMaps = new Map<string, CachedLibMap>();

/**
 * Reads the lib map from the `typescript.js` that sits beside every install's
 * `tsserver.js`, so the map is exact for that install rather than for the
 * TypeScript this extension was built against.
 *
 * Loading the module runs it. An install inside the workspace only runs once
 * the workspace is trusted, which is the same rule tsserver follows.
 */
export async function readLibMapFromInstall(version: TypeScriptVersion): Promise<TsLibMap | undefined> {
	if (!vscode.workspace.isTrusted && isWorkspaceInstall(version)) {
		return undefined;
	}

	const modulePath = path.join(path.dirname(version.path), 'typescript.js');

	let mtime: number;

	try {
		mtime = (await fs.promises.stat(modulePath)).mtimeMs;
	} catch {
		return undefined;
	}

	const cached = libMaps.get(modulePath);

	if (cached?.mtime === mtime) {
		return cached.libMap;
	}

	// A failed read is cached as well: it costs as much as one that works, and the
	// answer only changes when the file does.
	const libMap = loadLibMap(modulePath);
	libMaps.set(modulePath, { mtime, libMap });

	return libMap;
}

/**
 * Loading the compiler is expensive, in the tens of milliseconds and tens of
 * megabytes, and it happens on the extension host thread, so only the map it
 * defines is kept and the module itself is dropped again.
 */
function loadLibMap(modulePath: string): TsLibMap | undefined {
	try {
		// The install is only known at run time, so this cannot be a static import.
		// eslint-disable-next-line no-restricted-syntax
		const typescript: { libMap?: unknown } = require(modulePath);

		return typescript.libMap instanceof Map ? typescript.libMap : undefined;
	} catch {
		return undefined;
	} finally {
		forgetModule(modulePath);
	}
}

function forgetModule(modulePath: string): void {
	try {
		delete require.cache?.[require.resolve(modulePath)];
	} catch {
		// Nothing to forget
	}
}

function isWorkspaceInstall(version: TypeScriptVersion): boolean {
	return version.source === TypeScriptVersionSource.NodeModules
		|| version.source === TypeScriptVersionSource.WorkspaceSetting;
}
