/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/169012

	export namespace window {
		export function registerQuickDiffProvider(selector: DocumentSelector, quickDiffProvider: QuickDiffProvider, id: string, label: string, rootUri?: Uri): Disposable;
	}

	export interface SourceControl {
		secondaryQuickDiffProvider?: QuickDiffProvider;
	}

	export interface QuickDiffProvider {
		readonly id?: string;
		readonly label?: string;
	}
}
