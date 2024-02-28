/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface CommentingRangeProvider {
		readonly onDidChangeResourcesWithCommentingRanges?: Event<{ schemes: string[]; resources: Uri[] }>;
	}
}
