/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ISessionWorkspaceBrowseAction } from '../../../services/sessions/common/session.js';
import { INestedChatFolderInfo, INestedChatWorkspace, INestedChatWorkspaceSupport } from '../../../services/sessions/common/sessionsProvider.js';
import { BranchPicker, IBranchPickerState, NEW_WORKTREE_LABEL } from './branchPicker.js';

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
}

/** The preselected folder: the session's folder, or "No workspace" in a session without one. */
export function getDefaultNestedChatFolder(support: INestedChatWorkspaceSupport): NestedChatFolderChoice {
	return support.sessionFolder ? { kind: 'folder', folder: support.sessionFolder } : { kind: 'scratch' };
}

/**
 * The folders offered for a nested chat. An agent that supports only one folder gets only the
 * session's own folder, or "No workspace" in a session without one: any other choice would be refused.
 */
export function getNestedChatFolderOptions(support: INestedChatWorkspaceSupport): INestedChatFolderOptions {
	if (!support.multipleFolders) {
		return { choices: [getDefaultNestedChatFolder(support)], browseActions: [] };
	}
	const choices: NestedChatFolderChoice[] = support.sessionFolders.map(folder => ({ kind: 'folder', folder }));
	if (support.sessionFolder && !support.sessionFolders.some(folder => isEqual(folder, support.sessionFolder))) {
		choices.unshift({ kind: 'folder', folder: support.sessionFolder });
	}
	choices.push({ kind: 'scratch' });
	return { choices, browseActions: support.browseActions };
}

export function isSameNestedChatFolder(a: NestedChatFolderChoice, b: NestedChatFolderChoice): boolean {
	return a.kind === 'scratch' ? b.kind === 'scratch' : b.kind === 'folder' && isEqual(a.folder, b.folder);
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
}

type FolderPickerItem =
	| { readonly kind: 'choice'; readonly choice: NestedChatFolderChoice; readonly checked: boolean }
	| { readonly kind: 'browse'; readonly action: ISessionWorkspaceBrowseAction };

/**
 * Folder, isolation and branch pickers of the New Nested Session composer. The agent and the
 * environment come from the parent session, so there is no harness or environment picker.
 */
export class NestedChatWorkspaceControls extends Disposable {

	private readonly _folder = observableValue<NestedChatFolderChoice | undefined>(this, undefined);
	private readonly _worktree = observableValue<boolean>(this, false);
	private readonly _branch = observableValue<string | undefined>(this, undefined);
	private readonly _folderInfo = observableValue<INestedChatFolderInfo | undefined>(this, undefined);
	private readonly _branches = observableValue<readonly string[] | 'loading' | 'error'>(this, []);
	private readonly _resolve = this._register(new MutableDisposable<DisposableStore>());
	private readonly _renderStore = this._register(new DisposableStore());
	private _isOpen = false;

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
		// A different parent session starts over from its own default.
		let lastSupport: INestedChatWorkspaceSupport | undefined;
		this._register(autorun(reader => {
			const support = this._host.support.read(reader);
			if (support === lastSupport) {
				return;
			}
			const sameSession = lastSupport && support && isSameNestedChatFolder(getDefaultNestedChatFolder(lastSupport), getDefaultNestedChatFolder(support));
			lastSupport = support;
			if (!sameSession) {
				this._select(support ? getDefaultNestedChatFolder(support) : undefined);
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
		this._host.getBranches(folder.folder, cts.token).then(branches => {
			if (!cts.token.isCancellationRequested) {
				this._branches.set(branches, undefined);
			}
		}, () => {
			if (!cts.token.isCancellationRequested) {
				this._branches.set('error', undefined);
			}
		});
	}

	render(container: HTMLElement): void {
		this._renderStore.clear();
		const element = dom.append(container, dom.$('.nested-chat-workspace-controls'));
		this._renderStore.add(toDisposable(() => element.remove()));

		const slot = dom.append(element, dom.$('.sessions-chat-picker-slot.nested-chat-folder-picker'));
		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');
		this._renderStore.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderStore.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				this._showFolderPicker(trigger);
			}));
		}
		this._renderStore.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showFolderPicker(trigger);
			}
		}));

		const branchPicker = this._renderStore.add(this._instantiationService.createInstance(BranchPicker, {
			user: 'NestedChatBranchPicker',
			onSelectBranch: branch => this._branch.set(branch, undefined),
			onRetry: () => this._loadBranches(),
			renderDisabledAsStatic: true,
			isolation: {
				label: NEW_WORKTREE_LABEL,
				ariaLabel: localize('nestedChat.worktree.ariaLabel', "Give the nested session its own Git worktree"),
				onToggle: checked => {
					this._worktree.set(checked, undefined);
					if (checked && this._branches.get() !== 'loading' && this._branches.get().length === 0) {
						this._loadBranches();
					}
				},
			},
		}));
		const branchSlot = dom.append(element, dom.$('.nested-chat-branch-picker'));
		branchPicker.render(branchSlot);

		this._renderStore.add(autorun(reader => {
			const support = this._host.support.read(reader);
			const folder = this._folder.read(reader);
			element.classList.toggle('hidden', !support || !folder);
			if (!support || !folder) {
				return;
			}
			const options = getNestedChatFolderOptions(support);
			const canOpen = options.choices.length > 1 || options.browseActions.length > 0;
			dom.clearNode(trigger);
			dom.append(trigger, renderIcon(folder.kind === 'scratch' ? Codicon.circleSlash : Codicon.folder)).setAttribute('aria-hidden', 'true');
			const label = this._getFolderLabel(folder);
			dom.append(trigger, dom.$('span.sessions-chat-dropdown-label')).textContent = label;
			if (canOpen) {
				dom.append(trigger, renderIcon(Codicon.chevronDown)).setAttribute('aria-hidden', 'true');
			}
			trigger.tabIndex = canOpen ? 0 : -1;
			trigger.title = label;
			if (canOpen) {
				trigger.setAttribute('role', 'button');
				trigger.setAttribute('aria-label', localize('nestedChat.folder.ariaLabel', "Pick Folder for the Nested Session, {0}", label));
			} else {
				trigger.removeAttribute('role');
				trigger.setAttribute('aria-label', localize('nestedChat.folder.staticAriaLabel', "Folder for the Nested Session, {0}", label));
			}
			slot.classList.toggle('disabled', !canOpen);
		}));

		this._renderStore.add(autorun(reader => {
			const folderInfo = this._folderInfo.read(reader);
			const worktree = this._worktree.read(reader);
			const branch = this._branch.read(reader);
			const branches = this._branches.read(reader);
			// Worktrees only for a picked Git folder; "No workspace" and other folders stay folders.
			const offersWorktree = folderInfo?.supportsWorktree === true;
			branchSlot.classList.toggle('hidden', !offersWorktree);
			const state: IBranchPickerState = {
				label: branch ?? localize('nestedChat.branch.default', "Default Branch"),
				branches: Array.isArray(branches) ? branches.map(name => ({ name, selected: name === branch })) : [],
				status: branches === 'loading' ? 'loading' : branches === 'error' ? 'error' : branches.length ? 'ready' : 'empty',
				canOpen: offersWorktree && worktree,
				disabledReason: offersWorktree && !worktree ? localize('nestedChat.branch.disabled', "Select New Worktree to pick the branch the worktree starts from.") : undefined,
				isolation: { checked: offersWorktree && worktree, state: offersWorktree ? 'enabled' : 'hidden' },
			};
			branchPicker.update(state);
		}));
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
		const options = getNestedChatFolderOptions(support);
		if (options.choices.length < 2 && options.browseActions.length === 0) {
			return;
		}
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
		const delegate: IActionListDelegate<FolderPickerItem> = {
			onSelect: item => {
				this._actionWidgetService.hide();
				if (item.kind === 'choice') {
					this._select(item.choice);
					return;
				}
				item.action.run().then(workspace => {
					const folder = workspace?.folders[0]?.workingDirectory;
					if (folder) {
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
