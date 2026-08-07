/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/328475

	export interface TerminalOptions {
		/**
		 * Whether this terminal is used to bootstrap a remote authority resolver.
		 *
		 * Resolver bootstrap terminals may start before workspace trust is resolved. This does not
		 * change the workspace trust state or affect any other Restricted Mode behavior. Only set
		 * this on the hidden, transient local terminal that starts the resolver process. The
		 * terminal must use a local file URI as its current working directory.
		 */
		isRemoteResolverTerminal?: boolean;
	}
}
