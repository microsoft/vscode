/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @alexr00 https://github.com/microsoft/vscode/issues/207402

	export enum CommentThreadRelevance {
		Current = 0,
		Outdated = 1
	}

	export interface CommentThread2 {
		relevance?: CommentThreadRelevance;
	}
}
