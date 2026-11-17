/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';

export type SessionCategory = 'work' | 'chat';

export const ISessionCategoriesService = createDecorator<ISessionCategoriesService>('sessionCategoriesService');

export interface ISessionCategoriesService {
	readonly _serviceBrand: undefined;
	readonly selectedCategory: IObservable<SessionCategory>;
	selectCategory(category: SessionCategory): void;
	getCategory(sessionId: string, reader?: IReader): SessionCategory;
	/** Captures the starting tab once, before asynchronous session creation. */
	assignCategory(sessionId: string, category?: SessionCategory): void;
	setCategory(sessionId: string, category: SessionCategory): void;
	transferCategory(fromId: string, toId: string): void;
	removeCategory(sessionId: string): void;
}

const selectionKey = 'sessionsViewPane.workChat';
const categoryKeyPrefix = 'sessions.category.';

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
		this.selection = observableValue<SessionCategory>(this, environmentService.isSessionsWindow && storageService.get(selectionKey, StorageScope.PROFILE) === 'chat' ? 'chat' : 'work');
		this.selectedCategory = this.selection;
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(event => {
			if (event.key.startsWith(categoryKeyPrefix)) {
				this.changed.trigger(undefined);
			}
		}));
	}

	selectCategory(category: SessionCategory): void {
		this.selection.set(category, undefined);
		this.storageService.store(selectionKey, category, StorageScope.PROFILE, StorageTarget.MACHINE);
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

	private readCategory(sessionId: string): SessionCategory | undefined {
		const category = this.storageService.get(categoryKeyPrefix + sessionId, StorageScope.PROFILE);
		if (category !== undefined && category !== 'work' && category !== 'chat') {
			throw new Error('Invalid stored session category.');
		}
		return category;
	}
}
