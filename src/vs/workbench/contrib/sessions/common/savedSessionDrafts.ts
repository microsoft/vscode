/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { parse, stringify } from '../../../../base/common/marshalling.js';
import { equals } from '../../../../base/common/objects.js';
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
const revisionPrefix = `${storageKey}.revision.`;
const removedPrefix = `${storageKey}.removed.`;

interface IStoredSavedSessionDraft extends ISavedSessionDraft {
	readonly legacy?: boolean;
}

export function hasSessionDraftContent(input: IChatDraft): boolean {
	return input.inputText.trim().length > 0 || input.attachments.length > 0;
}

/** Immutable revision keys keep independently cached windows from overwriting one another's compositions. */
export class SavedSessionDrafts extends Disposable {
	readonly drafts = observableValue<readonly ISavedSessionDraft[]>(this, []);
	readonly error = observableValue<Error | undefined>(this, undefined);

	constructor(private readonly storageService: IStorageService) {
		super();
		this.refresh();
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(event => {
			if (event.key === storageKey || event.key.startsWith(revisionPrefix) || event.key.startsWith(removedPrefix)) {
				this.refresh();
			}
		}));
	}

	private read(): IStoredSavedSessionDraft[] {
		const revisions = new Map<string, IStoredSavedSessionDraft>();
		for (const key of [storageKey, ...this.storageService.keys(StorageScope.PROFILE).filter(key => key.startsWith(revisionPrefix))]) {
			for (const draft of this.readKey(key)) {
				if (!this.storageService.getBoolean(`${removedPrefix}${draft.revision}`, StorageScope.PROFILE)) {
					revisions.set(draft.revision, draft);
				}
			}
		}
		return [...revisions.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.revision.localeCompare(b.revision));
	}

	private readKey(key: string): IStoredSavedSessionDraft[] {
		const raw = this.storageService.get(key, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		const data: { version?: number; drafts?: IStoredSavedSessionDraft[] } = parse(raw);
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
			return { ...draft, legacy: key === storageKey || draft.legacy !== false, input: fromStoredChatDraft(draft.input) };
		});
	}

	private refresh(): void {
		try {
			const latest = new Map<string, ISavedSessionDraft>();
			for (const draft of this.read()) {
				if (!latest.has(draft.id)) {
					const { legacy: _legacy, ...visible } = draft;
					latest.set(draft.id, visible);
				}
			}
			this.drafts.set([...latest.values()], undefined);
			this.error.set(undefined, undefined);
		} catch (error) {
			this.error.set(error instanceof Error ? error : new Error(toErrorMessage(error)), undefined);
		}
	}

	private write(draft: IStoredSavedSessionDraft): void {
		this.storageService.store(`${revisionPrefix}${draft.revision}`, stringify({
			version: 1,
			drafts: [{ ...draft, legacy: draft.legacy ?? false, input: toStoredChatDraft(draft.input) }],
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private migrate(): void {
		for (const draft of this.readKey(storageKey)) {
			if (!this.storageService.getBoolean(`${removedPrefix}${draft.revision}`, StorageScope.PROFILE)) {
				this.write(draft);
			}
		}
		this.storageService.remove(storageKey, StorageScope.PROFILE);
	}

	private removeRevision(draft: IStoredSavedSessionDraft): void {
		// Only the finite legacy collection can be replayed by a stale migrator.
		if (draft.legacy) {
			this.storageService.store(`${removedPrefix}${draft.revision}`, true, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		this.storageService.remove(`${revisionPrefix}${draft.revision}`, StorageScope.PROFILE);
	}

	save(input: IChatDraft, target: ISavedSessionDraftTarget, id = generateUuid()): ISavedSessionDraft {
		const drafts = this.read();
		const previous = drafts.find(draft => draft.id === id);
		const savedInput = fromStoredChatDraft(parse(stringify(toStoredChatDraft(input))));
		const savedTarget: ISavedSessionDraftTarget = parse(stringify(target));
		if (previous && equals(previous.input, savedInput) && equals(previous.target, savedTarget)) {
			const { legacy: _legacy, ...unchanged } = previous;
			return unchanged;
		}
		const now = Date.now();
		const draft: ISavedSessionDraft = {
			id, revision: generateUuid(), createdAt: previous?.createdAt ?? now, updatedAt: now,
			input: savedInput,
			target: savedTarget,
		};
		this.migrate();
		this.write(draft);
		for (const previous of drafts.filter(candidate => candidate.id === id)) {
			this.removeRevision(previous);
		}
		this.refresh();
		return draft;
	}

	remove(id: string, revision?: string): void {
		const drafts = this.read();
		this.migrate();
		for (const draft of drafts.filter(draft => draft.id === id && (revision === undefined || draft.revision === revision))) {
			this.removeRevision(draft);
		}
		this.refresh();
	}
}
