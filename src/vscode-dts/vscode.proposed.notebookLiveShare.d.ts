/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/106744

	export interface NotebookRegistrationData {
		readonly displayName: string;
		readonly filenamePattern: ReadonlyArray<(GlobPattern | { readonly include: GlobPattern; readonly exclude: GlobPattern })>;
		readonly exclusive?: boolean;
	}

	export namespace workspace {

		// SPECIAL overload with NotebookRegistrationData
		export function registerNotebookSerializer(notebookType: string, serializer: NotebookSerializer, options?: NotebookDocumentContentOptions, registration?: NotebookRegistrationData): Disposable;
	}
}
