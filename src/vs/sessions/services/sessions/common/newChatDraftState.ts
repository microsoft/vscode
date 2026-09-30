/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, stringify } from '../../../../base/common/marshalling.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatDraft } from '../../../../workbench/contrib/chat/common/attachments/chatDraft.js';
import { IChatRequestVariableEntry, isChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

const STORAGE_KEY_DRAFT_STATE = 'sessions.draftState';

export function readNewChatDraftState(storageService: IStorageService, chatResource?: string): IChatDraft | undefined {
	const raw = storageService.get(chatResource ? `${STORAGE_KEY_DRAFT_STATE}:${chatResource}` : STORAGE_KEY_DRAFT_STATE, StorageScope.WORKSPACE);
	if (!raw) {
		return undefined;
	}
	const draft: Partial<IChatDraft> | undefined = parse(raw);
	const attachments = draft?.attachments ?? [];
	if (!draft || typeof draft.inputText !== 'string' || !Array.isArray(attachments) || !attachments.every(isChatRequestVariableEntry)) {
		throw new Error('Invalid new-session draft state.');
	}
	return { inputText: draft.inputText, attachments: attachments.map(IChatRequestVariableEntry.fromExport) };
}

export function writeNewChatDraftState(storageService: IStorageService, draft: IChatDraft, chatResource?: string, sessionResource?: URI): void {
	const key = chatResource ? `${STORAGE_KEY_DRAFT_STATE}:${chatResource}` : STORAGE_KEY_DRAFT_STATE;
	if (!draft.inputText && !draft.attachments.length) {
		storageService.remove(key, StorageScope.WORKSPACE);
		return;
	}
	storageService.store(key, stringify({
		inputText: draft.inputText,
		attachments: draft.attachments.map(IChatRequestVariableEntry.toExport),
		sessionResource: chatResource ? sessionResource?.toString() : undefined,
	}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
}

export function removeChatDraftState(storageService: IStorageService, chatResource: URI): void {
	storageService.remove(`${STORAGE_KEY_DRAFT_STATE}:${chatResource.toString()}`, StorageScope.WORKSPACE);
}

export function removeSessionChatDraftStates(storageService: IStorageService, sessionResource: URI, chatResources: readonly URI[], logService: ILogService): void {
	for (const resource of chatResources) {
		removeChatDraftState(storageService, resource);
	}
	for (const key of storageService.keys(StorageScope.WORKSPACE, StorageTarget.MACHINE)) {
		if (!key.startsWith(`${STORAGE_KEY_DRAFT_STATE}:`)) {
			continue;
		}
		const raw = storageService.get(key, StorageScope.WORKSPACE);
		if (raw) {
			try {
				const value: { sessionResource?: string } | undefined = parse(raw);
				if (typeof value?.sessionResource === 'string' && isEqual(URI.parse(value.sessionResource), sessionResource)) {
					storageService.remove(key, StorageScope.WORKSPACE);
				}
			} catch (error) {
				logService.warn('[Sessions] Failed to read a saved chat draft during session deletion', error);
			}
		}
	}
}
