/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { hash } from '../../../../base/common/hash.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IImportedConversationTurn } from '../common/importedConversation.js';

export const IImportedConversationStore = createDecorator<IImportedConversationStore>('importedConversationStore');

/**
 * Persists per-session snapshots of a prior conversation that was continued
 * ("Continue in…") into an agent session, so the agent host session handler can
 * render it inline (read-only) on every open, including after a reload.
 *
 * Each session's snapshot is stored as its own file under the current profile's
 * global storage.
 */
export interface IImportedConversationStore {
	readonly _serviceBrand: undefined;

	/** Persists (or, for an empty array, clears) the snapshot for a session resource. */
	store(resource: URI, turns: readonly IImportedConversationTurn[]): Promise<void>;

	/** Reads the snapshot for a session resource, or `undefined` when none exists. */
	read(resource: URI): Promise<IImportedConversationTurn[] | undefined>;

	/**
	 * Moves a snapshot from one resource to another. Used when a session graduates
	 * from its provisional (`untitled-…`) identity to the real backend resource.
	 */
	rename(oldResource: URI, newResource: URI): Promise<void>;

	/** Removes the snapshot for a session resource (e.g. when the session is deleted). */
	delete(resource: URI): Promise<void>;
}

/** On-disk shape. The resource is stored so reads can guard against hash collisions. */
interface IStoredImportedConversation {
	readonly resource: string;
	readonly turns: IImportedConversationTurn[];
}

export class ImportedConversationStore extends Disposable implements IImportedConversationStore {

	declare readonly _serviceBrand: undefined;

	/**
	 * Lazily-populated set of snapshot file names (the hashed resource keys) that
	 * exist on disk for the current profile. Lets {@link read}, {@link rename} and
	 * {@link delete} short-circuit with zero I/O for the overwhelmingly common
	 * case of a session that has no imported conversation.
	 */
	private _index: Promise<Set<string>> | undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// Snapshots live under the current profile; drop the cached index when the
		// profile changes so a stale listing from another profile is not reused.
		this._register(this._userDataProfileService.onDidChangeCurrentProfile(() => this._index = undefined));
	}

	private _root(): URI {
		return joinPath(this._userDataProfileService.currentProfile.globalStorageHome, 'chatImportedConversations');
	}

	private _keyFor(resource: URI): string {
		// Hash the resource to a filesystem-safe name; the resource is re-checked
		// on read to guard against the (astronomically unlikely) hash collision.
		return (hash(resource.toString()) >>> 0).toString(16);
	}

	private _fileFor(resource: URI): URI {
		return joinPath(this._root(), `${this._keyFor(resource)}.json`);
	}

	private _getIndex(): Promise<Set<string>> {
		if (!this._index) {
			this._index = (async () => {
				const keys = new Set<string>();
				try {
					const stat = await this._fileService.resolve(this._root());
					for (const child of stat.children ?? []) {
						if (child.name.endsWith('.json')) {
							keys.add(child.name.slice(0, -'.json'.length));
						}
					}
				} catch (err) {
					if (toFileOperationResult(err) !== FileOperationResult.FILE_NOT_FOUND) {
						this._logService.warn('[ImportedConversationStore] Failed to list imported conversations', err);
					}
				}
				return keys;
			})();
		}
		return this._index;
	}

	async store(resource: URI, turns: readonly IImportedConversationTurn[]): Promise<void> {
		if (turns.length === 0) {
			await this.delete(resource);
			return;
		}
		const payload: IStoredImportedConversation = { resource: resource.toString(), turns: [...turns] };
		try {
			await this._fileService.writeFile(this._fileFor(resource), VSBuffer.fromString(JSON.stringify(payload)));
			(await this._getIndex()).add(this._keyFor(resource));
		} catch (err) {
			this._logService.warn('[ImportedConversationStore] Failed to store imported conversation', err);
		}
	}

	async read(resource: URI): Promise<IImportedConversationTurn[] | undefined> {
		if (!(await this._getIndex()).has(this._keyFor(resource))) {
			return undefined;
		}
		try {
			const content = await this._fileService.readFile(this._fileFor(resource));
			const parsed = JSON.parse(content.value.toString()) as IStoredImportedConversation;
			if (parsed && parsed.resource === resource.toString() && Array.isArray(parsed.turns)) {
				return parsed.turns;
			}
		} catch (err) {
			if (toFileOperationResult(err) !== FileOperationResult.FILE_NOT_FOUND) {
				this._logService.warn('[ImportedConversationStore] Failed to read imported conversation', err);
			}
		}
		return undefined;
	}

	async rename(oldResource: URI, newResource: URI): Promise<void> {
		const turns = await this.read(oldResource);
		if (!turns) {
			return;
		}
		await this.store(newResource, turns);
		await this.delete(oldResource);
	}

	async delete(resource: URI): Promise<void> {
		const key = this._keyFor(resource);
		if (!(await this._getIndex()).has(key)) {
			return;
		}
		try {
			await this._fileService.del(this._fileFor(resource));
		} catch (err) {
			if (toFileOperationResult(err) !== FileOperationResult.FILE_NOT_FOUND) {
				this._logService.warn('[ImportedConversationStore] Failed to delete imported conversation', err);
			}
		} finally {
			(await this._getIndex()).delete(key);
		}
	}
}
