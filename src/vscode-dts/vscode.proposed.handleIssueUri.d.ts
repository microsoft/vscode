/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/46726

	export interface IssueUriRequestHandler {
		handleIssueUrlRequest(): ProviderResult<Uri>;
	}

	export namespace env {
		export function registerIssueUriRequestHandler(handler: IssueUriRequestHandler): Disposable;
	}
}
