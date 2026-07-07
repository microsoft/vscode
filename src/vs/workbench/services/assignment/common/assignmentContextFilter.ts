/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import type { IAssignmentFilter } from './assignmentService.js';

/**
 * Applies the registered {@link IAssignmentFilter assignment filters} to the assignment context
 * and remembers, per filter, which assignment-context ids each filter excluded.
 *
 * The excluded ids are persisted so that they stay filtered out across reloads even before the
 * owning filter has been registered again. Once a filter is registered it becomes authoritative
 * for its own id: the persisted state is repopulated from the ids it currently excludes and any
 * id that is no longer excluded is dropped from storage.
 */
export class AssignmentContextFilter extends Disposable {

	private static readonly STORAGE_KEY = 'workbench.assignment.filteredOutAssignmentContextIds';

	private readonly _filters: IAssignmentFilter[] = [];
	private readonly _filterDisposables = this._register(new DisposableStore());

	/**
	 * Assignment-context ids that were filtered out, keyed by the id of the filter that
	 * excluded them. Entries owned by a filter that has not been registered yet are honored
	 * across reloads so those ids stay excluded until the filter takes over.
	 */
	private _cachedFilteredOutIds: Map<string, Set<string>>;

	/**
	 * Ids of filters that have been registered this session. Once a filter is registered it
	 * becomes authoritative for its own id and the persisted cache is repopulated from the
	 * ids it actually excludes.
	 */
	private readonly _registeredFilterIds = new Set<string>();

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when a filter is added or an already registered filter changes its exclusions. */
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private readonly storageService: IStorageService
	) {
		super();

		this._cachedFilteredOutIds = this._loadFilteredOutIds();
	}

	addFilter(filter: IAssignmentFilter): void {
		this._filters.push(filter);

		// This filter now owns exclusion decisions for its id: drop the state persisted for it
		// in a previous session and let it repopulate the cache as ids actually get filtered out.
		this._registeredFilterIds.add(filter.id);
		if (this._cachedFilteredOutIds.has(filter.id)) {
			const next = new Map(this._cachedFilteredOutIds);
			next.delete(filter.id);
			this._storeFilteredOutIds(next);
		}

		this._filterDisposables.add(filter.onDidChange(() => this._onDidChange.fire()));
		this._onDidChange.fire();
	}

	/**
	 * Removes the excluded assignment-context ids from the given context and persists the
	 * reconciled per-filter cache.
	 */
	filter(assignmentContext: string): string {
		const assignments = assignmentContext.split(';');

		// Fresh exclusions produced by the currently registered filters, keyed by filter id.
		const freshFilteredOut = new Map<string, Set<string>>();

		const filteredAssignments = assignments.filter(assignment => {
			let excluded = false;
			for (const filter of this._filters) {
				if (filter.exclude(assignment)) {
					let set = freshFilteredOut.get(filter.id);
					if (!set) {
						set = new Set<string>();
						freshFilteredOut.set(filter.id, set);
					}
					set.add(assignment);
					excluded = true;
				}
			}
			if (excluded) {
				return false;
			}

			// Honor ids cached by filters that have not been registered yet, so they remain
			// excluded until the owning filter takes over.
			for (const [filterId, ids] of this._cachedFilteredOutIds) {
				if (!this._registeredFilterIds.has(filterId) && ids.has(assignment)) {
					return false;
				}
			}

			return true;
		});

		// Persist the reconciled cache: registered filters contribute exactly what they
		// currently exclude (dropping ids that are no longer filtered out), while entries owned
		// by not-yet-registered filters are preserved.
		const next = new Map<string, Set<string>>();
		for (const [filterId, ids] of this._cachedFilteredOutIds) {
			if (!this._registeredFilterIds.has(filterId)) {
				next.set(filterId, ids);
			}
		}
		for (const [filterId, ids] of freshFilteredOut) {
			next.set(filterId, ids);
		}
		this._storeFilteredOutIds(next);

		return filteredAssignments.join(';');
	}

	private _loadFilteredOutIds(): Map<string, Set<string>> {
		const result = new Map<string, Set<string>>();
		const raw = this.storageService.get(AssignmentContextFilter.STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return result;
		}

		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') {
				for (const [filterId, ids] of Object.entries(parsed)) {
					if (Array.isArray(ids)) {
						const set = new Set(ids.filter((id): id is string => typeof id === 'string'));
						if (set.size > 0) {
							result.set(filterId, set);
						}
					}
				}
			}
		} catch {
			// Ignore malformed cache.
		}

		return result;
	}

	private _storeFilteredOutIds(next: Map<string, Set<string>>): void {
		// Drop empty entries so an id disappears from storage once nothing is filtered out for it.
		const normalized = new Map<string, Set<string>>();
		for (const [filterId, ids] of next) {
			if (ids.size > 0) {
				normalized.set(filterId, ids);
			}
		}

		if (areCachesEqual(normalized, this._cachedFilteredOutIds)) {
			return;
		}

		this._cachedFilteredOutIds = normalized;

		if (normalized.size === 0) {
			this.storageService.remove(AssignmentContextFilter.STORAGE_KEY, StorageScope.APPLICATION);
		} else {
			const serializable: Record<string, string[]> = {};
			for (const [filterId, ids] of normalized) {
				serializable[filterId] = Array.from(ids);
			}
			this.storageService.store(AssignmentContextFilter.STORAGE_KEY, JSON.stringify(serializable), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}
}

function areCachesEqual(a: Map<string, Set<string>>, b: Map<string, Set<string>>): boolean {
	if (a.size !== b.size) {
		return false;
	}
	for (const [filterId, ids] of a) {
		const other = b.get(filterId);
		if (!other || other.size !== ids.size) {
			return false;
		}
		for (const id of ids) {
			if (!other.has(id)) {
				return false;
			}
		}
	}
	return true;
}
