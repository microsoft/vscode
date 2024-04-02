/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A message passing protocol, which enables sending and receiving messages
	 * between two parties.
	 */
	export interface MessagePassingProtocol {

		/**
		 * Fired when a message is received from the other party.
		 */
		readonly onDidReceiveMessage: Event<any>;

		/**
		 * Post a message to the other party.
		 *
		 * @param message Body of the message. This must be a JSON serializable object.
		 * @param transfer A collection of `ArrayBuffer` instances which can be transferred
		 * to the other party, saving costly memory copy operations.
		 */
		postMessage(message: any, transfer?: ArrayBuffer[]): void;
	}

	export interface ExtensionContext {

		/**
		 * When not `undefined`, this is an instance of {@link MessagePassingProtocol} in
		 * which the other party is owned by the web embedder.
		 */
		readonly messagePassingProtocol: MessagePassingProtocol | undefined;
	}
}
