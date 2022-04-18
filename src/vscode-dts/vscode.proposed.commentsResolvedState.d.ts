/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/127473

	export enum CommentThreadState {
		Unresolved = 0,
		Resolved = 1
	}

	// TODO@API doc
	export interface CommentThread {
		state?: CommentThreadState;
	}
}
