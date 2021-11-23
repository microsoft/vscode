/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export type Message = Uint8Array;

	export interface MessagePassingProtocol {
		readonly onDidReceiveMessage: Event<Message>;
		sendMessage(message: Message): void;
	}

	export namespace window {
		export function getMessagePassingProtocol(): Thenable<MessagePassingProtocol | undefined>;
	}
}
