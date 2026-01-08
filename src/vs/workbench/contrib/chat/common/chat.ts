/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceSet } from '../../../../base/common/map.js';
import { chatEditingSessionIsReady } from './editing/chatEditingService.js';
import { IChatModel } from './model/chatModel.js';
import { isLegacyChatTerminalToolInvocationData, type IChatSessionStats, type IChatTerminalToolInvocationData, type ILegacyChatTerminalToolInvocationData } from './chatService/chatService.js';
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
	if (isLegacyChatTerminalToolInvocationData(data)) {
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

export async function awaitStatsForSession(model: IChatModel): Promise<IChatSessionStats | undefined> {
	if (!model.editingSession) {
		return undefined;
	}

	await chatEditingSessionIsReady(model.editingSession);
	await Promise.all(model.editingSession.entries.get().map(entry => entry.getDiffInfo?.()));

	const diffs = model.editingSession.entries.get();
	const reduceResult = diffs.reduce((acc, diff) => {
		acc.fileUris.add(diff.originalURI);
		acc.added += diff.linesAdded?.get() ?? 0;
		acc.removed += diff.linesRemoved?.get() ?? 0;
		return acc;
	}, { fileUris: new ResourceSet(), added: 0, removed: 0 });

	if (reduceResult.fileUris.size > 0 && (reduceResult.added > 0 || reduceResult.removed > 0)) {
		return {
			fileCount: reduceResult.fileUris.size,
			added: reduceResult.added,
			removed: reduceResult.removed
		};
	}
	return undefined;
}
