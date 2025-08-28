/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IChatTerminalToolInvocationData, ILegacyChatTerminalToolInvocationData } from './chatService.js';
import { ChatModeKind } from './constants.js';

export function checkModeOption(mode: ChatModeKind, option: boolean | ((mode: ChatModeKind) => boolean) | undefined): boolean | undefined {
	if (option === undefined) {
		return undefined;
	}
	if (typeof option === 'function') {
		return option(mode);
	}
	return option;
}

/**
 * @deprecated This is the old API shape, we should support this for a while before removing it so
 * we don't break existing chats
 */
export function migrateLegacyTerminalToolSpecificData(data: IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData): IChatTerminalToolInvocationData {
	if ('command' in data) {
		data = {
			kind: 'terminal',
			commandLine: {
				original: data.command,
				toolEdited: undefined,
				userEdited: undefined
			},
			language: data.language
		} satisfies IChatTerminalToolInvocationData;
	}
	return data;
}
