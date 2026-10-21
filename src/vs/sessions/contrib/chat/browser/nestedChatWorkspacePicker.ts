/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun, derived, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ISessionWorkspaceBrowseAction } from '../../../services/sessions/common/session.js';
import { INestedChatFolderInfo, INestedChatWorkspace, INestedChatWorkspaceSupport } from '../../../services/sessions/common/sessionsProvider.js';
import { BranchPicker, IBranchPickerState } from './branchPicker.js';
import { IsolationPicker } from './isolationPicker.js';
import { IComposerRepositoryControls } from './newChatComposerInput.js';

// #region --- Model ---

/** The folder chosen for a new nested chat: a folder, or "No workspace" (the chat's own scratch folder). */
export type NestedChatFolderChoice =
	| { readonly kind: 'folder'; readonly folder: URI }
	| { readonly kind: 'scratch' };

/** What the folder picker offers for a session. */
export interface INestedChatFolderOptions {
	readonly choices: readonly NestedChatFolderChoice[];
	/** Browse actions offered after the folders; empty when the agent can't give a chat a folder of its own. */
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];
	/** Whether "Open Folder…" (a local folder dialog) is offered after the browse actions. */
	readonly openFolder: boolean;
}

/** Where else a nested chat may find a folder, like New Session: recent folders and a local folder dialog. */
export interface INestedChatFolderSources {
	/** Recently used folders of the session's provider, most recent first. */
	readonly recentFolders: readonly URI[];
	/** Whether the session's provider runs on this computer, so a local folder dialog applies. */
	readonly canOpenLocalFolder: boolean;
}

const MAX_RECENT_FOLDERS = 5;

/** The preselected folder: the session's folder, or "No workspace" in a session without one. */
export function getDefaultNestedChatFolder(support: INestedChatWorkspaceSupport): NestedChatFolderChoice {
	return support.sessionFolder ? { kind: 'folder', folder: support.sessionFolder } : { kind: 'scratch' };
}

/**
 * The folders offered for a nested chat. An agent that supports only one folder gets only the
 * session's own folder, or "No workspace" in a session without one: any other choice would be refused.
 */
export function getNestedChatFolderOptions(support: INestedChatWorkspaceSupport, sources: INestedChatFolderSources): INestedChatFolderOptions {
	if (!support.multipleFolders) {
		return { choices: [getDefaultNestedChatFolder(support)], browseActions: [], openFolder: false };
	}
	const folders: URI[] = [...support.sessionFolders];
	if (support.sessionFolder && !folders.some(folder => isEqual(folder, support.sessionFolder))) {
		folders.unshift(support.sessionFolder);
	}
	// Recent folders follow the session's own; a scratch folder of the session is never one of them.
	const recent = sources.recentFolders.filter(folder => !folders.some(existing => isEqual(existing, folder))).slice(0, MAX_RECENT_FOLDERS);
	const choices: NestedChatFolderChoice[] = [...folders, ...recent].map(folder => ({ kind: 'folder', folder }));
	choices.push({ kind: 'scratch' });
	return { choices, browseActions: support.browseActions, openFolder: sources.canOpenLocalFolder };
}

export function isSameNestedChatFolder(a: NestedChatFolderChoice, b: NestedChatFolderChoice): boolean {
	return a.kind === 'scratch' ? b.kind === 'scratch' : b.kind === 'folder' && isEqual(a.folder, b.folder);
}

export function isSameNestedChatWorkspace(a: INestedChatWorkspace, b: INestedChatWorkspace): boolean {
	if (a.kind === 'scratch' || b.kind === 'scratch') {
		return a.kind === b.kind;
	}
	return isEqual(a.folder, b.folder) && a.isolation === b.isolation
		&& (a.isolation === 'folder' || b.isolation === 'folder' || a.baseBranch === b.baseBranch);
}

/**
 * The workspace to request for a nested chat, or `undefined` when the choice equals the default:
 * then the chat created when the composer opened already works there and is used as is.
 * A worktree is only requested for a folder the host offers worktrees for.
 */
export function toNestedChatWorkspace(support: INestedChatWorkspaceSupport, choice: NestedChatFolderChoice, worktree: boolean, folderInfo: INestedChatFolderInfo | undefined, branch: string | undefined): INestedChatWorkspace | undefined {
	if (choice.kind === 'scratch') {
		return support.sessionFolder ? { kind: 'scratch' } : undefined;
	}
	if (worktree && folderInfo?.supportsWorktree) {
		return { kind: 'folder', folder: choice.folder, isolation: 'worktree', baseBranch: branch };
	}
	return isSameNestedChatFolder(choice, getDefaultNestedChatFolder(support)) ? undefined : { kind: 'folder', folder: choice.folder, isolation: 'folder' };
}

// #endregion

// #region --- View ---

/** The provider operations the picker needs for the parent session. */
export interface INestedChatWorkspaceHost {
	readonly support: IObservable<INestedChatWorkspaceSupport | undefined>;
	resolveFolder(folder: URI, token: CancellationTokenSource['token']): Promise<INestedChatFolderInfo>;
	getBranches(folder: URI, token: CancellationTokenSource['token']): Promise<readonly string[]>;
	/** Recent folders and whether a local folder dialog applies, read when the folder picker opens. */
	getFolderSources(): INestedChatFolderSources;
	/** Shows a local folder dialog. */
	openLocalFolder(): Promise<URI | undefined>;
}

type FolderPickerItem =
	| { readonly kind: 'choice'; readonly choice: NestedChatFolderChoice; readonly checked: boolean }
	| { readonly kind: 'browse'; readonly action: ISessionWorkspaceBrowseAction }
	| { readonly kind: 'openFolder' };

/**
 * Folder, isolation and branch pickers of the New Nested Session composer, rendered where the New
 * Session composer has its workspace and repository pickers. The agent and the environment come from
 * the parent session, so there is no harness or environment picker.
 */
export class NestedChatWorkspaceControls extends Disposable {

	private readonly _folder = observableValue<NestedChatFolderChoice | undefined>(this, undefined);
	private readonly _worktree = observableValue<boolean>(this, false);
	private readonly _branch = observableValue<string | undefined>(this, undefined);
	private readonly _folderInfo = observableValue<INestedChatFolderInfo | undefined>(this, undefined);
	private readonly _branches = observableValue<readonly string[] | 'loading' | 'error'>(this, []);
	private readonly _resolve = this._register(new MutableDisposable<DisposableStore>());
	private readonly _folderRenderStore = this._register(new DisposableStore());
	private _folderTrigger: HTMLElement | undefined;
	private _isOpen = false;
	private readonly _onDidChangeChatPetPlatform = this._register(new Emitter<void>());
	readonly onDidChangeChatPetPlatform: Event<void> = this._onDidChangeChatPetPlatform.event;
	/** Whether the isolation and branch pickers are offered: for a picked Git folder only, never for "No workspace" or other folders. */
	readonly offersWorktree = derived(this, reader => !!this._host.support.read(reader) && this._folderInfo.read(reader)?.supportsWorktree === true);

	constructor(
		private readonly _host: INestedChatWorkspaceHost,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
		super();
		this._register(toDisposable(() => {
			if (this._isOpen) {
				this._actionWidgetService.hide(true);
			}
		}));
		// The default is selected once support is known, and cleared when it goes away; a session
		// switch resets through `reset()`. Folder or capability updates keep the user's choice.
		this._register(autorun(reader => {
			const supported = !!this._host.support.read(reader);
			if (supported !== !!this._folder.read(undefined)) {
				this.reset();
			}
		}));
	}

	/** The workspace to request for the new chat, `undefined` to keep the composer's chat as is. */
	getWorkspace(): INestedChatWorkspace | undefined {
		const support = this._host.support.get();
		const folder = this._folder.get();
		return support && folder ? toNestedChatWorkspace(support, folder, this._worktree.get(), this._folderInfo.get(), this._branch.get()) : undefined;
	}

	/** Back to the session's default, e.g. after the chat was sent. */
	reset(): void {
		const support = this._host.support.get();
		this._select(support ? getDefaultNestedChatFolder(support) : undefined);
	}

	private _select(choice: NestedChatFolderChoice | undefined): void {
		const store = new DisposableStore();
		this._resolve.value = store;
		transaction(tx => {
			this._folder.set(choice, tx);
			this._worktree.set(false, tx);
			this._branch.set(undefined, tx);
			this._folderInfo.set(undefined, tx);
			this._branches.set([], tx);
		});
		// "No workspace" and folders without Git have no worktree: only folders are resolved.
		if (choice?.kind !== 'folder') {
			return;
		}
		const cts = store.add(new CancellationTokenSource());
		store.add(toDisposable(() => cts.dispose(true)));
		this._host.resolveFolder(choice.folder, cts.token).then(info => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			transaction(tx => {
				this._folderInfo.set(info, tx);
				this._branch.set(info.defaultBranch, tx);
			});
		}, error => {
			if (!cts.token.isCancellationRequested) {
				onUnexpectedError(error);
			}
		});
	}

	private _loadBranches(): void {
		const folder = this._folder.get();
		const store = this._resolve.value;
		if (folder?.kind !== 'folder' || !store || this._branches.get() === 'loading') {
			return;
		}
		const cts = store.add(new CancellationTokenSource());
		store.add(toDisposable(() => cts.dispose(true)));
		this._branches.set('loading', undefined);
		status(localize('nestedChat.branches.loading', "Loading branches…"));
		this._host.getBranches(folder.folder, cts.token).then(branches => {
			if (!cts.token.isCancellationRequested) {
				this._branches.set(branches, undefined);
				status(branches.length
					? localize('nestedChat.branches.loaded', "{0} branches available", branches.length)
					: localize('nestedChat.branches.none', "No branches available"));
			}
		}, () => {
			if (!cts.token.isCancellationRequested) {
				this._branches.set('error', undefined);
				status(localize('nestedChat.branches.error', "Couldn't load branches. Open the branch picker to retry."));
			}
		});
	}

	/**
	 * Renders the folder picker into the options row of the composer, styled like the New Session
	 * workspace picker.
	 */
	renderFolderPicker(row: HTMLElement): void {
		this._folderRenderStore.clear();
		const slot = dom.append(row, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot.sessions-workspace-picker-trigger.nested-chat-folder-picker'));
		this._folderRenderStore.add(toDisposable(() => slot.remove()));
		const trigger = this._folderTrigger = dom.append(slot, dom.$('a.action-label.selected'));
		this._folderRenderStore.add(toDisposable(() => this._folderTrigger = undefined));
		this._folderRenderStore.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._folderRenderStore.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				this._showFolderPicker(trigger);
			}));
		}
		this._folderRenderStore.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showFolderPicker(trigger);
			}
		}));
		const platformObserver = this._folderRenderStore.add(new dom.DisposableResizeObserver(
			'NestedChatWorkspaceControls.chatPetPlatform',
			() => this._onDidChangeChatPetPlatform.fire(),
			dom.getWindow(trigger),
		));
		this._folderRenderStore.add(platformObserver.observe(trigger));

		this._folderRenderStore.add(autorun(reader => {
			const support = this._host.support.read(reader);
			const folder = this._folder.read(reader);
			slot.hidden = !support || !folder;
			if (!support || !folder) {
				return;
			}
			// More than one folder can be picked exactly when the agent gives a chat a folder of its own.
			const canOpen = support.multipleFolders;
			dom.clearNode(trigger);
			dom.append(trigger, renderIcon(folder.kind === 'scratch' ? Codicon.circleSlash : Codicon.folder)).setAttribute('aria-hidden', 'true');
			const label = this._getFolderLabel(folder);
			dom.append(trigger, dom.$('span.sessions-chat-dropdown-label')).textContent = label;
			if (canOpen) {
				const chevron = dom.append(trigger, renderIcon(Codicon.chevronDownCompact));
				chevron.classList.add('sessions-chat-dropdown-chevron');
				chevron.setAttribute('aria-hidden', 'true');
			}
			trigger.tabIndex = canOpen ? 0 : -1;
			if (canOpen) {
				trigger.title = label;
				trigger.setAttribute('role', 'button');
				trigger.setAttribute('aria-haspopup', 'listbox');
				trigger.setAttribute('aria-expanded', String(this._isOpen));
				trigger.setAttribute('aria-label', localize('nestedChat.folder.ariaLabel', "Pick Folder for the Nested Session, {0}", label));
			} else {
				// The only choice: plain text rather than a control, read with its visible label.
				const staticLabel = localize('nestedChat.folder.staticAriaLabel', "Folder for the Nested Session, {0}", label);
				trigger.title = staticLabel;
				trigger.setAttribute('role', 'note');
				trigger.setAttribute('aria-label', staticLabel);
				trigger.removeAttribute('aria-haspopup');
				trigger.removeAttribute('aria-expanded');
			}
			slot.classList.toggle('disabled', !canOpen);
		}));
	}

	/** Elements the chat pet can stand on, like the New Session workspace picker. */
	getChatPetPlatformElements(): readonly HTMLElement[] {
		return this._folderTrigger?.parentElement?.hidden === false ? [this._folderTrigger] : [];
	}

	/**
	 * Renders the isolation and branch pickers into the composer's repository controls, which the
	 * composer places like the New Session ones: in the options row or below the input. The isolation
	 * picker is New Session's (Branch or New Worktree); the branch picker only applies to a worktree.
	 */
	renderRepositoryControls(container: HTMLElement): IComposerRepositoryControls {
		const store = new DisposableStore();
		const element = dom.append(container, dom.$('.nested-chat-repository-controls'));
		store.add(toDisposable(() => element.remove()));

		const isolationPicker = store.add(this._instantiationService.createInstance(IsolationPicker, {
			user: 'NestedChatIsolationPicker',
			onSelect: isolation => this._setWorktree(isolation === 'worktree'),
		}));
		isolationPicker.render(element);

		const separator = dom.append(element, dom.$('span.nested-chat-repository-separator'));
		separator.setAttribute('aria-hidden', 'true');
		const branchSlot = dom.append(element, dom.$('.nested-chat-branch-picker'));
		const branchPicker = store.add(this._instantiationService.createInstance(BranchPicker, {
			user: 'NestedChatBranchPicker',
			onSelectBranch: branch => this._branch.set(branch, undefined),
			onRetry: () => this._loadBranches(),
		}));
		branchPicker.render(branchSlot);

		store.add(autorun(reader => {
			const offersWorktree = this.offersWorktree.read(reader);
			const worktree = offersWorktree && this._worktree.read(reader);
			const branch = this._branch.read(reader);
			const branches = this._branches.read(reader);
			element.hidden = !offersWorktree;
			isolationPicker.update(worktree ? 'worktree' : 'folder');
			separator.hidden = !worktree;
			branchSlot.hidden = !worktree;
			const state: IBranchPickerState = {
				label: branch ?? localize('nestedChat.branch.default', "Default Branch"),
				branches: Array.isArray(branches) ? branches.map(name => ({ name, selected: name === branch })) : [],
				status: branches === 'loading' ? 'loading' : branches === 'error' ? 'error' : branches.length ? 'ready' : 'empty',
				canOpen: worktree,
				// Like the New Session branch picker, which shows no chevron.
				showChevron: false,
			};
			branchPicker.update(state);
		}));
		return { visible: this.offersWorktree, dispose: () => store.dispose() };
	}

	private _setWorktree(worktree: boolean): void {
		this._worktree.set(worktree, undefined);
		if (worktree && this._branches.get() !== 'loading' && this._branches.get().length === 0) {
			this._loadBranches();
		}
	}

	private _getFolderLabel(choice: NestedChatFolderChoice): string {
		return choice.kind === 'scratch'
			? localize('nestedChat.noWorkspace', "No Workspace")
			: this._labelService.getUriBasenameLabel(choice.folder);
	}

	private _showFolderPicker(anchor: HTMLElement): void {
		const support = this._host.support.get();
		const current = this._folder.get();
		if (!support || !current || this._actionWidgetService.isVisible) {
			return;
		}
		if (!support.multipleFolders) {
			return;
		}
		const options = getNestedChatFolderOptions(support, this._host.getFolderSources());
		const items: IActionListItem<FolderPickerItem>[] = options.choices.map(choice => ({
			kind: ActionListItemKind.Action,
			label: this._getFolderLabel(choice),
			description: choice.kind === 'folder'
				? this._labelService.getUriLabel(choice.folder, { relative: false })
				: localize('nestedChat.noWorkspace.description', "Start without a backing workspace"),
			group: { title: '', icon: choice.kind === 'scratch' ? Codicon.circleSlash : Codicon.folder },
			item: { kind: 'choice', choice, checked: isSameNestedChatFolder(choice, current) },
		}));
		for (const action of options.browseActions) {
			items.push({
				kind: ActionListItemKind.Action,
				label: action.label,
				description: action.description,
				group: { title: '', icon: action.icon },
				item: { kind: 'browse', action },
			});
		}
		if (options.openFolder) {
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('nestedChat.openFolder', "Open Folder..."),
				group: { title: '', icon: Codicon.folderOpened },
				item: { kind: 'openFolder' },
			});
		}
		const delegate: IActionListDelegate<FolderPickerItem> = {
			onSelect: item => {
				this._actionWidgetService.hide();
				if (item.kind === 'choice') {
					this._select(item.choice);
					return;
				}
				const picked = item.kind === 'openFolder'
					? this._host.openLocalFolder()
					: item.action.run().then(workspace => workspace?.folders[0]?.workingDirectory);
				picked.then(folder => {
					if (folder && !this._store.isDisposed) {
						this._select({ kind: 'folder', folder });
					}
				}, onUnexpectedError);
			},
			onHide: () => {
				this._isOpen = false;
				anchor.setAttribute('aria-expanded', 'false');
				if (anchor.isConnected) {
					anchor.focus();
				}
			},
		};
		this._isOpen = true;
		anchor.setAttribute('aria-expanded', 'true');
		this._actionWidgetService.show('NestedChatFolderPicker', false, items, delegate, anchor, undefined, [], {
			getAriaLabel: item => item.label ?? '',
			getWidgetAriaLabel: () => localize('nestedChat.folderPicker.ariaLabel', "Nested Session Folder Picker"),
		});
	}
}

// #endregion
