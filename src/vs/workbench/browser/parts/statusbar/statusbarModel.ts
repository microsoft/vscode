/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isStatusbarEntryLocation, IStatusbarEntryPriority, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { hide, show, isAncestorOfActiveElement } from 'vs/base/browser/dom';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Emitter } from 'vs/base/common/event';

export interface IStatusbarViewModelEntry {
	readonly id: string;
	readonly name: string;
	readonly hasCommand: boolean;
	readonly alignment: StatusbarAlignment;
	readonly priority: IStatusbarEntryPriority;
	readonly container: HTMLElement;
	readonly labelContainer: HTMLElement;
}

export class StatusbarViewModel extends Disposable {

	private static readonly HIDDEN_ENTRIES_KEY = 'workbench.statusbar.hidden';

	private readonly _onDidChangeEntryVisibility = this._register(new Emitter<{ id: string; visible: boolean }>());
	readonly onDidChangeEntryVisibility = this._onDidChangeEntryVisibility.event;

	private _entries: IStatusbarViewModelEntry[] = []; // Intentionally not using a map here since multiple entries can have the same ID
	get entries(): IStatusbarViewModelEntry[] { return this._entries.slice(0); }

	private _lastFocusedEntry: IStatusbarViewModelEntry | undefined;
	get lastFocusedEntry(): IStatusbarViewModelEntry | undefined {
		return this._lastFocusedEntry && !this.isHidden(this._lastFocusedEntry.id) ? this._lastFocusedEntry : undefined;
	}

	private hidden = new Set<string>();

	constructor(private readonly storageService: IStorageService) {
		super();

		this.restoreState();
		this.registerListeners();
	}

	private restoreState(): void {
		const hiddenRaw = this.storageService.get(StatusbarViewModel.HIDDEN_ENTRIES_KEY, StorageScope.PROFILE);
		if (hiddenRaw) {
			try {
				this.hidden = new Set(JSON.parse(hiddenRaw));
			} catch (error) {
				// ignore parsing errors
			}
		}
	}

	private registerListeners(): void {
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, StatusbarViewModel.HIDDEN_ENTRIES_KEY, this._register(new DisposableStore()))(() => this.onDidStorageValueChange()));
	}

	private onDidStorageValueChange(): void {

		// Keep current hidden entries
		const currentlyHidden = new Set(this.hidden);

		// Load latest state of hidden entries
		this.hidden.clear();
		this.restoreState();

		const changed = new Set<string>();

		// Check for each entry that is now visible
		for (const id of currentlyHidden) {
			if (!this.hidden.has(id)) {
				changed.add(id);
			}
		}

		// Check for each entry that is now hidden
		for (const id of this.hidden) {
			if (!currentlyHidden.has(id)) {
				changed.add(id);
			}
		}

		// Update visibility for entries have changed
		if (changed.size > 0) {
			for (const entry of this._entries) {
				if (changed.has(entry.id)) {
					this.updateVisibility(entry.id, true);

					changed.delete(entry.id);
				}
			}
		}
	}

	add(entry: IStatusbarViewModelEntry): void {

		// Add to set of entries
		this._entries.push(entry);

		// Update visibility directly
		this.updateVisibility(entry, false);

		// Sort according to priority
		this.sort();

		// Mark first/last visible entry
		this.markFirstLastVisibleEntry();
	}

	remove(entry: IStatusbarViewModelEntry): void {
		const index = this._entries.indexOf(entry);
		if (index >= 0) {

			// Remove from entries
			this._entries.splice(index, 1);

			// Re-sort entries if this one was used
			// as reference from other entries
			if (this._entries.some(otherEntry => isStatusbarEntryLocation(otherEntry.priority.primary) && otherEntry.priority.primary.id === entry.id)) {
				this.sort();
			}

			// Mark first/last visible entry
			this.markFirstLastVisibleEntry();
		}
	}

	isHidden(id: string): boolean {
		return this.hidden.has(id);
	}

	hide(id: string): void {
		if (!this.hidden.has(id)) {
			this.hidden.add(id);

			this.updateVisibility(id, true);

			this.saveState();
		}
	}

	show(id: string): void {
		if (this.hidden.has(id)) {
			this.hidden.delete(id);

			this.updateVisibility(id, true);

			this.saveState();
		}
	}

	findEntry(container: HTMLElement): IStatusbarViewModelEntry | undefined {
		return this._entries.find(entry => entry.container === container);
	}

	getEntries(alignment: StatusbarAlignment): IStatusbarViewModelEntry[] {
		return this._entries.filter(entry => entry.alignment === alignment);
	}

	focusNextEntry(): void {
		this.focusEntry(+1, 0);
	}

	focusPreviousEntry(): void {
		this.focusEntry(-1, this.entries.length - 1);
	}

	isEntryFocused(): boolean {
		return !!this.getFocusedEntry();
	}

	private getFocusedEntry(): IStatusbarViewModelEntry | undefined {
		return this._entries.find(entry => isAncestorOfActiveElement(entry.container));
	}

	private focusEntry(delta: number, restartPosition: number): void {

		const getVisibleEntry = (start: number) => {
			let indexToFocus = start;
			let entry = (indexToFocus >= 0 && indexToFocus < this._entries.length) ? this._entries[indexToFocus] : undefined;
			while (entry && this.isHidden(entry.id)) {
				indexToFocus += delta;
				entry = (indexToFocus >= 0 && indexToFocus < this._entries.length) ? this._entries[indexToFocus] : undefined;
			}

			return entry;
		};

		const focused = this.getFocusedEntry();
		if (focused) {
			const entry = getVisibleEntry(this._entries.indexOf(focused) + delta);
			if (entry) {
				this._lastFocusedEntry = entry;

				entry.labelContainer.focus();

				return;
			}
		}

		const entry = getVisibleEntry(restartPosition);
		if (entry) {
			this._lastFocusedEntry = entry;
			entry.labelContainer.focus();
		}
	}

	private updateVisibility(id: string, trigger: boolean): void;
	private updateVisibility(entry: IStatusbarViewModelEntry, trigger: boolean): void;
	private updateVisibility(arg1: string | IStatusbarViewModelEntry, trigger: boolean): void {

		// By identifier
		if (typeof arg1 === 'string') {
			const id = arg1;

			for (const entry of this._entries) {
				if (entry.id === id) {
					this.updateVisibility(entry, trigger);
				}
			}
		}

		// By entry
		else {
			const entry = arg1;
			const isHidden = this.isHidden(entry.id);

			// Use CSS to show/hide item container
			if (isHidden) {
				hide(entry.container);
			} else {
				show(entry.container);
			}

			if (trigger) {
				this._onDidChangeEntryVisibility.fire({ id: entry.id, visible: !isHidden });
			}

			// Mark first/last visible entry
			this.markFirstLastVisibleEntry();
		}
	}

	private saveState(): void {
		if (this.hidden.size > 0) {
			this.storageService.store(StatusbarViewModel.HIDDEN_ENTRIES_KEY, JSON.stringify(Array.from(this.hidden.values())), StorageScope.PROFILE, StorageTarget.USER);
		} else {
			this.storageService.remove(StatusbarViewModel.HIDDEN_ENTRIES_KEY, StorageScope.PROFILE);
		}
	}

	private sort(): void {

		// Split up entries into 2 buckets:
		// - those with `priority: number` that can be compared
		// - those with `priority: string` that must be sorted
		//   relative to another entry if possible
		const mapEntryWithNumberedPriorityToIndex = new Map<IStatusbarViewModelEntry, number /* priority of entry as number */>();
		const mapEntryWithRelativePriority = new Map<string /* id of entry to position after */, Map<string, IStatusbarViewModelEntry>>();
		for (let i = 0; i < this._entries.length; i++) {
			const entry = this._entries[i];
			if (typeof entry.priority.primary === 'number') {
				mapEntryWithNumberedPriorityToIndex.set(entry, i);
			} else {
				const referenceEntryId = entry.priority.primary.id;
				let entries = mapEntryWithRelativePriority.get(referenceEntryId);
				if (!entries) {

					// It is possible that this entry references another entry
					// that itself references an entry. In that case, we want
					// to add it to the entries of the referenced entry.

					for (const relativeEntries of mapEntryWithRelativePriority.values()) {
						if (relativeEntries.has(referenceEntryId)) {
							entries = relativeEntries;
							break;
						}
					}

					if (!entries) {
						entries = new Map();
						mapEntryWithRelativePriority.set(referenceEntryId, entries);
					}
				}
				entries.set(entry.id, entry);
			}
		}

		// Sort the entries with `priority: number` according to that
		const sortedEntriesWithNumberedPriority = Array.from(mapEntryWithNumberedPriorityToIndex.keys());
		sortedEntriesWithNumberedPriority.sort((entryA, entryB) => {
			if (entryA.alignment === entryB.alignment) {

				// Sort by primary/secondary priority: higher values move towards the left

				if (entryA.priority.primary !== entryB.priority.primary) {
					return Number(entryB.priority.primary) - Number(entryA.priority.primary);
				}

				if (entryA.priority.secondary !== entryB.priority.secondary) {
					return entryB.priority.secondary - entryA.priority.secondary;
				}

				// otherwise maintain stable order (both values known to be in map)
				return mapEntryWithNumberedPriorityToIndex.get(entryA)! - mapEntryWithNumberedPriorityToIndex.get(entryB)!;
			}

			if (entryA.alignment === StatusbarAlignment.LEFT) {
				return -1;
			}

			if (entryB.alignment === StatusbarAlignment.LEFT) {
				return 1;
			}

			return 0;
		});

		let sortedEntries: IStatusbarViewModelEntry[];

		// Entries with location: sort in accordingly
		if (mapEntryWithRelativePriority.size > 0) {
			sortedEntries = [];

			for (const entry of sortedEntriesWithNumberedPriority) {
				const relativeEntriesMap = mapEntryWithRelativePriority.get(entry.id);
				const relativeEntries = relativeEntriesMap ? Array.from(relativeEntriesMap.values()) : undefined;

				// Fill relative entries to LEFT
				if (relativeEntries) {
					sortedEntries.push(...relativeEntries.filter(entry => isStatusbarEntryLocation(entry.priority.primary) && entry.priority.primary.alignment === StatusbarAlignment.LEFT));
				}

				// Fill referenced entry
				sortedEntries.push(entry);

				// Fill relative entries to RIGHT
				if (relativeEntries) {
					sortedEntries.push(...relativeEntries.filter(entry => isStatusbarEntryLocation(entry.priority.primary) && entry.priority.primary.alignment === StatusbarAlignment.RIGHT));
				}

				// Delete from map to mark as handled
				mapEntryWithRelativePriority.delete(entry.id);
			}

			// Finally, just append all entries that reference another entry
			// that does not exist to the end of the list
			for (const [, entries] of mapEntryWithRelativePriority) {
				sortedEntries.push(...entries.values());
			}
		}

		// No entries with relative priority: take sorted entries as is
		else {
			sortedEntries = sortedEntriesWithNumberedPriority;
		}

		// Take over as new truth of entries
		this._entries = sortedEntries;
	}

	private markFirstLastVisibleEntry(): void {
		this.doMarkFirstLastVisibleStatusbarItem(this.getEntries(StatusbarAlignment.LEFT));
		this.doMarkFirstLastVisibleStatusbarItem(this.getEntries(StatusbarAlignment.RIGHT));
	}

	private doMarkFirstLastVisibleStatusbarItem(entries: IStatusbarViewModelEntry[]): void {
		let firstVisibleItem: IStatusbarViewModelEntry | undefined;
		let lastVisibleItem: IStatusbarViewModelEntry | undefined;

		for (const entry of entries) {

			// Clear previous first
			entry.container.classList.remove('first-visible-item', 'last-visible-item');

			const isVisible = !this.isHidden(entry.id);
			if (isVisible) {
				if (!firstVisibleItem) {
					firstVisibleItem = entry;
				}

				lastVisibleItem = entry;
			}
		}

		// Mark: first visible item
		firstVisibleItem?.container.classList.add('first-visible-item');

		// Mark: last visible item
		lastVisibleItem?.container.classList.add('last-visible-item');
	}
}
