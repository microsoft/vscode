/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../instantiation/common/instantiation.js';

export const IAgentHostArchivedChatWorkspaceService = createDecorator<IAgentHostArchivedChatWorkspaceService>('agentHostArchivedChatWorkspaceService');

/**
 * Keeps an archived chat's folders out of the aggregate session workspace.
 */
export interface IAgentHostArchivedChatWorkspaceService {
	readonly _serviceBrand: undefined;

	/**
	 * Detaches the chat's folders from its session workspace when `attached` is
	 * `false`, and attaches them back when `true`. Folders still used by the
	 * session or another unarchived chat stay attached.
	 */
	setChatWorkspaceAttached(session: URI, chat: URI, attached: boolean): Promise<void>;
}
