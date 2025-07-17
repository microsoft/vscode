/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	/**
	 * Provides a list of chat sessions
	 *
	 * ```json
	 * "chatSession": {
	 * 		"chatSessionType": "myChatSessionProvider",
	 * 		"displayName": "My Chat Session Provider"
	 *
	 * },
	 * "menu": { // TODO: Use proper names
	 * 	"chatSession/title": [
	 *    {
	 *     "command": "myChatSessionProvider.createNewSession",
	 *     }
	 * ],
	 * 	"chatSession/item/bar": [
	 *    {
	 *     "command": "myChatSessionProvider.deleteSession",
	 *     }
	 * ]
	 * }
	 * ```
	 */
	export interface ChatSessionInformationProvider extends Disposable {

		/**
		 * Fired when chat sessions change.
		 *
		 * TODO: do we really need this? Only if we plan on caching the list somewhere or need to refresh UI that is showing the sessions.
		 */
		readonly onDidChangeChatSessionInformation: Event<void>;

		/**
		 * Provide a list of chat sessions.
		 *
		 * TODO: Figure out better approach of mapping chat session to URIs. Either:
		 *
		 * Allow custom schemes: `my-padawan-session://org/repo?id=1234`. Most flexible but could cause conflicts with other providers.
		 *
		 * Or use a single top level uri for all sessions: `chat-session://my-padawan-session/custom/path/info?id=1234`
		 * better scoped but how do extensions know how to construct URIs like this?
		 *
		 * TODO: support streaming? But then we can't show quick picks/views as nicely
		 * */
		provideChatSessionInformation(token: CancellationToken): Thenable<ChatSessionInformation[]>;
	}

	export interface ChatSessionInformation {
		/**
		 * Identifies the session
		 *		 */
		uri: Uri;

		/**
		 * Human readable name of the session shown in the UI
		 */
		label: string;

		/**
		 * An icon for the participant shown in UI.
		 */
		iconPath?: IconPath;
	}

	export namespace chatSession {
		export function registerChatSessionInformationProvider(provider: ChatSessionInformationProvider): Disposable;
	}
}
