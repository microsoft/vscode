/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { IAgentHostChatpadService } from '../../node/agentHostChatpadService.js';

/** A Chatpad whose chat is `session` (none by default), with `note`; it never touches the file system. */
export function createTestChatpadService(session?: string, note = URI.file('/home/.copilot/chats/chatpad/chatpad.md')): IAgentHostChatpadService {
	return {
		_serviceBrand: undefined,
		session,
		isChatpad: candidate => candidate === session,
		isNote: resource => session !== undefined && extUriBiasedIgnorePathCase.isEqual(resource, note),
		getNote: () => note,
		getChatpad: async () => session === undefined ? undefined : { note, session: URI.parse(session), provider: undefined },
		claim: async () => false,
		append: async () => { },
	};
}
