/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
const OPEN_REPO_COMMAND = 'github.copilot.chat.cloudSessions.openRepository';
const STORAGE_KEY_LAST_REPO = 'agentSessions.lastPickedRepo';
const STORAGE_KEY_RECENT_REPOS = 'agentSessions.recentlyPickedRepos';
const MAX_RECENT_REPOS = 10;
const FILTER_THRESHOLD = 10;
/**
 * A self-contained widget for selecting the repository in cloud sessions.
 * Uses the `github.copilot.chat.cloudSessions.openRepository` command for
 * browsing repositories. Manages recently used repos in storage.
 * Behaves like FolderPicker: trigger button with dropdown, storage persistence,
 * recently used list with remove buttons.
 */
let RepoPicker = class RepoPicker extends Disposable {
    get selectedRepo() {
        return this._selectedRepo?.id;
    }
    constructor(actionWidgetService, storageService, commandService) {
        super();
        this.actionWidgetService = actionWidgetService;
        this.storageService = storageService;
        this.commandService = commandService;
        this._onDidSelectRepo = this._register(new Emitter());
        this.onDidSelectRepo = this._onDidSelectRepo.event;
        this._renderDisposables = this._register(new DisposableStore());
        this._recentlyPickedRepos = [];
        // Restore last picked repo
        try {
            const last = this.storageService.get(STORAGE_KEY_LAST_REPO, 0 /* StorageScope.PROFILE */);
            if (last) {
                this._selectedRepo = JSON.parse(last);
            }
        }
        catch { /* ignore */ }
        // Restore recently picked repos
        try {
            const stored = this.storageService.get(STORAGE_KEY_RECENT_REPOS, 0 /* StorageScope.PROFILE */);
            if (stored) {
                this._recentlyPickedRepos = JSON.parse(stored);
            }
        }
        catch { /* ignore */ }
    }
    /**
     * Renders the repo picker trigger button into the given container.
     * Returns the container element.
     */
    render(container) {
        this._renderDisposables.clear();
        const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
        this._renderDisposables.add({ dispose: () => slot.remove() });
        const trigger = dom.append(slot, dom.$('a.action-label'));
        trigger.tabIndex = 0;
        trigger.role = 'button';
        this._triggerElement = trigger;
        this._updateTriggerLabel();
        this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
            dom.EventHelper.stop(e, true);
            this.showPicker();
        }));
        this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                dom.EventHelper.stop(e, true);
                this.showPicker();
            }
        }));
        return slot;
    }
    /**
     * Shows the repo picker dropdown anchored to the trigger element.
     */
    showPicker() {
        if (!this._triggerElement || this.actionWidgetService.isVisible) {
            return;
        }
        const items = this._buildItems();
        const showFilter = items.filter(i => i.kind === "action" /* ActionListItemKind.Action */).length > FILTER_THRESHOLD;
        const triggerElement = this._triggerElement;
        const delegate = {
            onSelect: (item) => {
                this.actionWidgetService.hide();
                if (item.id === 'browse') {
                    this._browseForRepo();
                }
                else {
                    this._selectRepo(item);
                }
            },
            onHide: () => { triggerElement.focus(); },
        };
        this.actionWidgetService.show('repoPicker', false, items, delegate, this._triggerElement, undefined, [], {
            getAriaLabel: (item) => item.label ?? '',
            getWidgetAriaLabel: () => localize('repoPicker.ariaLabel', "Repository Picker"),
        }, showFilter ? { showFilter: true, filterPlaceholder: localize('repoPicker.filter', "Filter repositories...") } : undefined);
    }
    /**
     * Programmatically set the selected repository.
     */
    setSelectedRepo(repoPath) {
        this._selectRepo({ id: repoPath, name: repoPath });
    }
    /**
     * Clears the selected repository.
     */
    clearSelection() {
        this._selectedRepo = undefined;
        this._updateTriggerLabel();
    }
    _selectRepo(item) {
        this._selectedRepo = item;
        this._addToRecentlyPicked(item);
        this.storageService.store(STORAGE_KEY_LAST_REPO, JSON.stringify(item), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        this._updateTriggerLabel();
        this._onDidSelectRepo.fire(item.id);
    }
    async _browseForRepo() {
        try {
            const result = await this.commandService.executeCommand(OPEN_REPO_COMMAND);
            if (result) {
                this._selectRepo({ id: result, name: result });
            }
        }
        catch {
            // command was cancelled or failed — nothing to do
        }
    }
    _addToRecentlyPicked(item) {
        this._recentlyPickedRepos = [
            { id: item.id, name: item.name },
            ...this._recentlyPickedRepos.filter(r => r.id !== item.id),
        ].slice(0, MAX_RECENT_REPOS);
        this.storageService.store(STORAGE_KEY_RECENT_REPOS, JSON.stringify(this._recentlyPickedRepos), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    _buildItems() {
        const seenIds = new Set();
        const items = [];
        // Currently selected (shown first, checked)
        if (this._selectedRepo) {
            seenIds.add(this._selectedRepo.id);
            items.push({
                kind: "action" /* ActionListItemKind.Action */,
                label: this._selectedRepo.name,
                group: { title: '', icon: Codicon.repo },
                item: this._selectedRepo,
            });
        }
        // Recently picked repos (sorted by name)
        const dedupedRepos = this._recentlyPickedRepos.filter(r => !seenIds.has(r.id));
        dedupedRepos.sort((a, b) => a.name.localeCompare(b.name));
        for (const repo of dedupedRepos) {
            seenIds.add(repo.id);
            items.push({
                kind: "action" /* ActionListItemKind.Action */,
                label: repo.name,
                group: { title: '', icon: Codicon.repo },
                item: repo,
                onRemove: () => this._removeRepo(repo.id),
            });
        }
        // Separator + Browse...
        if (items.length > 0) {
            items.push({ kind: "separator" /* ActionListItemKind.Separator */, label: '' });
        }
        items.push({
            kind: "action" /* ActionListItemKind.Action */,
            label: localize('browseRepo', "Browse..."),
            group: { title: '', icon: Codicon.search },
            item: { id: 'browse', name: localize('browseRepo', "Browse...") },
        });
        return items;
    }
    _removeRepo(repoId) {
        this._recentlyPickedRepos = this._recentlyPickedRepos.filter(r => r.id !== repoId);
        this.storageService.store(STORAGE_KEY_RECENT_REPOS, JSON.stringify(this._recentlyPickedRepos), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        // Re-show picker with updated items
        this.actionWidgetService.hide();
        this.showPicker();
    }
    _updateTriggerLabel() {
        if (!this._triggerElement) {
            return;
        }
        dom.clearNode(this._triggerElement);
        const label = this._selectedRepo?.name ?? localize('pickRepo', "Pick Repository");
        dom.append(this._triggerElement, renderIcon(Codicon.repo));
        const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
        labelSpan.textContent = label;
        dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
    }
};
RepoPicker = __decorate([
    __param(0, IActionWidgetService),
    __param(1, IStorageService),
    __param(2, ICommandService)
], RepoPicker);
export { RepoPicker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb1BpY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3JlcG9QaWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRWpHLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVuRixNQUFNLGlCQUFpQixHQUFHLGtEQUFrRCxDQUFDO0FBQzdFLE1BQU0scUJBQXFCLEdBQUcsOEJBQThCLENBQUM7QUFDN0QsTUFBTSx3QkFBd0IsR0FBRyxtQ0FBbUMsQ0FBQztBQUNyRSxNQUFNLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztBQUM1QixNQUFNLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztBQU81Qjs7Ozs7O0dBTUc7QUFDSSxJQUFNLFVBQVUsR0FBaEIsTUFBTSxVQUFXLFNBQVEsVUFBVTtJQVd6QyxJQUFJLFlBQVk7UUFDZixPQUFPLElBQUksQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDO0lBQy9CLENBQUM7SUFFRCxZQUN1Qixt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