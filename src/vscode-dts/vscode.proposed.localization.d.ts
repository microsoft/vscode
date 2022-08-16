/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export namespace env {
		export const i18n: {
			(comments: string[], str: string, ...args: string[]): string;
			(str: string, ...args: string[]): string;
			readonly bundleContents: { [key: string]: string };
			readonly bundleUri: Uri;
		};
	}
}
