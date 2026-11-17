/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { SESSION_ATTACHMENTS_DIRNAME } from './sessionDataService.js';

export const COPILOT_EXTENSION_DATA_DIRNAME = 'extension-data';

export interface IVSCodeSandboxReadRoots {
	readonly applicationReadRoots?: readonly URI[];
	/** Data directories whose attachment snapshots are readable: the chat's session, its own storage and where it came from. */
	readonly sessionDataDirectories?: readonly URI[];
	readonly terminalOutputDirectory?: URI;
	readonly shellInitDirectory?: URI;
}

export interface IVSCodeSandboxWriteRoots {
	readonly copilotHome?: URI;
	/** Canvas identifiers whose private state folders under `<copilotHome>/extension-data/<canvasId>` are writable. */
	readonly canvasIds?: readonly string[];
}

/** Grants application contents and session resources without exposing the session database or other host storage. */
export function getVSCodeSandboxReadRoots(options: IVSCodeSandboxReadRoots): URI[] {
	return [
		...(options.applicationReadRoots ?? []),
		...(options.sessionDataDirectories ?? []).map(directory => URI.joinPath(directory, SESSION_ATTACHMENTS_DIRNAME)),
		...(options.terminalOutputDirectory ? [options.terminalOutputDirectory] : []),
		...(options.shellInitDirectory ? [options.shellInitDirectory] : []),
	];
}

/** Grants canvas extension private state folders without exposing other extensions' data or other host storage. */
export function getVSCodeSandboxWriteRoots(options: IVSCodeSandboxWriteRoots): URI[] {
	if (!options.copilotHome || !options.canvasIds?.length) {
		return [];
	}
	const uniqueCanvasIds = [...new Set(options.canvasIds.filter(Boolean))];
	return uniqueCanvasIds.map(canvasId => URI.joinPath(options.copilotHome!, COPILOT_EXTENSION_DATA_DIRNAME, canvasId));
}
