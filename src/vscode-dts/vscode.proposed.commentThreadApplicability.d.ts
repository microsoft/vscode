/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @alexr00 https://github.com/microsoft/vscode/issues/207402

	export enum CommentThreadApplicability {
		Current = 0,
		Outdated = 1
	}

	export interface CommentThread2 {
		/* @api this is a bit weird for the extension now. The CommentThread is a managed object, which means it listens
		 * to when it's properties are set, but not if it's properties are modified. This means that this will not work to update the resolved state
		 *
		 * thread.state.resolved = CommentThreadState.Resolved;
		 *
		 * but this will work
		 *
		 * thread.state = {
		 *   resolved: CommentThreadState.Resolved
		 *   applicability: thread.state.applicability
		 * };
		 *
		 * Worth noting that we already have this problem for the `comments` property.
		*/
		state?: CommentThreadState | { resolved?: CommentThreadState; applicability?: CommentThreadApplicability };
		readonly uri: Uri;
		range: Range | undefined;
		comments: readonly Comment[];
		collapsibleState: CommentThreadCollapsibleState;
		canReply: boolean;
		contextValue?: string;
		label?: string;
		dispose(): void;
		// Part of the comment reveal proposal
		reveal(options?: CommentThreadRevealOptions): Thenable<void>;
	}
}
