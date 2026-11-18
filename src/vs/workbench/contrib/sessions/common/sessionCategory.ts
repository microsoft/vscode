/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';

/**
 * The context a session belongs to in the Agents window. Work and Personal organize sessions only: both use the same
 * agents, account, tools, and settings.
 */
export type SessionCategory = 'work' | 'personal';

export const ISessionCategoriesService = createDecorator<ISessionCategoriesService>('sessionCategoriesService');

/**
 * Assigns sessions to Work or Personal.
 *
 * A folder belongs to one context, so a session with a folder is in its folder's context. A folder gets its context
 * explicitly, through {@link ISessionCategoriesService.setFolderCategory}, or from the first session sent in it. A
 * session without a folder, such as a quick chat, is in the context it was started in.
 */
export interface ISessionCategoriesService {
	readonly _serviceBrand: undefined;
	readonly selectedCategory: IObservable<SessionCategory>;
	selectCategory(category: SessionCategory): void;
	/** The context of a session in `folder` (its folder's, if assigned), else the one recorded for `sessionId`, else Work. */
	resolveCategory(sessionId: string | undefined, folder: URI | undefined, reader?: IReader): SessionCategory;
	/** The context recorded for a session, regardless of its folder; Work when none is recorded. */
	getCategory(sessionId: string, reader?: IReader): SessionCategory;
	/** Captures the starting tab once, before asynchronous session creation. */
	assignCategory(sessionId: string, category?: SessionCategory): void;
	setCategory(sessionId: string, category: SessionCategory): void;
	transferCategory(fromId: string, toId: string): void;
	removeCategory(sessionId: string): void;
	getFolderCategory(folder: URI, reader?: IReader): SessionCategory | undefined;
	/** Moves `folder` and all its sessions to `category`. */
	setFolderCategory(folder: URI, category: SessionCategory): void;
}

const selectionKey = 'sessionsViewPane.workChat';
const categoryKeyPrefix = 'sessions.category.';
const folderCategoryKeyPrefix = 'sessions.folderCategory.';

export class SessionCategoriesService extends Disposable implements ISessionCategoriesService {
	declare readonly _serviceBrand: undefined;
	private readonly selection;
	readonly selectedCategory: IObservable<SessionCategory>;
	private readonly changed = observableSignal(this);

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this.selection = observableValue<SessionCategory>(this, environmentService.isSessionsWindow && toCategory(storageService.get(selectionKey, StorageScope.PROFILE)) === 'personal' ? 'personal' : 'work');
		this.selectedCategory = this.selection;
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(event => {
			if (event.key.startsWith(categoryKeyPrefix) || event.key.startsWith(folderCategoryKeyPrefix)) {
				this.changed.trigger(undefined);
			}
		}));
	}

	selectCategory(category: SessionCategory): void {
		this.selection.set(category, undefined);
		this.storageService.store(selectionKey, category, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	resolveCategory(sessionId: string | undefined, folder: URI | undefined, reader?: IReader): SessionCategory {
		this.changed.read(reader);
		return (folder && this.readFolderCategory(folder)) ?? (sessionId !== undefined ? this.readCategory(sessionId) : undefined) ?? 'work';
	}

	getCategory(sessionId: string, reader?: IReader): SessionCategory {
		this.changed.read(reader);
		return this.readCategory(sessionId) ?? 'work';
	}

	assignCategory(sessionId: string, category = this.selectedCategory.get()): void {
		if (this.readCategory(sessionId) === undefined) {
			this.setCategory(sessionId, category);
		}
	}

	setCategory(sessionId: string, category: SessionCategory): void {
		this.storageService.store(categoryKeyPrefix + sessionId, category, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	transferCategory(fromId: string, toId: string): void {
		if (fromId === toId) {
			return;
		}
		const category = this.readCategory(fromId);
		if (category !== undefined) {
			this.assignCategory(toId, category);
			this.removeCategory(fromId);
		}
	}

	removeCategory(sessionId: string): void {
		this.storageService.remove(categoryKeyPrefix + sessionId, StorageScope.PROFILE);
	}

	getFolderCategory(folder: URI, reader?: IReader): SessionCategory | undefined {
		this.changed.read(reader);
		return this.readFolderCategory(folder);
	}

	setFolderCategory(folder: URI, category: SessionCategory): void {
		this.storageService.store(folderCategoryKeyPrefix + getComparisonKey(folder), category, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private readCategory(sessionId: string): SessionCategory | undefined {
		return toCategory(this.storageService.get(categoryKeyPrefix + sessionId, StorageScope.PROFILE));
	}

	private readFolderCategory(folder: URI): SessionCategory | undefined {
		return toCategory(this.storageService.get(folderCategoryKeyPrefix + getComparisonKey(folder), StorageScope.PROFILE));
	}
}

function toCategory(value: string | undefined): SessionCategory | undefined {
	switch (value) {
		case undefined:
		case 'work':
		case 'personal':
			return value;
		case 'chat': // Stored by earlier builds, when Personal was named Chat.
			return 'personal';
		default:
			throw new Error('Invalid stored session category.');
	}
}
