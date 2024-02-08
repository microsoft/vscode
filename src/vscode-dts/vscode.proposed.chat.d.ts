/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// ChatML
	export enum ChatMessageRole {
		System = 0,
		User = 1,
		// TODO@API name: align with ChatAgent (or whatever we'll rename that to)
		Assistant = 2,
	}

	// ChatML
	export class ChatMessage {
		role: ChatMessageRole;
		content: string;

		// TODO@API is this a leftover from Role.Function? Should message just support a catch-all signature?
		name?: string;

		constructor(role: ChatMessageRole, content: string);
	}

}
