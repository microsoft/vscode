/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/234339

	export interface StatusBarItem {

		/**
		 * The tooltip text when you hover over this entry.
		 *
		 * Can optionally return the tooltip in a thenable if the computation is expensive.
		 */
		tooltip2: string | MarkdownString | undefined | ((token: CancellationToken) => ProviderResult<string | MarkdownString | undefined>);
	}
}
