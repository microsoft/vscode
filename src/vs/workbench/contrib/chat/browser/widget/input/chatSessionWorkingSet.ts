/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { Action, IAction, toAction } from '../../../../../../base/common/actions.js';
import { equals } from '../../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { StringSHA1 } from '../../../../../../base/common/hash.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, IReaderWithStore, ISettableObservable, observableSignal } from '../../../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { isObject } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { WorkbenchButtonBar } from '../../../../../../platform/actions/browser/buttonbar.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { getChatFileChangeLineCounts, renderChangesSummaryFileList } from '../chatContentParts/chatChangesSummaryPart.js';
import { openChatFileChanges } from '../../editorChatResponseFileChangesService.js';

/** Undoes a session's changes to the files of its working set. */
export interface IChatSessionWorkingSetUndo {
	/** Whether changes can be undone now; they can't while a turn is running, for example. */
	readonly enabled: IObservable<boolean>;
	/**
	 * Undoes the session's changes to the files of `diffs` after any confirmation
	 * the session requires, resolving to whether changes to any of them were undone.
	 * A file whose changes no longer match its diff in `diffs` is left alone.
	 */
	undo(diffs: readonly IEditSessionEntryDiff[]): Promise<boolean>;
}

/** What a {@link ChatSessionWorkingSet} can do with the files it lists. */
export interface IChatSessionWorkingSetFileActions {
	/** Keeps the changes to the files of `diffs`, which hides each file until its changes change. */
	keep(diffs: readonly IEditSessionEntryDiff[]): void;
	/** Undoes changes to files, or `undefined` while the session doesn't support that. */
	readonly undo: IObservable<IChatSessionWorkingSetUndo | undefined>;
}

const VIEW_ALL_EDITS_ACTION_ID = 'chat.sessionWorkingSet.viewAll';

export class ChatSessionWorkingSet extends Disposable {
	readonly domNode = dom.$('.chat-editing-session-container.chat-session-working-set');
	readonly onDidFocus: Event<void>;

	constructor(
		diffs: IObservable<readonly IEditSessionEntryDiff[]>,
		collapsed: ISettableObservable<boolean>,
		fileActions: IChatSessionWorkingSetFileActions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAccessibilitySignalService accessibilitySignalService: IAccessibilitySignalService,
	) {
		super();
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.domNode));
		ChatContextKeys.inChatSessionWorkingSet.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		this.onDidFocus = this._register(dom.trackFocus(this.domNode)).onDidFocus;

		const keep = (keptDiffs: readonly IEditSessionEntryDiff[]) => {
			fileActions.keep(keptDiffs);
			accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
		};
		const undo = async (sessionUndo: IChatSessionWorkingSetUndo, undoneDiffs: readonly IEditSessionEntryDiff[]) => {
			if (await sessionUndo.undo(undoneDiffs)) {
				accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
			}
		};

		const overview = dom.append(this.domNode, dom.$('.chat-editing-session-overview'));
		const title = dom.append(overview, dom.$('.working-set-title'));
		const button = this._register(new ButtonWithIcon(title, { secondary: true, supportIcons: true }));
		const counts = dom.append(button.element, dom.$('.working-set-line-counts', { 'aria-hidden': 'true' }));
		const addedLabel = dom.append(counts, dom.$('.working-set-lines-added'));
		const removedLabel = dom.append(counts, dom.$('.working-set-lines-removed'));
		const actionsContainer = dom.append(overview, dom.$('.chat-editing-session-actions'));
		const listContainer = dom.append(this.domNode, dom.$('.chat-editing-session-list'));

		// Like the editing session's working set, Keep leads and View All Edits is an icon.
		const buttonBar = this._register(scopedInstantiationService.createInstance(WorkbenchButtonBar, actionsContainer, {
			small: true,
			buttonConfigProvider: action => action.id === VIEW_ALL_EDITS_ACTION_ID ? { showIcon: true, showLabel: false, isSecondary: true } : undefined,
		}));
		this._register(autorun(reader => {
			const sessionUndo = fileActions.undo.read(reader);
			buttonBar.update([
				toAction({
					id: 'chat.sessionWorkingSet.keepAll',
					label: localize('chat.sessionWorkingSet.keep', "Keep"),
					tooltip: localize('chat.sessionWorkingSet.keepAll', "Keep All Edits"),
					run: () => keep(diffs.read(undefined)),
				}),
				...(sessionUndo ? [toAction({
					id: 'chat.sessionWorkingSet.undoAll',
					label: localize('chat.sessionWorkingSet.undo', "Undo"),
					tooltip: localize('chat.sessionWorkingSet.undoAll', "Undo All Edits"),
					run: () => undo(sessionUndo, diffs.read(undefined)),
				})] : []),
				toAction({
					id: VIEW_ALL_EDITS_ACTION_ID,
					label: localize('chat.sessionWorkingSet.viewAll', "View All Edits"),
					class: ThemeIcon.asClassName(Codicon.diffMultiple),
					run: () => openChatFileChanges(editorService, localize('chat.sessionWorkingSet.changesEditor', "Session Changes"), diffs.read(undefined)),
				}),
			], []);
			if (sessionUndo) {
				// Updating the button in place keeps keyboard focus on it.
				const undoButton = buttonBar.buttons[1];
				reader.store.add(autorun(enabledReader => {
					undoButton.enabled = sessionUndo.enabled.read(enabledReader);
				}));
			}
		}));

		this._register(renderChangesSummaryFileList(listContainer, diffs, scopedInstantiationService, editorService, configurationService, {
			alwaysOpenInDiffEditor: true,
			ariaLabel: localize('chat.sessionWorkingSet.list', "Session changes"),
			rowActionIcons: true,
			getRowActions: (diff, reader) => getFileActions(diff, fileActions, keep, undo, reader),
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
			const changes = diffs.read(reader);
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
}

/** Returns the Keep and, when the session supports it, Undo actions of a file's row. */
function getFileActions(
	diff: IEditSessionEntryDiff,
	fileActions: IChatSessionWorkingSetFileActions,
	keep: (diffs: readonly IEditSessionEntryDiff[]) => void,
	undo: (sessionUndo: IChatSessionWorkingSetUndo, diffs: readonly IEditSessionEntryDiff[]) => Promise<void>,
	reader: IReaderWithStore,
): IAction[] {
	const keepAction = toAction({
		id: 'chat.sessionWorkingSet.keepFile',
		label: localize('chat.sessionWorkingSet.keepFile', "Keep"),
		class: ThemeIcon.asClassName(Codicon.check),
		run: () => keep([diff]),
	});
	const sessionUndo = fileActions.undo.read(reader);
	if (!sessionUndo) {
		return [keepAction];
	}
	const undoAction = reader.store.add(new Action('chat.sessionWorkingSet.undoFile', localize('chat.sessionWorkingSet.undoFile', "Undo"), ThemeIcon.asClassName(Codicon.discard), false, () => undo(sessionUndo, [diff])));
	// Updating the action in place keeps keyboard focus on it.
	reader.store.add(autorun(enabledReader => {
		undoAction.enabled = sessionUndo.enabled.read(enabledReader);
	}));
	return [keepAction, undoAction];
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
