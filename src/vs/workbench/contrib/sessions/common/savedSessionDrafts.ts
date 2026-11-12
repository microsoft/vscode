/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { parse, stringify } from '../../../../base/common/marshalling.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatDraft } from '../../chat/common/attachments/chatDraft.js';
import { fromStoredChatDraft, toStoredChatDraft } from './newChatDraftState.js';
import { ISessionDraftConfiguration } from './sessionsProvider.js';

export interface ISavedSessionDraftTarget {
	readonly folderUri?: URI;
	readonly providerId?: string;
	readonly sessionTypeId?: string;
	readonly configuration?: ISessionDraftConfiguration;
	readonly modelId?: string;
	readonly modeId?: string;
	readonly environmentId?: string;
	readonly harness?: string;
	readonly applicationId?: string;
	readonly requireDevContainer?: boolean;
	readonly groupId?: string;
}

export interface ISavedSessionDraft {
	readonly id: string;
	readonly revision: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly input: IChatDraft;
	readonly target: ISavedSessionDraftTarget;
}

const storageKey = 'sessions.savedDrafts';

export function hasSessionDraftContent(input: IChatDraft): boolean {
	return input.inputText.trim().length > 0 || input.attachments.length > 0;
}

/** Machine-local saved compositions. Writes merge by ID so another window's drafts are retained. */
export class SavedSessionDrafts extends Disposable {
	readonly drafts = observableValue<readonly ISavedSessionDraft[]>(this, []);
	readonly error = observableValue<Error | undefined>(this, undefined);

	constructor(private readonly storageService: IStorageService) {
		super();
		this.refresh();
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, storageKey, this._store)(() => this.refresh()));
	}

	private read(): ISavedSessionDraft[] {
		const raw = this.storageService.get(storageKey, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		const data: { version?: number; drafts?: ISavedSessionDraft[] } = parse(raw);
		if (data?.version !== 1 || !Array.isArray(data.drafts)) {
			throw new Error('Unsupported saved session draft storage.');
		}
		return data.drafts.map(draft => {
			if (!draft || typeof draft.id !== 'string' || typeof draft.revision !== 'string' || !Number.isFinite(draft.createdAt) || !Number.isFinite(draft.updatedAt) || !draft.target || typeof draft.target !== 'object'
				|| (draft.target.folderUri !== undefined && !URI.isUri(draft.target.folderUri))
				|| (draft.target.providerId !== undefined && typeof draft.target.providerId !== 'string')
				|| (draft.target.sessionTypeId !== undefined && typeof draft.target.sessionTypeId !== 'string')) {
				throw new Error('Invalid saved session draft.');
			}
			return { ...draft, input: fromStoredChatDraft(draft.input) };
		});
	}

	private refresh(): void {
		try {
			this.drafts.set(this.read().sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), undefined);
			this.error.set(undefined, undefined);
		} catch (error) {
			this.error.set(error instanceof Error ? error : new Error(toErrorMessage(error)), undefined);
		}
	}

	private write(drafts: readonly ISavedSessionDraft[]): void {
		this.storageService.store(storageKey, stringify({
			version: 1,
			drafts: drafts.map(draft => ({ ...draft, input: toStoredChatDraft(draft.input) })),
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		this.refresh();
	}

	save(input: IChatDraft, target: ISavedSessionDraftTarget, id = generateUuid()): ISavedSessionDraft {
		const drafts = this.read();
		const previous = drafts.find(draft => draft.id === id);
		const now = Date.now();
		const draft: ISavedSessionDraft = {
			id, revision: generateUuid(), createdAt: previous?.createdAt ?? now, updatedAt: now,
			input: fromStoredChatDraft(parse(stringify(toStoredChatDraft(input)))),
			target: parse(stringify(target)),
		};
		this.write([...drafts.filter(candidate => candidate.id !== id), draft]);
		return draft;
	}

	remove(id: string, revision?: string): void {
		this.write(this.read().filter(draft => draft.id !== id || (revision !== undefined && draft.revision !== revision)));
	}
}
