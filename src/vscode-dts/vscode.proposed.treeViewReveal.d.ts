/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/61313 @alexr00

	export interface TreeView<T> extends Disposable {
		reveal(element: T | undefined, options?: { select?: boolean; focus?: boolean; expand?: boolean | number }): Thenable<void>;
	}
}
