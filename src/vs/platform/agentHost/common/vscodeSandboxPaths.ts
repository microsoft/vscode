/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { SESSION_ATTACHMENTS_DIRNAME } from './sessionDataService.js';

interface IVSCodeSandboxReadRoots {
	readonly sessionDataDirectory?: URI;
	readonly terminalOutputDirectory?: URI;
	readonly shellInitDirectory?: URI;
}

/** Grants session attachments without exposing the session database or other host storage. */
export function getVSCodeSandboxReadRoots(options: IVSCodeSandboxReadRoots): URI[] {
	return [
		...(options.sessionDataDirectory ? [URI.joinPath(options.sessionDataDirectory, SESSION_ATTACHMENTS_DIRNAME)] : []),
		...(options.terminalOutputDirectory ? [options.terminalOutputDirectory] : []),
		...(options.shellInitDirectory ? [options.shellInitDirectory] : []),
	];
}
