/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isStatusbarEntryLocation } from '../../../services/statusbar/browser/statusbar.js';
import { hide, show, isAncestorOfActiveElement } from '../../../../base/browser/dom.js';
import { Emitter } from '../../../../base/common/event.js';
export class StatusbarViewModel extends Disposable {
    static { this.HIDDEN_ENTRIES_KEY = 'workbench.statusbar.hidden'; }
    get entries() { return this._entries.slice(0); }
    get lastFocusedEntry() {
        return this._lastFocusedEntry && !this.isHidden(this._lastFocusedEntry.id) ? this._lastFocusedEntry : undefined;
    }
    constructor(storageService) {
        super();
        this.storageService = storageService;
        this._onDidChangeEntryVisibility = this._register(new Emitter());
        this.onDidChangeEntryVisibility = this._onDidChangeEntryVisibility.event;
        this._entries = []; // Intentionally not using a map here since multiple entries can have the same ID
        this.hidden = new Set();
        this.restoreState();
        this.registerListeners();
    }
    restoreState() {
        const hiddenRaw = this.storageService.get(StatusbarViewModel.HIDDEN_ENTRIES_KEY, 0 /* StorageScope.PROFILE */);
        if (hiddenRaw) {
            try {
                this.hidden = new Set(JSON.parse(hiddenRaw));
            }
            catch (error) {
                // ignore parsing errors
            }
        }
    }
    registerListeners() {
        this._register(this.storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, StatusbarViewModel.HIDDEN_ENTRIES_KEY, this._store)(() => this.onDidStorageValueChange()));
    }
    onDidStorageValueChange() {
        // Keep current hidden entries
        const currentlyHidden = new Set(this.hidden);
        // Load latest state of hidden entries
        this.hidden.clear();
        this.restoreState();
        const changed = new Set();
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
    add(entry) {
        // Add to set of entries
        this._entries.push(entry);
        // Update visibility directly
        this.updateVisibility(entry, false);
        // Sort according to priority
        this.sort();
        // Mark first/last visible entry
        this.markFirstLastVisibleEntry();
    }
    remove(entry) {
        const index = this._entries.indexOf(entry);
        if (index >= 0) {
            // Remove from entries
            this._entries.splice(index, 1);
            // Re-sort entries if this one was used
            // as reference from other entries
            if (this._entries.some(otherEntry => isStatusbarEntryLocation(otherEntry.priority.primary) && otherEntry.priority.primary.location.id === entry.id)) {
                this.sort();
            }
            // Mark first/last visible entry
            this.markFirstLastVisibleEntry();
        }
    }
    isHidden(id) {
        return this.hidden.has(id);
    }
    hide(id) {
        if (!this.hidden.has(id)) {
            this.hidden.add(id);
            this.updateVisibility(id, true);
            this.saveState();
        }
    }
    show(id) {
        if (this.hidden.delete(id)) {
            this.updateVisibility(id, true);
            this.saveState();
        }
    }
    findEntry(container) {
        return this._entries.find(entry => entry.container === container);
    }
    getEntries(alignment) {
        return this._entries.filter(entry => entry.alignment === alignment);
    }
    focusNextEntry() {
        this.focusEntry(+1, 0);
    }
    focusPreviousEntry() {
        this.focusEntry(-1, this.entries.length - 1);
    }
    isEntryFocused() {
        return !!this.getFocusedEntry();
    }
    getFocusedEntry() {
        return this._entries.find(entry => isAncestorOfActiveElement(entry.container));
    }
    focusEntry(delta, restartPosition) {
        const getVisibleEntry = (start) => {
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
    updateVisibility(arg1, trigger) {
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
            }
            else {
                show(entry.container);
            }
            if (trigger) {
                this._onDidChangeEntryVisibility.fire({ id: entry.id, visible: !isHidden });
            }
            // Mark first/last visible entry
            this.markFirstLastVisibleEntry();
        }
    }
    saveState() {
        if (this.hidden.size > 0) {
            this.storageService.store(StatusbarViewModel.HIDDEN_ENTRIES_KEY, JSON.stringify(Array.from(this.hidden.values())), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
        else {
            this.storageService.remove(StatusbarViewModel.HIDDEN_ENTRIES_KEY, 0 /* StorageScope.PROFILE */);
        }
    }
    sort() {
        const allEntryIds = new Set(this._entries.map(entry => entry.id));
        // Split up entries into 2 buckets:
        // - those with priority as number that can be compared or with a missing relative entry
        // - those with a relative priority that must be sorted relative to another entry that exists
        const mapEntryWithNumberedPriorityToIndex = new Map();
        const mapEntryWithRelativePriority = new Map();
        for (let i = 0; i < this._entries.length; i++) {
            const entry = this._entries[i];
            if (typeof entry.priority.primary === 'number' || !allEntryIds.has(entry.priority.primary.location.id)) {
                mapEntryWithNumberedPriorityToIndex.set(entry, i);
            }
            else {
                const referenceEntryId = entry.priority.primary.location.id;
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
        // Sort the entries with `priority: number` or referencing a missing entry accordingly
        const sortedEntriesWithNumberedPriority = Array.from(mapEntryWithNumberedPriorityToIndex.keys());
        sortedEntriesWithNumberedPriority.sort((entryA, entryB) => {
            if (entryA.alignment === entryB.alignment) {
                // Sort by primary/secondary priority: higher values move towards the left
                const entryAPrimaryPriority = typeof entryA.priority.primary === 'number' ? entryA.priority.primary : entryA.priority.primary.location.priority;
                const entryBPrimaryPriority = typeof entryB.priority.primary === 'number' ? entryB.priority.primary : entryB.priority.primary.location.priority;
                if (entryAPrimaryPriority !== entryBPrimaryPriority) {
                    return entryBPrimaryPriority - entryAPrimaryPriority;
                }
                if (entryA.priority.secondary !== entryB.priority.secondary) {
                    return entryB.priority.secondary - entryA.priority.secondary;
                }
                // otherwise maintain stable order (both values known to be in map)
                return mapEntryWithNumberedPriorityToIndex.get(entryA) - mapEntryWithNumberedPriorityToIndex.get(entryB);
            }
            if (entryA.alignment === 0 /* StatusbarAlignment.LEFT */) {
                return -1;
            }
            if (entryB.alignment === 0 /* StatusbarAlignment.LEFT */) {
                return 1;
            }
            return 0;
        });
        let sortedEntries;
        // Entries with location: sort in accordingly
        if (mapEntryWithRelativePriority.size > 0) {
            sortedEntries = [];
            for (const entry of sortedEntriesWithNumberedPriority) {
                const relativeEntriesMap = mapEntryWithRelativePriority.get(entry.id);
                const relativeEntries = relativeEntriesMap ? Array.from(relativeEntriesMap.values()) : undefined;
                // Fill relative entries to LEFT
                if (relativeEntries) {
                    sortedEntries.push(...relativeEntries
                        .filter(entry => isStatusbarEntryLocation(entry.priority.primary) && entry.priority.primary.alignment === 0 /* StatusbarAlignment.LEFT */)
                        .sort((entryA, entryB) => entryB.priority.secondary - entryA.priority.secondary));
                }
                // Fill referenced entry
                sortedEntries.push(entry);
                // Fill relative entries to RIGHT
                if (relativeEntries) {
                    sortedEntries.push(...relativeEntries
                        .filter(entry => isStatusbarEntryLocation(entry.priority.primary) && entry.priority.primary.alignment === 1 /* StatusbarAlignment.RIGHT */)
                        .sort((entryA, entryB) => entryB.priority.secondary - entryA.priority.secondary));
                }
                // Delete from map to mark as handled
                mapEntryWithRelativePriority.delete(entry.id);
            }
            // Finally, just append all entries that reference another entry
            // that does not exist to the end of the list
            //
            // Note: this should really not happen because of our check in
            // `allEntryIds`, but we play it safe here to really consume
            // all entries.
            //
            for (const [, entries] of mapEntryWithRelativePriority) {
                sortedEntries.push(...Array.from(entries.values()).sort((entryA, entryB) => entryB.priority.secondary - entryA.priority.secondary));
            }
        }
        // No entries with relative priority: take sorted entries as is
        else {
            sortedEntries = sortedEntriesWithNumberedPriority;
        }
        // Take over as new truth of entries
        this._entries = sortedEntries;
    }
    markFirstLastVisibleEntry() {
        this.doMarkFirstLastVisibleStatusbarItem(this.getEntries(0 /* StatusbarAlignment.LEFT */));
        this.doMarkFirstLastVisibleStatusbarItem(this.getEntries(1 /* StatusbarAlignment.RIGHT */));
    }
    doMarkFirstLastVisibleStatusbarItem(entries) {
        let firstVisibleItem;
        let lastVisibleItem;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHVzYmFyTW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9zdGF0dXNiYXIvc3RhdHVzYmFyTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSx3QkFBd0IsRUFBK0MsTUFBTSxrREFBa0QsQ0FBQztBQUN6SSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXhGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQWEzRCxNQUFNLE9BQU8sa0JBQW1CLFNBQVEsVUFBVTthQUV6Qix1QkFBa0IsR0FBRyw0QkFBNEIsQUFBL0IsQ0FBZ0M7SUFNMUUsSUFBSSxPQUFPLEtBQWlDLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRzVFLElBQUksZ0JBQWdCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ2pILENBQUM7SUFJRCxZQUE2QixjQUErQjtRQUMzRCxLQUFLLEVBQUUsQ0FBQztRQURvQixtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFiM0MsZ0NBQTJCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBb0MsQ0FBQyxDQUFDO1FBQ3RHLCtCQUEwQixHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxLQUFL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