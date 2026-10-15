/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/threadsView.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IThreadDescriptor, IThreadsService } from '../../../services/threads/browser/threadsService.js';
import { renderThreadAvatar } from './threadAvatar.js';
import { IThreadSetupService } from './threadSetupService.js';

const THREADS_EXPANDED_STORAGE_KEY = 'sessions.threads.expanded';
const ARCHIVED_THREADS_EXPANDED_STORAGE_KEY = 'sessions.threads.archived.expanded';

export class ThreadsView extends Disposable {
	readonly element: HTMLElement;
	private readonly body: HTMLElement;
	private readonly header: HTMLElement;
	private readonly headerChevron: HTMLElement;
	private readonly renderStore = this._register(new MutableDisposable<DisposableStore>());
	private expanded: boolean;
	private archivedExpanded: boolean;
	private keyboardItems: HTMLElement[] = [];

	constructor(
		parent: HTMLElement,
		visible: IObservable<boolean>,
		@IThreadsService private readonly threadsService: IThreadsService,
		@IThreadSetupService private readonly threadSetupService: IThreadSetupService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		this.expanded = storageService.getBoolean(THREADS_EXPANDED_STORAGE_KEY, StorageScope.PROFILE, true);
		this.archivedExpanded = storageService.getBoolean(ARCHIVED_THREADS_EXPANDED_STORAGE_KEY, StorageScope.PROFILE, false);
		this.element = DOM.append(parent, DOM.$('.agent-threads-view'));
		this._register(autorun(reader => this.element.classList.toggle('hidden', !visible.read(reader))));
		this.header = DOM.append(this.element, DOM.$('.agent-threads-header'));
		this.header.role = 'treeitem';
		this.header.tabIndex = 0;
		this.headerChevron = DOM.append(this.header, DOM.$('.agent-threads-chevron'));
		this.headerChevron.setAttribute('aria-hidden', 'true');
		const title = DOM.append(this.header, DOM.$('span.agent-threads-title'));
		title.textContent = localize('threads.title', "Threads");
		const actions = DOM.append(this.header, DOM.$('.agent-threads-header-actions'));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, actions, {
			ariaLabel: localize('threads.header.actions', "Thread actions"),
		}));
		const addThread = this._register(new Action(
			'sessions.threads.create',
			localize('threads.create', "Create Thread"),
			ThemeIcon.asClassName(Codicon.add),
			true,
			() => this.threadSetupService.createThread().then(undefined, error => this.notificationService.error(error)),
		));
		toolbar.setActions([addThread]);
		this.body = DOM.append(this.element, DOM.$('.agent-threads-tree'));
		this.body.role = 'tree';
		this._register(DOM.addDisposableListener(this.header, DOM.EventType.CLICK, event => {
			if (DOM.isAncestor(event.target as HTMLElement, actions)) {
				return;
			}
			this.setExpanded(!this.expanded);
		}));
		this._register(DOM.addDisposableListener(this.header, DOM.EventType.KEY_DOWN, event => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				this.setExpanded(!this.expanded);
			} else if (event.key === 'ArrowRight' && !this.expanded) {
				event.preventDefault();
				this.setExpanded(true);
			} else if (event.key === 'ArrowLeft' && this.expanded) {
				event.preventDefault();
				this.setExpanded(false);
			}
		}));
		this._register(hoverService.setupDelayedHover(title, {
			content: localize('threads.hover', "Persistent agent conversations"),
		}));
		this._register(autorun(reader => {
			const threads = this.threadsService.threads.read(reader);
			this.renderThreads(threads, instantiationService);
		}));
		this.updateExpandedState();
	}

	private setExpanded(expanded: boolean): void {
		if (this.expanded === expanded) {
			return;
		}
		this.expanded = expanded;
		this.storageService.store(THREADS_EXPANDED_STORAGE_KEY, expanded, StorageScope.PROFILE, StorageTarget.USER);
		this.updateExpandedState();
	}

	private updateExpandedState(): void {
		this.header.setAttribute('aria-expanded', String(this.expanded));
		this.headerChevron.className = `agent-threads-chevron ${ThemeIcon.asClassName(this.expanded ? Codicon.chevronDown : Codicon.chevronRight)}`;
		this.body.classList.toggle('hidden', !this.expanded);
	}

	private renderThreads(threads: readonly IThreadDescriptor[], instantiationService: IInstantiationService): void {
		const renderStore = new DisposableStore();
		this.renderStore.value = renderStore;
		DOM.clearNode(this.body);
		this.keyboardItems = [];
		const active = threads.filter(thread => !thread.archived);
		const archived = threads.filter(thread => thread.archived);
		if (active.length === 0 && archived.length === 0) {
			const empty = DOM.append(this.body, DOM.$('.agent-threads-empty'));
			empty.textContent = localize('threads.empty', "Create a persistent thread");
			return;
		}
		for (const thread of active) {
			this.renderThread(thread, this.body, instantiationService);
		}
		if (archived.length > 0) {
			const archivedHeader = DOM.append(this.body, DOM.$('.agent-threads-archived-header'));
			archivedHeader.role = 'treeitem';
			archivedHeader.tabIndex = 0;
			this.keyboardItems.push(archivedHeader);
			archivedHeader.setAttribute('aria-expanded', String(this.archivedExpanded));
			const chevron = DOM.append(archivedHeader, DOM.$('.agent-threads-chevron'));
			chevron.setAttribute('aria-hidden', 'true');
			chevron.classList.add(...ThemeIcon.asClassNameArray(this.archivedExpanded ? Codicon.chevronDown : Codicon.chevronRight));
			const label = DOM.append(archivedHeader, DOM.$('span'));
			label.textContent = localize('threads.archived', "Archived Threads");
			const toggle = () => {
				this.archivedExpanded = !this.archivedExpanded;
				this.storageService.store(ARCHIVED_THREADS_EXPANDED_STORAGE_KEY, this.archivedExpanded, StorageScope.PROFILE, StorageTarget.USER);
				this.renderThreads(this.threadsService.threads.get(), instantiationService);
			};
			renderStore.add(DOM.addDisposableListener(archivedHeader, DOM.EventType.CLICK, toggle));
			renderStore.add(DOM.addDisposableListener(archivedHeader, DOM.EventType.KEY_DOWN, event => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					toggle();
				}
			}));
			if (this.archivedExpanded) {
				const archivedGroup = DOM.append(this.body, DOM.$('.agent-threads-archived-group'));
				archivedGroup.role = 'group';
				for (const thread of archived) {
					this.renderThread(thread, archivedGroup, instantiationService);
				}
			}
		}
		this.installKeyboardNavigation(renderStore);
	}

	private renderThread(thread: IThreadDescriptor, parent: HTMLElement, instantiationService: IInstantiationService): void {
		const store = new DisposableStore();
		const row = DOM.append(parent, DOM.$('.agent-thread-row'));
		row.role = 'treeitem';
		row.tabIndex = -1;
		this.keyboardItems.push(row);
		row.setAttribute('aria-label', thread.automationIds.length > 0
			? localize('thread.aria.withAutomations', "{0}, {1} automations", thread.name, thread.automationIds.length)
			: thread.name);
		const avatar = DOM.append(row, DOM.$('.agent-thread-avatar'));
		store.add(renderThreadAvatar(avatar, thread.avatar));
		const text = DOM.append(row, DOM.$('.agent-thread-text'));
		const label = DOM.append(text, DOM.$('.agent-thread-label'));
		label.textContent = thread.name;
		if (thread.automationIds.length > 0) {
			const description = DOM.append(text, DOM.$('.agent-thread-description'));
			description.textContent = thread.automationIds.length === 1
				? localize('thread.automation.single', "1 automation")
				: localize('thread.automation.multiple', "{0} automations", thread.automationIds.length);
		}
		const actions = DOM.append(row, DOM.$('.agent-thread-actions'));
		const toolbar = store.add(instantiationService.createInstance(WorkbenchToolBar, actions, {
			ariaLabel: localize('thread.actions', "Actions for {0}", thread.name),
		}));
		const threadActions = [
			store.add(new Action('sessions.threads.addAutomation', localize('thread.addAutomation', "Add Automation"), ThemeIcon.asClassName(Codicon.clock), true, () => this.threadSetupService.createAutomation(thread))),
			store.add(new Action('sessions.threads.rename', localize('thread.rename', "Rename"), ThemeIcon.asClassName(Codicon.edit), true, () => this.rename(thread))),
			store.add(new Action('sessions.threads.changeAvatar', localize('thread.changeAvatar', "Change Avatar"), ThemeIcon.asClassName(Codicon.symbolColor), true, () => this.threadSetupService.changeAvatar(thread))),
			store.add(new Action(
				thread.archived ? 'sessions.threads.restore' : 'sessions.threads.archive',
				thread.archived ? localize('thread.restore', "Restore") : localize('thread.archive', "Archive"),
				ThemeIcon.asClassName(thread.archived ? Codicon.history : Codicon.archive),
				true,
				() => this.threadsService.setArchived(thread.id, !thread.archived),
			)),
			store.add(new Action('sessions.threads.delete', localize('thread.delete', "Delete..."), ThemeIcon.asClassName(Codicon.trash), true, () => this.delete(thread))),
		];
		toolbar.setActions(threadActions);
		const open = () => this.sessionsService.openSession(thread.sessionResource, { preserveFocus: false }).catch(error => this.notificationService.error(error));
		store.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, event => {
			if (!DOM.isAncestor(event.target as HTMLElement, actions)) {
				void open();
			}
		}));
		store.add(DOM.addDisposableListener(row, DOM.EventType.KEY_DOWN, event => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				void open();
			}
		}));
		store.add({ dispose: () => row.remove() });
		this.renderStore.value?.add(store);
	}

	private async rename(thread: IThreadDescriptor): Promise<void> {
		const result = await this.dialogService.input({
			type: 'info',
			message: localize('thread.rename.title', "Rename Thread"),
			primaryButton: localize('thread.rename.confirm', "Rename"),
			inputs: [{ value: thread.name, placeholder: localize('thread.rename.placeholder', "Thread name") }],
		});
		const name = result.values?.[0]?.trim();
		if (result.confirmed && name) {
			await this.threadsService.renameThread(thread.id, name);
		}
	}

	private async delete(thread: IThreadDescriptor): Promise<void> {
		const result = await this.dialogService.confirm({
			type: 'warning',
			message: localize('thread.delete.title', "Delete \"{0}\"?", thread.name),
			detail: localize('thread.delete.detail', "This permanently deletes the thread's chat session. Associated automation definitions are not deleted."),
			primaryButton: localize('thread.delete.confirm', "Delete"),
		});
		if (result.confirmed) {
			await this.threadsService.deleteThread(thread.id);
		}
	}

	private installKeyboardNavigation(store: DisposableStore): void {
		const items = this.keyboardItems;
		for (const [index, item] of items.entries()) {
			item.tabIndex = index === 0 ? 0 : -1;
			store.add(DOM.addDisposableListener(item, DOM.EventType.KEY_DOWN, event => {
				if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
					return;
				}
				event.preventDefault();
				const nextIndex = event.key === 'Home'
					? 0
					: event.key === 'End'
						? items.length - 1
						: event.key === 'ArrowDown'
							? Math.min(items.length - 1, index + 1)
							: Math.max(0, index - 1);
				for (const candidate of items) {
					candidate.tabIndex = -1;
				}
				items[nextIndex].tabIndex = 0;
				items[nextIndex].focus();
			}));
		}
	}
}
