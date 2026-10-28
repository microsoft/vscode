/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun, derived, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { dirname, isEqual } from '../../../../base/common/resources.js';
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
import { INoWorkspaceChoicePresentation } from './noWorkspaceChoice.js';
import { createSessionPickerToolbar } from './sessionPickerToolbar.js';
import { IComposerRepositoryControls } from './newChatComposerInput.js';
import { WORKSPACE_PICKER_LIST_OPTIONS } from './sessionWorkspacePicker.js';

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
 * The folders offered for a nested chat, like New Session: the session's own folder, recent folders and
 * "No workspace". An agent that supports only one folder gets only the session's own folder, or
 * "No workspace" in a session without one: any other choice would be refused. A session folder that no
 * longer exists is not offered to an agent that can give the chat another folder.
 */
export function getNestedChatFolderOptions(support: INestedChatWorkspaceSupport, sources: INestedChatFolderSources, sessionFolderMissing = false): INestedChatFolderOptions {
	if (!support.multipleFolders) {
		return { choices: [getDefaultNestedChatFolder(support)], browseActions: [], openFolder: false };
	}
	const sessionFolder = support.sessionFolder;
	const recent = sources.recentFolders.filter(folder => !sessionFolder || !isEqual(folder, sessionFolder)).slice(0, MAX_RECENT_FOLDERS);
	const choices: NestedChatFolderChoice[] = [...(sessionFolder && !sessionFolderMissing ? [sessionFolder] : []), ...recent].map(folder => ({ kind: 'folder', folder }));
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

/**
 * How a folder choice is marked in the picker: the folder's icon, and the note naming it the session's own worktree.
 * Only the session folder of a session that runs in a git worktree is marked.
 */
export function getNestedChatFolderMark(support: INestedChatWorkspaceSupport, choice: NestedChatFolderChoice, noWorkspaceIcon: ThemeIcon): { readonly icon: ThemeIcon; readonly worktreeNote: string | undefined } {
	if (choice.kind === 'scratch') {
		return { icon: noWorkspaceIcon, worktreeNote: undefined };
	}
	const worktree = support.sessionFolderWorktree;
	if (!worktree || !support.sessionFolder || !isEqual(choice.folder, support.sessionFolder)) {
		return { icon: Codicon.folder, worktreeNote: undefined };
	}
	return {
		icon: Codicon.worktreeCompact,
		worktreeNote: worktree.branch
			? localize('nestedChat.folder.sessionWorktreeBranch', "Session worktree · {0}", worktree.branch)
			: localize('nestedChat.folder.sessionWorktree', "Session worktree"),
	};
}

// #endregion

// #region --- View ---

/** How a folder reads in the folder picker, like a New Session workspace picker row. */
export interface INestedChatFolderLabel {
	/** The folder's name. */
	readonly label: string;
	/** Where the folder is, e.g. its parent folder. */
	readonly description: string | undefined;
}

/** The provider operations the picker needs for the parent session. */
export interface INestedChatWorkspaceHost {
	readonly support: IObservable<INestedChatWorkspaceSupport | undefined>;
	resolveFolder(folder: URI, token: CancellationTokenSource['token']): Promise<INestedChatFolderInfo>;
	getBranches(folder: URI, token: CancellationTokenSource['token']): Promise<readonly string[]>;
	/** Recent folders and whether a local folder dialog applies, read when the folder picker opens. */
	getFolderSources(): INestedChatFolderSources;
	/** How New Session's workspace picker presents choosing no workspace for the session's provider. */
	describeNoWorkspace(): INoWorkspaceChoicePresentation;
	/** How the session's provider labels a folder in New Session's workspace picker, if it does. */
	describeFolder(folder: URI): INestedChatFolderLabel | undefined;
	/**
	 * Whether the folder is still there (a session folder whose worktree was deleted is not), or `undefined`
	 * when that can't be told, e.g. the host is disconnected or `token` is cancelled. Never rejects.
	 */
	folderExists(folder: URI, token: CancellationTokenSource['token']): Promise<boolean | undefined>;
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
	/** Whether the session's folder was found to no longer exist, so "No workspace" is preselected instead. */
	private readonly _sessionFolderMissing = observableValue<boolean>(this, false);
	/** Checks whether the preselected session folder still exists; settles once it is known or can't be told. */
	private _folderCheck: Promise<void> | undefined;
	private readonly _branches = observableValue<readonly string[] | 'loading' | 'error'>(this, []);
	private readonly _resolve = this._register(new MutableDisposable<DisposableStore>());
	private readonly _folderRenderStore = this._register(new DisposableStore());
	private _folderTrigger: HTMLElement | undefined;
	private _folderSlot: HTMLElement | undefined;
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

	/** {@link getWorkspace} once a pending check of the session folder is done, so a chat never starts in a missing folder. */
	async resolveWorkspace(): Promise<INestedChatWorkspace | undefined> {
		await this._folderCheck;
		return this.getWorkspace();
	}

	/** Back to the session's default, e.g. after the chat was sent. */
	reset(): void {
		const support = this._host.support.get();
		this._sessionFolderMissing.set(false, undefined);
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
		const support = this._host.support.get();
		if (support?.multipleFolders && isEqual(choice.folder, support.sessionFolder)) {
			// A session folder that is gone (e.g. a deleted worktree) can't be worked in: start from "No workspace".
			// Only a definite answer counts; when the host can't tell, the session folder is kept.
			const check = this._host.folderExists(choice.folder, cts.token).then(exists => {
				if (exists === false && !cts.token.isCancellationRequested) {
					this._sessionFolderMissing.set(true, undefined);
					this._select({ kind: 'scratch' });
				}
			}, onUnexpectedError);
			this._folderCheck = check;
			store.add(toDisposable(() => {
				if (this._folderCheck === check) {
					this._folderCheck = undefined;
				}
			}));
		}
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
	renderFolderPicker(row: HTMLElement, hoverDelegate?: IHoverDelegate): void {
		this._folderRenderStore.clear();
		const slot = dom.append(row, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot.sessions-workspace-picker-trigger.nested-chat-folder-picker'));
		this._folderRenderStore.add(toDisposable(() => slot.remove()));
		let tooltip = '';
		// Hosted like New Session's pickers: in a toolbar that provides the activation, keyboard and hover.
		const { trigger } = createSessionPickerToolbar(this._folderRenderStore, slot, this._instantiationService,
			'sessions.nestedChatFolderPicker', localize('nestedChat.folder.pickerAction', "Pick Folder for the Nested Session"),
			() => this._showFolderPicker(this._folderTrigger!), hoverDelegate ?? this._folderRenderStore.add(createInstantHoverDelegate()), () => tooltip);
		this._folderTrigger = trigger;
		trigger.classList.add('selected');
		this._folderSlot = slot;
		this._folderRenderStore.add(toDisposable(() => {
			this._folderTrigger = undefined;
			this._folderSlot = undefined;
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
			const mark = getNestedChatFolderMark(support, folder, this._host.describeNoWorkspace().icon);
			dom.append(trigger, renderIcon(mark.icon)).setAttribute('aria-hidden', 'true');
			const folderLabel = this._getFolderLabel(folder);
			dom.append(trigger, dom.$('span.sessions-chat-dropdown-label')).textContent = folderLabel;
			const label = mark.worktreeNote ? localize('nestedChat.folder.labelWithWorktree', "{0}, {1}", folderLabel, mark.worktreeNote) : folderLabel;
			if (canOpen) {
				const chevron = dom.append(trigger, renderIcon(Codicon.chevronDownCompact));
				chevron.classList.add('sessions-chat-dropdown-chevron');
				chevron.setAttribute('aria-hidden', 'true');
			}
			trigger.tabIndex = canOpen ? 0 : -1;
			// Says why "No workspace" is preselected when the session's folder is gone.
			const missingNote = canOpen && folder.kind === 'scratch' && support.sessionFolder && this._sessionFolderMissing.read(reader)
				? localize('nestedChat.folder.sessionFolderMissing', "The session's folder {0} no longer exists.", this._labelService.getUriBasenameLabel(support.sessionFolder))
				: undefined;
			if (canOpen) {
				tooltip = missingNote ? localize('nestedChat.folder.titleWithNote', "{0}. {1}", label, missingNote) : label;
				trigger.setAttribute('role', 'button');
				trigger.setAttribute('aria-haspopup', 'listbox');
				trigger.setAttribute('aria-expanded', String(this._isOpen));
				trigger.setAttribute('aria-label', localize('nestedChat.folder.ariaLabel', "Pick Folder for the Nested Session, {0}", label));
			} else {
				// The only choice: plain text rather than a control, read with its visible label.
				const staticLabel = localize('nestedChat.folder.staticAriaLabel', "Folder for the Nested Session, {0}", label);
				tooltip = staticLabel;
				trigger.setAttribute('role', 'note');
				trigger.setAttribute('aria-label', staticLabel);
				trigger.removeAttribute('aria-haspopup');
				trigger.removeAttribute('aria-expanded');
			}
			if (missingNote) {
				trigger.setAttribute('aria-description', missingNote);
			} else {
				trigger.removeAttribute('aria-description');
			}
			slot.classList.toggle('disabled', !canOpen);
		}));
	}

	/** Elements the chat pet can stand on, like the New Session workspace picker. */
	getChatPetPlatformElements(): readonly HTMLElement[] {
		return this._folderTrigger && this._folderSlot?.hidden === false ? [this._folderTrigger] : [];
	}

	/**
	 * Renders the isolation and branch pickers into the composer's repository controls, which the
	 * composer places like the New Session ones: in the options row or below the input. The isolation
	 * picker is New Session's (Branch or New Worktree); the branch picker only applies to a worktree.
	 */
	renderRepositoryControls(container: HTMLElement, hoverDelegate?: IHoverDelegate): IComposerRepositoryControls {
		const store = new DisposableStore();
		const element = dom.append(container, dom.$('.nested-chat-repository-controls'));
		store.add(toDisposable(() => element.remove()));
		hoverDelegate ??= store.add(createInstantHoverDelegate());

		const isolationPicker = store.add(this._instantiationService.createInstance(IsolationPicker, {
			user: 'NestedChatIsolationPicker',
			hoverDelegate,
			onSelect: isolation => this._setWorktree(isolation === 'worktree'),
		}));
		isolationPicker.render(element);

		const separator = dom.append(element, dom.$('span.nested-chat-repository-separator'));
		separator.setAttribute('aria-hidden', 'true');
		const branchSlot = dom.append(element, dom.$('.nested-chat-branch-picker'));
		const branchPicker = store.add(this._instantiationService.createInstance(BranchPicker, {
			user: 'NestedChatBranchPicker',
			hoverDelegate,
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
			? this._host.describeNoWorkspace().label
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
		const options = getNestedChatFolderOptions(support, this._host.getFolderSources(), this._sessionFolderMissing.get());
		const items: IActionListItem<FolderPickerItem>[] = options.choices.map(choice => ({
			kind: ActionListItemKind.Action,
			...this._describeChoice(support, choice),
			group: { title: '', icon: getNestedChatFolderMark(support, choice, this._host.describeNoWorkspace().icon).icon },
			item: { kind: 'choice', choice, checked: isSameNestedChatFolder(choice, current) },
		}));
		if (options.browseActions.length || options.openFolder) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
		}
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
			getWidgetAriaLabel: () => localize('nestedChat.folderPicker.ariaLabel', "Nested Session Folder Picker"),
		}, WORKSPACE_PICKER_LIST_OPTIONS);
	}

	private _describeChoice(support: INestedChatWorkspaceSupport, choice: NestedChatFolderChoice): INestedChatFolderLabel {
		if (choice.kind === 'scratch') {
			return { label: this._getFolderLabel(choice), description: this._host.describeNoWorkspace().description };
		}
		const described = this._host.describeFolder(choice.folder) ?? {
			label: this._getFolderLabel(choice),
			description: this._labelService.getUriLabel(dirname(choice.folder), { relative: false }),
		};
		const worktreeNote = getNestedChatFolderMark(support, choice, this._host.describeNoWorkspace().icon).worktreeNote;
		return worktreeNote ? { label: described.label, description: worktreeNote } : described;
	}
}

// #endregion
