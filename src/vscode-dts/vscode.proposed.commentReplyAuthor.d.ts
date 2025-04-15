/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @alexr00 https://github.com/microsoft/vscode/issues/246088

	export interface CommentThread2 {
		canReply: boolean | CommentAuthorInformation;

		readonly uri: Uri;
		range: Range | undefined;
		comments: readonly Comment[];
		collapsibleState: CommentThreadCollapsibleState;
		contextValue?: string;
		label?: string;
		state?: CommentThreadState | { resolved?: CommentThreadState; applicability?: CommentThreadApplicability };
		dispose(): void;
	}
}
