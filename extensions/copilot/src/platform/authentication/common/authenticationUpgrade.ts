/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatContext, ChatRequest, ChatResponseStream } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';


export const IAuthenticationChatUpgradeService = createServiceIdentifier<IAuthenticationChatUpgradeService>('IAuthenticationChatUpgradeService');

export interface IAuthenticationChatUpgradeService {
	_serviceBrand: undefined;

	readonly onDidGrantAuthUpgrade: Event<void>;

	/**
	 * Checks if the user should be prompted for a permissive session upgrade.
	 * @returns Promise<boolean> - indicating whether an upgrade is required.
	 */
	shouldRequestPermissiveSessionUpgrade(): Promise<boolean>;

	/**
	 * Displays a modal dialog requesting the user to grant an upgrade to a more permissive session.
	 * @returns A promise that resolves to a boolean indicating whether the user granted the upgrade.
	 */
	showPermissiveSessionModal(skipRepeatCheck?: boolean): Promise<boolean>;

	/**
	 * Presents the upgrade prompt within the chat interface itself.
	 * @param stream - The live chat response stream where the prompt will be rendered.
	 * @param data - The initial chat request data for context.
	 * @param detail - Optional detail overriding
	 */
	showPermissiveSessionUpgradeInChat(stream: ChatResponseStream, data: ChatRequest, detail?: string, context?: ChatContext): void;

	/**
	 * Manages the user's input regarding the confirmation request for a session upgrade.
	 * @param request - The chat request object containing details necessary for the upgrade flow.
	 * @returns Promise<ChatRequest> - The ChatRequest that was originally presented the confirmation, or the request that
	 * was passed in if we don't detect that the confirmation was presented.
	 */
	handleConfirmationRequest(stream: ChatResponseStream, request: ChatRequest, history: ChatContext['history']): Promise<ChatRequest>;
}
