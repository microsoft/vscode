/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { Separator, toAction } from '../../../../../../base/common/actions.js';
import { equals } from '../../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { StringSHA1 } from '../../../../../../base/common/hash.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, ISettableObservable, observableSignal, observableSignalFromEvent } from '../../../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { isObject } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { WorkbenchButtonBar } from '../../../../../../platform/actions/browser/buttonbar.js';
import { getActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { chatEditingWidgetFileStateContextKey, IEditSessionEntryDiff, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { IChatSessionReviewPreferencesService } from '../../../common/editing/chatSessionReviewPreferences.js';
import { getChatFileChangeLineCounts, IChangesSummaryFileList, openChatFileChangeDiff, renderChangesSummaryFileList } from '../chatContentParts/chatChangesSummaryPart.js';
import { openChatFileChanges } from '../../editorChatResponseFileChangesService.js';

/** Undoes a session's changes to the files of its working set. */
export interface IChatSessionWorkingSetUndo {
	/** Whether changes can be undone now; they can't while a turn is running, for example. */
	readonly enabled: IObservable<boolean>;
	/**
	 * Undoes the session's changes to the files of `diffs` after any confirmation
	 * the session requires, resolving to whether changes to any of them were undone.
	 * A file whose changes no longer match its diff in `diffs` is left alone.
	 * `all` is set when the user undoes every file of the working set at once,
	 * which, like Undo All Edits in the editing session's working set, may need
	 * confirming where undoing a single file doesn't.
	 */
	undo(diffs: readonly IEditSessionEntryDiff[], all: boolean): Promise<boolean>;
}

/** Keeps a session's changes to the files of its working set in the session, which then leaves them out of the working set. */
export interface IChatSessionWorkingSetKeep {
	/** Whether changes can be kept now; they can't while a turn is running, for example. */
	readonly enabled: IObservable<boolean>;
	/**
	 * Keeps the session's changes to the files of `diffs`, resolving to whether
	 * changes to any of them were kept. A file whose changes no longer match its
	 * diff in `diffs` is left alone. `automatic` is set when the changes were
	 * accepted outside of the working set, as by staging them with Git, which
	 * isn't confirmed, and waits for a Keep in progress instead of being dropped.
	 */
	keep(diffs: readonly IEditSessionEntryDiff[], automatic: boolean): Promise<boolean>;
}

/** What a {@link ChatSessionWorkingSet} can do with the files it lists. */
export interface IChatSessionWorkingSetFileActions {
	/**
	 * Keeps the changes to the files of `diffs`, resolving to whether any changes
	 * were kept, `automatic` as in {@link IChatSessionWorkingSetKeep.keep}.
	 */
	keep(diffs: readonly IEditSessionEntryDiff[], automatic: boolean): Promise<boolean>;
	/** Whether changes can be kept now; always when absent. */
	readonly keepEnabled?: IObservable<boolean>;
	/** Undoes changes to files, or `undefined` while the session doesn't support that. */
	readonly undo: IObservable<IChatSessionWorkingSetUndo | undefined>;
}

const VIEW_ALL_EDITS_ACTION_ID = 'chat.sessionWorkingSet.viewAll';

/**
 * Lists a session's changes that haven't been kept, like the editing session's
 * working set. Each file's row shows the actions of
 * {@link MenuId.ChatEditingWidgetModifiedFilesToolbar}, the editing session's
 * working set menu, whose commands run on the working set through
 * {@link keepFiles}, {@link undoFiles} and {@link openFileChanges}.
 */
export class ChatSessionWorkingSet extends Disposable {
	readonly domNode = dom.$('.chat-editing-session-container.chat-session-working-set');
	readonly onDidFocus: Event<void>;

	private readonly _fileList: IChangesSummaryFileList;

	constructor(
		private readonly _diffs: IObservable<readonly IEditSessionEntryDiff[]>,
		collapsed: ISettableObservable<boolean>,
		private readonly _fileActions: IChatSessionWorkingSetFileActions,
		focusInput: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IMenuService menuService: IMenuService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IChatSessionReviewPreferencesService private readonly _reviewPreferences: IChatSessionReviewPreferencesService,
	) {
		super();
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.domNode));
		ChatContextKeys.inChatSessionWorkingSet.bindTo(scopedContextKeyService).set(true);
		// Every listed file has changes to keep or undo, like the modified files of the editing session's working set.
		chatEditingWidgetFileStateContextKey.bindTo(scopedContextKeyService).set(ModifiedFileEntryState.Modified);
		const keepEnabledKey = ChatContextKeys.sessionWorkingSetKeepEnabled.bindTo(scopedContextKeyService);
		const reviewEnabledKey = ChatContextKeys.sessionWorkingSetReviewEnabled.bindTo(scopedContextKeyService);
		const hasUndoKey = ChatContextKeys.sessionWorkingSetHasUndo.bindTo(scopedContextKeyService);
		const undoEnabledKey = ChatContextKeys.sessionWorkingSetUndoEnabled.bindTo(scopedContextKeyService);
		this._register(autorun(reader => {
			const keepEnabled = this._isKeepEnabled(reader);
			const sessionUndo = this._fileActions.undo.read(reader);
			const undoEnabled = !!sessionUndo?.enabled.read(reader);
			scopedContextKeyService.bufferChangeEvents(() => {
				keepEnabledKey.set(keepEnabled);
				reviewEnabledKey.set(this._reviewPreferences.keepUndoEnabled.read(reader));
				hasUndoKey.set(!!sessionUndo);
				undoEnabledKey.set(undoEnabled && this._reviewPreferences.keepUndoEnabled.read(reader));
			});
		}));
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		this.onDidFocus = this._register(dom.trackFocus(this.domNode)).onDidFocus;

		const overview = dom.append(this.domNode, dom.$('.chat-editing-session-overview'));
		const title = dom.append(overview, dom.$('.working-set-title'));
		const button = this._register(new ButtonWithIcon(title, { secondary: true, supportIcons: true }));
		const counts = dom.append(button.element, dom.$('.working-set-line-counts', { 'aria-hidden': 'true' }));
		const addedLabel = dom.append(counts, dom.$('.working-set-lines-added'));
		const removedLabel = dom.append(counts, dom.$('.working-set-lines-removed'));
		const actionsContainer = dom.append(overview, dom.$('.chat-editing-session-actions'));
		const listContainer = dom.append(this.domNode, dom.$('.chat-editing-session-list'));

		const showContextMenu = (anchor: HTMLElement | StandardMouseEvent) => {
			const previousFocus = dom.getActiveElement();
			contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => [
					toAction({
						id: 'chat.sessionWorkingSet.toggleKeepUndo',
						label: localize('chat.sessionWorkingSet.keepUndo', "Keep and Undo"),
						checked: this.keepUndoEnabled,
						run: () => this._reviewPreferences.setKeepUndoEnabled(!this.keepUndoEnabled),
					}),
					new Separator(),
					toAction({
						id: 'chat.sessionWorkingSet.showPill',
						label: localize('chat.sessionWorkingSet.showPill', "Show Pill"),
						run: async () => {
							await configurationService.updateValue(ChatConfiguration.EditorWorkingSetEnabled, false);
							focusInput();
						},
					}),
				],
				onHide: () => {
					if (dom.isHTMLElement(previousFocus) && previousFocus.isConnected) {
						previousFocus.focus();
					} else if (this.domNode.isConnected) {
						button.focus();
					} else {
						focusInput();
					}
				},
			});
		};
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, event => {
			dom.EventHelper.stop(event, true);
			showContextMenu(new StandardMouseEvent(dom.getWindow(this.domNode), event));
		}, true));
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyMod.Shift | KeyCode.F10) || keyboardEvent.equals(KeyCode.ContextMenu)) {
				dom.EventHelper.stop(event, true);
				const focused = dom.getActiveElement();
				showContextMenu(dom.isHTMLElement(focused) ? focused : button.element);
			}
		}, true));

		// Like the editing session's working set, Keep leads and View All Edits is an icon.
		const buttonBar = this._register(scopedInstantiationService.createInstance(WorkbenchButtonBar, actionsContainer, {
			small: true,
			buttonConfigProvider: action => action.id === VIEW_ALL_EDITS_ACTION_ID ? { showIcon: true, showLabel: false, isSecondary: true } : undefined,
		}));
		this._register(autorun(reader => {
			const keepUndoEnabled = this._reviewPreferences.keepUndoEnabled.read(reader);
			const sessionUndo = this._fileActions.undo.read(reader);
			const hadFocus = dom.isAncestorOfActiveElement(actionsContainer);
			buttonBar.update([
				...(keepUndoEnabled ? [toAction({
					id: 'chat.sessionWorkingSet.keepAll',
					label: localize('chat.sessionWorkingSet.keep', "Keep"),
					tooltip: localize('chat.sessionWorkingSet.keepAll', "Keep All Edits"),
					run: () => this._keep(this._diffs.read(undefined), false),
				})] : []),
				...(keepUndoEnabled && sessionUndo ? [toAction({
					id: 'chat.sessionWorkingSet.undoAll',
					label: localize('chat.sessionWorkingSet.undo', "Undo"),
					tooltip: localize('chat.sessionWorkingSet.undoAll', "Undo All Edits"),
					run: () => this._undo(sessionUndo, this._diffs.read(undefined), true),
				})] : []),
				toAction({
					id: VIEW_ALL_EDITS_ACTION_ID,
					label: localize('chat.sessionWorkingSet.viewAll', "View All Edits"),
					class: ThemeIcon.asClassName(Codicon.diffMultiple),
					run: () => openChatFileChanges(this._editorService, localize('chat.sessionWorkingSet.changesEditor', "Session Changes"), this._diffs.read(undefined)),
				}),
			], []);
			if (hadFocus) {
				button.focus();
			}
			if (keepUndoEnabled && sessionUndo) {
				// Updating the button in place keeps keyboard focus on it.
				const undoButton = buttonBar.buttons[1];
				reader.store.add(autorun(enabledReader => {
					undoButton.enabled = sessionUndo.enabled.read(enabledReader);
				}));
			}
			const keepEnabled = this._fileActions.keepEnabled;
			if (keepUndoEnabled && keepEnabled) {
				const keepButton = buttonBar.buttons[0];
				reader.store.add(autorun(enabledReader => {
					keepButton.enabled = keepEnabled.read(enabledReader);
				}));
			}
		}));

		// Like the editing session's working set, each row shows its modified files menu, run on the row's file.
		// Its Keep and Undo follow the context keys above, so the rows update once the menu reports the change.
		const fileMenu = this._register(menuService.createMenu(MenuId.ChatEditingWidgetModifiedFilesToolbar, scopedContextKeyService, { eventDebounceDelay: 0 }));
		const fileMenuChanged = observableSignalFromEvent(this, fileMenu.onDidChange);
		this._fileList = this._register(renderChangesSummaryFileList(listContainer, this._diffs, scopedInstantiationService, this._editorService, configurationService, {
			openFile: true,
			ariaLabel: localize('chat.sessionWorkingSet.list', "Session changes"),
			rowActionIcons: true,
			getRowActions: (diff, reader) => {
				fileMenuChanged.read(reader);
				// Clicking an action doesn't move focus to its chat, so the commands are told which working set to run on.
				return getActionBarActions(fileMenu.getActions({ args: [diff.modifiedURI, this] }), 'navigation').primary;
			},
		}));
		this._register(button.onDidClick(() => collapsed.set(!collapsed.get(), undefined)));
		this._register(autorun(reader => {
			const isCollapsed = collapsed.read(reader);
			button.icon = isCollapsed ? Codicon.chevronRightCompact : Codicon.chevronDownCompact;
			button.element.setAttribute('aria-expanded', String(!isCollapsed));
			if (isCollapsed && dom.isAncestorOfActiveElement(listContainer)) {
				button.focus();
			}
			listContainer.classList.toggle('collapsed', isCollapsed);
		}));
		this._register(autorun(reader => {
			const changes = this._diffs.read(reader);
			const label = changes.length === 1
				? localize('chat.sessionWorkingSet.oneFile', "1 file changed")
				: localize('chat.sessionWorkingSet.manyFiles', "{0} files changed", changes.length);
			const added = changes.reduce((total, diff) => total + diff.added, 0);
			const removed = changes.reduce((total, diff) => total + diff.removed, 0);
			button.label = label;
			button.element.setAttribute('aria-label', localize('chat.sessionWorkingSet.summary', "Session changes, {0}, {1}", label, getChatFileChangeLineCounts(added, removed)));
			addedLabel.textContent = `+${added}`;
			removedLabel.textContent = `-${removed}`;
		}));
	}

	get keepUndoEnabled(): boolean {
		return this._reviewPreferences.keepUndoEnabled.get();
	}

	/** The files of the selected rows. */
	get selectedResources(): URI[] {
		return this._fileList.getSelectedElements().map(diff => diff.modifiedURI);
	}

	/** Whether the working set lists changes to `resource`. */
	includes(resource: URI): boolean {
		return this._getDiffs([resource]).length > 0;
	}

	/** Keeps the changes to the listed files of `resources`, like Keep on their rows, unless they can't be kept now. */
	async keepFiles(resources: readonly URI[]): Promise<void> {
		const diffs = this._getDiffs(resources);
		if (diffs.length > 0 && this._isKeepEnabled(undefined)) {
			await this._keep(diffs, false);
		}
	}

	/**
	 * Keeps the changes to the listed files of `resources` that were accepted
	 * outside of the working set, as by staging them with Git. Unlike
	 * {@link keepFiles}, a Keep in progress doesn't drop them; the session
	 * decides whether it can keep them.
	 */
	async keepAcceptedFiles(resources: readonly URI[]): Promise<void> {
		const diffs = this._getDiffs(resources);
		if (diffs.length > 0) {
			await this._keep(diffs, true);
		}
	}

	/** Undoes the changes to the listed files of `resources`, like Undo on their rows, unless the session can't undo them now. */
	async undoFiles(resources: readonly URI[]): Promise<void> {
		const sessionUndo = this._fileActions.undo.get();
		const diffs = this._getDiffs(resources);
		if (this.keepUndoEnabled && sessionUndo?.enabled.get() && diffs.length > 0) {
			await this._undo(sessionUndo, diffs, false);
		}
	}

	/** Opens the diffs of the changes to the listed files of `resources`. */
	openFileChanges(resources: readonly URI[]): void {
		for (const diff of this._getDiffs(resources)) {
			openChatFileChangeDiff(this._editorService, diff);
		}
	}

	private _getDiffs(resources: readonly URI[]): IEditSessionEntryDiff[] {
		const diffs = this._diffs.get();
		return diffs.filter(diff => resources.some(resource => isEqual(resource, diff.modifiedURI)));
	}

	private _isKeepEnabled(reader: IReader | undefined): boolean {
		return this._reviewPreferences.keepUndoEnabled.read(reader) && (this._fileActions.keepEnabled?.read(reader) ?? true);
	}

	private async _keep(diffs: readonly IEditSessionEntryDiff[], automatic: boolean): Promise<void> {
		if (!automatic && !this._isKeepEnabled(undefined)) {
			return;
		}
		if (await this._fileActions.keep(diffs, automatic)) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
		}
	}

	private async _undo(sessionUndo: IChatSessionWorkingSetUndo, diffs: readonly IEditSessionEntryDiff[], all: boolean): Promise<void> {
		if (!this.keepUndoEnabled || !sessionUndo.enabled.get()) {
			return;
		}
		if (await sessionUndo.undo(diffs, all)) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
		}
	}
}

const KEPT_CHANGES_STORAGE_KEY = 'chat.sessionWorkingSet.keptChanges';

/** How many sessions remember their kept changes; the one kept in least recently is forgotten first. */
const MAX_SESSIONS_WITH_KEPT_CHANGES = 100;

/** Each session's kept change by file, all as digests, with the session kept in most recently last. */
type KeptChanges = readonly (readonly [session: string, changes: Readonly<Record<string, string>>])[];

function isKeptSessionChanges(value: unknown): value is KeptChanges[number] {
	return Array.isArray(value)
		&& value.length === 2
		&& typeof value[0] === 'string'
		&& isObject(value[1])
		&& Object.values(value[1]).every(change => typeof change === 'string');
}

function readKeptChanges(value: string | undefined): KeptChanges {
	if (!value) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter(isKeptSessionChanges) : [];
	} catch {
		return [];
	}
}

/** A short, collision-resistant digest of `parts`, which identifies them in storage. */
function digest(parts: readonly (string | number | boolean)[]): string {
	const sha = new StringSHA1();
	sha.update(JSON.stringify(parts));
	return sha.digest();
}

function getSessionKey(session: URI): string {
	return digest([session.toString()]);
}

function getFileKey(diff: IEditSessionEntryDiff): string {
	return digest([getComparisonKey(diff.modifiedURI)]);
}

/** The parts of a file's change that differ once the file changes again. A deletion has no snapshot after it, so deleting a file again matches its earlier deletion. */
function getChangeParts(diff: IEditSessionEntryDiff): readonly (string | number | boolean)[] {
	return [
		diff.originalURI.toString(),
		diff.modifiedSnapshotURI?.toString() ?? '',
		diff.added,
		diff.removed,
		!!diff.isCreated,
		!!diff.isDeleted,
	];
}

/** Identifies a file's change by its snapshots and counts, which differ once the file changes again. */
function getChangeKey(diff: IEditSessionEntryDiff): string {
	return digest(getChangeParts(diff));
}

/** Whether `a` and `b` are the same change to the same file. */
export function isSameSessionFileChange(a: IEditSessionEntryDiff, b: IEditSessionEntryDiff): boolean {
	return isEqual(a.modifiedURI, b.modifiedURI) && equals(getChangeParts(a), getChangeParts(b));
}

/**
 * Remembers the changes kept in each session's working set, so a kept file
 * stays hidden until its changes differ from the ones that were kept.
 */
export class ChatSessionWorkingSetKeptChanges extends Disposable {

	private _keptChanges: KeptChanges | undefined;
	private readonly _onDidChange = observableSignal(this);

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, KEPT_CHANGES_STORAGE_KEY, this._store)(() => {
			this._keptChanges = undefined;
			this._onDidChange.trigger(undefined);
		}));
	}

	/** Returns the changes of `diffs` that weren't kept in `session`. */
	filter(session: URI, diffs: readonly IEditSessionEntryDiff[], reader: IReader | undefined): readonly IEditSessionEntryDiff[] {
		this._onDidChange.read(reader);
		const sessionKey = getSessionKey(session);
		const keptChanges = this._read().find(([key]) => key === sessionKey)?.[1];
		return keptChanges ? diffs.filter(diff => keptChanges[getFileKey(diff)] !== getChangeKey(diff)) : diffs;
	}

	/** Keeps the changes of `diffs` in `session`. */
	keep(session: URI, diffs: readonly IEditSessionEntryDiff[]): void {
		const sessionKey = getSessionKey(session);
		const keptChanges = this._read();
		const sessionChanges: Record<string, string> = { ...keptChanges.find(([key]) => key === sessionKey)?.[1] };
		for (const diff of diffs) {
			sessionChanges[getFileKey(diff)] = getChangeKey(diff);
		}
		const updated: KeptChanges = [...keptChanges.filter(([key]) => key !== sessionKey), [sessionKey, sessionChanges]];
		this._storageService.store(KEPT_CHANGES_STORAGE_KEY, JSON.stringify(updated.slice(-MAX_SESSIONS_WITH_KEPT_CHANGES)), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _read(): KeptChanges {
		this._keptChanges ??= readKeptChanges(this._storageService.get(KEPT_CHANGES_STORAGE_KEY, StorageScope.PROFILE));
		return this._keptChanges;
	}
}
