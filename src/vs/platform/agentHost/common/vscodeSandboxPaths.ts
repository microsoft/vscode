/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { SESSION_ATTACHMENTS_DIRNAME } from './sessionDataService.js';

interface IVSCodeSandboxReadRoots {
	/** Data directories whose attachment snapshots are readable: the chat's session, its own storage and where it came from. */
	readonly sessionDataDirectories?: readonly URI[];
	readonly terminalOutputDirectory?: URI;
	readonly shellInitDirectory?: URI;
}

/** Grants session attachments without exposing the session database or other host storage. */
export function getVSCodeSandboxReadRoots(options: IVSCodeSandboxReadRoots): URI[] {
	return [
		...(options.sessionDataDirectories ?? []).map(directory => URI.joinPath(directory, SESSION_ATTACHMENTS_DIRNAME)),
		...(options.terminalOutputDirectory ? [options.terminalOutputDirectory] : []),
		...(options.shellInitDirectory ? [options.shellInitDirectory] : []),
	];
}
