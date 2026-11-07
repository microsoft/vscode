/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, stringify } from '../../../../base/common/marshalling.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatDraft } from '../../chat/common/attachments/chatDraft.js';
import { IChatRequestVariableEntry, isChatRequestVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { IDynamicVariable } from '../../chat/common/attachments/chatVariables.js';

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

/** Saves the draft and returns a guard that stays true until another write replaces it. */
export function writeNewChatDraftState(storageService: IStorageService, draft: IChatDraft): () => boolean {
	const value = stringify({
		revision: generateUuid(),
		inputText: draft.inputText,
		attachments: draft.attachments.map(IChatRequestVariableEntry.toExport),
		references: draft.references,
	});
	storageService.store(STORAGE_KEY_DRAFT_STATE, value, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	return () => storageService.get(STORAGE_KEY_DRAFT_STATE, StorageScope.WORKSPACE) === value;
}

/** A send of a composer whose input was cleared for it, until the send is rejected, fails or starts. */
export interface IComposerSendAttempt {
	readonly id: string;
	/** The input as it was before the composer cleared it for the send. */
	readonly input: IChatDraft;
}

/** What a composer outside the main window restores: its input, or the input of a send that has not ended. */
export interface IComposerInputState {
	readonly input: IChatDraft;
	readonly attempt?: IComposerSendAttempt;
}

/**
 * The input of a composer outside the main window, kept by its host instead of the main composer's saved draft. The
 * composer writes it synchronously on every change of its text, attachments or inline references, never when it is
 * disposed, and brackets each send with an attempt, so a reload during a send restores what was sent.
 */
export interface IComposerInputSnapshot {
	get(): IComposerInputState;
	set(input: IChatDraft): void;
	/** Records the input before the composer clears it for a send; returns the attempt's id. */
	beginSendAttempt(input: IChatDraft): string;
	/** Ends the attempt of `id`: its send was rejected, failed, was cancelled or started. Never ends a newer attempt. */
	endSendAttempt(id: string): void;
}

/** An {@link IComposerInputSnapshot} in memory, which its host persists. */
export class ComposerInputSnapshot implements IComposerInputSnapshot {

	private _input: IChatDraft;
	private _attempt: IComposerSendAttempt | undefined;

	constructor(state?: IComposerInputState) {
		this._input = state?.input ?? { inputText: '', attachments: [] };
		this._attempt = state?.attempt;
	}

	get(): IComposerInputState {
		return this._attempt ? { input: this._input, attempt: this._attempt } : { input: this._input };
	}

	set(input: IChatDraft): void {
		this._input = input;
	}

	beginSendAttempt(input: IChatDraft): string {
		this._attempt = { id: generateUuid(), input };
		return this._attempt.id;
	}

	endSendAttempt(id: string): void {
		if (this._attempt?.id === id) {
			this._attempt = undefined;
		}
	}
}

function isDynamicVariable(value: unknown): value is IDynamicVariable {
	const reference = value as Partial<IDynamicVariable> | undefined;
	return typeof reference === 'object' && reference !== null && typeof reference.id === 'string' && Range.isIRange(reference.range);
}
