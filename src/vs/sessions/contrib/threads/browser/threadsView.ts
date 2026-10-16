/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/threadsView.css';
import * as DOM from '../../../../base/browser/dom.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { IThreadDescriptor, IThreadsService } from '../../../services/threads/browser/threadsService.js';
import { renderThreadAvatar } from './threadAvatar.js';
import { IThreadSetupService } from './threadSetupService.js';

export class ThreadsView extends Disposable {
	readonly element: HTMLElement;
	private readonly body: HTMLElement;
	private readonly header: HTMLElement;
	private readonly renderStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly renameStore = this._register(new MutableDisposable<DisposableStore>());
	private keyboardItems: HTMLElement[] = [];
	private readonly renderedRows = new Map<string, HTMLElement>();
	private readonly motionReduced: IObservable<boolean>;

	constructor(
		parent: HTMLElement,
		visible: IObservable<boolean>,
		@IThreadsService private readonly threadsService: IThreadsService,
		@IThreadSetupService private readonly threadSetupService: IThreadSetupService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super();
		this.motionReduced = observableFromEvent(this, accessibilityService.onDidChangeReducedMotion, () => accessibilityService.isMotionReduced());
		this.element = DOM.append(parent, DOM.$('.agent-threads-view'));
		this._register(autorun(reader => this.element.classList.toggle('hidden', !visible.read(reader))));
		this.header = DOM.append(this.element, DOM.$('.agent-threads-header'));
		const title = DOM.append(this.header, DOM.$('span.agent-threads-title'));
		title.textContent = localize('threads.title', "Threads");
		const actions = DOM.append(this.header, DOM.$('.agent-threads-header-actions'));
		const toolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, actions, {
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
		this._register(this.hoverService.setupDelayedHover(title, {
			content: localize('threads.hover', "Persistent agent conversations"),
		}));
		this._register(autorun(reader => {
			const threads = this.threadsService.threads.read(reader);
			this.renderThreads(threads);
		}));
	}

	private renderThreads(threads: readonly IThreadDescriptor[]): void {
		this.renameStore.clear();
		const renderStore = new DisposableStore();
		this.renderStore.value = renderStore;
		DOM.clearNode(this.body);
		this.keyboardItems = [];
		this.renderedRows.clear();
		if (threads.length === 0) {
			const empty = DOM.append(this.body, DOM.$('.agent-threads-empty'));
			empty.textContent = localize('threads.empty', "Create a persistent thread");
			return;
		}
		for (const thread of threads) {
			this.renderThread(thread, this.body);
		}
		this.installKeyboardNavigation(renderStore);
	}

	private renderThread(thread: IThreadDescriptor, parent: HTMLElement): void {
		const store = new DisposableStore();
		const row = DOM.append(parent, DOM.$('.agent-thread-row'));
		row.dataset.threadId = thread.id;
		this.renderedRows.set(thread.id, row);
		row.role = 'treeitem';
		row.tabIndex = -1;
		this.keyboardItems.push(row);
		row.setAttribute('aria-label', thread.automationIds.length > 0
			? localize('thread.aria.withAutomations', "{0}, {1} automations", thread.name, thread.automationIds.length)
			: thread.name);
		const avatar = DOM.append(row, DOM.$('.agent-thread-avatar'));
		const session = this.sessionsManagementService.getSession(thread.sessionResource);
		store.add(renderThreadAvatar(avatar, thread.avatar, session?.status ?? constObservable(SessionStatus.Completed), this.motionReduced));
		const text = DOM.append(row, DOM.$('.agent-thread-text'));
		const label = DOM.append(text, DOM.$('.agent-thread-label'));
		label.textContent = thread.name;
		store.add(this.hoverService.setupDelayedHover(label, { content: thread.name }));
		const actions = DOM.append(row, DOM.$('.agent-thread-actions'));
		const toolbar = store.add(this.instantiationService.createInstance(WorkbenchToolBar, actions, {
			ariaLabel: localize('thread.actions', "Actions for {0}", thread.name),
		}));
		const addAutomation = store.add(new Action(
			'sessions.threads.addAutomation',
			localize('thread.addAutomation', "Add Automation"),
			ThemeIcon.asClassName(Codicon.calendar),
			true,
			() => this.threadSetupService.createAutomation(thread).then(undefined, error => this.notificationService.error(error)),
		));
		toolbar.setActions([addAutomation]);
		const open = () => this.threadSetupService.openThread(thread).catch(error => this.notificationService.error(error));
		store.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, event => {
			if (!row.classList.contains('editing') && !DOM.isAncestor(event.target as HTMLElement, actions)) {
				void open();
			}
		}));
		store.add(DOM.addDisposableListener(row, DOM.EventType.CONTEXT_MENU, event => {
			event.preventDefault();
			event.stopPropagation();
			row.focus();
			this.showContextMenu(thread, row, text, row);
		}));
		store.add(DOM.addDisposableListener(row, DOM.EventType.KEY_DOWN, event => {
			if (row.classList.contains('editing')) {
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				void open();
			} else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
				event.preventDefault();
				this.showContextMenu(thread, row, text, row);
			}
		}));
		store.add({ dispose: () => row.remove() });
		this.renderStore.value?.add(store);
	}

	private showContextMenu(thread: IThreadDescriptor, row: HTMLElement, text: HTMLElement, anchor: HTMLElement): void {
		const disposables = new DisposableStore();
		const actions = [
			disposables.add(new Action(
				'sessions.threads.rename',
				localize('thread.rename', "Rename"),
				ThemeIcon.asClassName(Codicon.edit),
				true,
				() => this.beginRename(thread, row, text),
			)),
			disposables.add(new Action(
				'sessions.threads.changeAvatar',
				localize('thread.changeAvatar', "Change Avatar"),
				ThemeIcon.asClassName(Codicon.symbolColor),
				true,
				() => this.threadSetupService.changeAvatar(thread).then(undefined, error => this.notificationService.error(error)),
			)),
			disposables.add(new Action(
				'sessions.threads.changeAgents',
				localize('thread.changeAgents', "Manage Agents..."),
				ThemeIcon.asClassName(Codicon.agent),
				true,
				() => this.threadSetupService.changeParticipants(thread).then(undefined, error => this.notificationService.error(error)),
			)),
			disposables.add(new Action(
				'sessions.threads.delete',
				localize('thread.delete', "Delete..."),
				ThemeIcon.asClassName(Codicon.trash),
				true,
				() => this.delete(thread).catch(error => this.notificationService.error(error)),
			)),
		];
		this.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => anchor,
			onHide: () => disposables.dispose(),
		});
	}

	private beginRename(thread: IThreadDescriptor, row: HTMLElement, text: HTMLElement): void {
		const disposables = new DisposableStore();
		this.renameStore.value = disposables;
		row.classList.add('editing');
		DOM.clearNode(text);
		let done = false;
		disposables.add(toDisposable(() => done = true));
		const input = new InputBox(text, this.contextViewService, {
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: localize('thread.rename.ariaLabel', "Rename {0}", thread.name),
			validationOptions: {
				validation: value => value.trim()
					? null
					: { content: localize('thread.rename.empty', "Thread name cannot be empty"), type: MessageType.ERROR },
			},
		});
		disposables.add(input);
		input.value = thread.name;
		input.focus();
		input.select();

		const finish = (commit: boolean, restoreFocus: boolean) => {
			if (done) {
				return;
			}
			const name = input.value.trim();
			if (commit && !name) {
				if (restoreFocus) {
					input.validate();
					input.focus();
					return;
				}
				commit = false;
			}
			done = true;
			this.renameStore.clear();
			this.renderThreads(this.threadsService.threads.get());
			if (commit && name !== thread.name) {
				this.threadsService.renameThread(thread.id, name).catch(error => this.notificationService.error(error));
			}
			if (restoreFocus) {
				this.renderedRows.get(thread.id)?.focus();
			}
		};
		disposables.add(DOM.addDisposableListener(input.inputElement, DOM.EventType.KEY_DOWN, event => {
			if (event.key === 'Enter') {
				event.preventDefault();
				event.stopPropagation();
				finish(true, true);
			} else if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				finish(false, true);
			}
		}));
		disposables.add(DOM.addDisposableListener(input.inputElement, DOM.EventType.BLUR, () => finish(true, false)));
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
