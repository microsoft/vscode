/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/169012

	export namespace window {
		export function registerQuickDiffProvider(selector: DocumentSelector, quickDiffProvider: QuickDiffProvider, label: string, rootUri?: Uri): Disposable;
	}

	export interface QuickDiffProvider {
		label?: string;
		readonly visible?: boolean;
	}
}
