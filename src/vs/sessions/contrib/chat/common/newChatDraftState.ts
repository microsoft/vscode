/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, stringify } from '../../../../base/common/marshalling.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatDraft } from '../../../../workbench/contrib/chat/common/attachments/chatDraft.js';
import { IChatRequestVariableEntry, isChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IDynamicVariable } from '../../../../workbench/contrib/chat/common/attachments/chatVariables.js';

const STORAGE_KEY_DRAFT_STATE = 'sessions.draftState';

export function readNewChatDraftState(storageService: IStorageService): IChatDraft | undefined {
	const raw = storageService.get(STORAGE_KEY_DRAFT_STATE, StorageScope.WORKSPACE);
	if (!raw) {
		return undefined;
	}
	const draft: Partial<IChatDraft> | undefined = parse(raw);
	const attachments = draft?.attachments ?? [];
	if (!draft || typeof draft.inputText !== 'string' || !Array.isArray(attachments) || !attachments.every(isChatRequestVariableEntry)) {
		throw new Error('Invalid new-session draft state.');
	}
	// Drafts saved before references were saved, or with invalid ones, keep their text and attachments.
	const references = Array.isArray(draft.references) && draft.references.every(isDynamicVariable) ? draft.references : undefined;
	return { inputText: draft.inputText, attachments: attachments.map(IChatRequestVariableEntry.fromExport), references };
}

export function writeNewChatDraftState(storageService: IStorageService, draft: IChatDraft): void {
	storageService.store(STORAGE_KEY_DRAFT_STATE, stringify({
		inputText: draft.inputText,
		attachments: draft.attachments.map(IChatRequestVariableEntry.toExport),
		references: draft.references,
	}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
}

function isDynamicVariable(value: unknown): value is IDynamicVariable {
	const reference = value as Partial<IDynamicVariable> | undefined;
	return typeof reference === 'object' && reference !== null && typeof reference.id === 'string' && Range.isIRange(reference.range);
}
