/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { GroupModelChangeKind } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkingCopyBackupService } from '../../../services/workingCopy/common/workingCopyBackup.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';

export const FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY = 'folderLocation.workingSets';
export const FOLDER_LOCATION_MAX_WORKING_SETS = 20;

/** Marks the working sets owned by this contribution, so that unreferenced ones can be told apart from others. */
export const FOLDER_LOCATION_WORKING_SET_NAME_PREFIX = 'folderLocation:';

interface IStoredWorkingSets {
	readonly version: 1;

	/** The location whose editors are in the editor area. */
	readonly owner?: string;

	/** The editor area may only partially hold the editors of the owner, whose saved working set is authoritative. */
	readonly partial?: boolean;
	readonly entries: readonly { readonly key: string; readonly workingSet: IEditorWorkingSet }[];
}

/**
 * Keeps one working set of open editors per location of the workspace folder:
 * when the folder switches location, the editors of the location being left are
 * saved and the ones of the location being entered are restored. A location that
 * is visited for the first time starts with no editors.
 *
 * The location that owns the editor area is persisted, so that a window that starts at
 * another location than the one it was closed at (for example because the alternate
 * location is gone) swaps the editors of the last session out.
 */
export class FolderLocationWorkingSetsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.folderLocationWorkingSets';

	private readonly sequencer = new Sequencer();

	/** Ordered from least to most recently saved. */
	private workingSets: { key: string; workingSet: IEditorWorkingSet }[];

	/** The location whose editors are in the editor area. Only changes once they were applied. */
	private owner: string | undefined;

	/**
	 * Set from right before an apply starts until one succeeds: applying can close editors before it
	 * fails or while it is pending, so the editor area is no longer a faithful copy of the owner's editors.
	 * The saved working set of the owner is kept as is until an apply succeeds.
	 */
	private partial: boolean;

	private disposed = false;

	/** Set while a switch waits for the backups of editors it would close to be restored. */
	private deferred = false;

	/** Counts the changes of dirty state of working copies and editors and unregistrations of working copies, which can make a deferred switch possible. */
	private workingCopyGeneration = 0;

	constructor(
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IEditorService editorService: IEditorService
	) {
		super();

		this._register(toDisposable(() => this.disposed = true));

		const stored = this.load();
		this.workingSets = stored.entries;
		this.owner = stored.owner ?? this.getCurrentKey();
		this.partial = stored.partial;
		this.deleteOrphans();

		this._register(this.folderLocationService.onDidChangeLocation(() => this.reconcile()));

		// A restored backup makes its editor dirty, and an unregistered working copy discards its backup
		// An editor can change whether it closes without its working copy changing, for example when a save fails
		const onDidChangeEditorDirty = Event.filter(editorService.onDidEditorsChange, e => e.event.kind === GroupModelChangeKind.EDITOR_DIRTY);
		this._register(Event.any<unknown>(this.workingCopyService.onDidChangeDirty, this.workingCopyService.onDidUnregister, onDidChangeEditorDirty)(() => {
			this.workingCopyGeneration++;
			if (this.deferred) {
				this.reconcile();
			}
		}));
		this.reconcile();
	}

	/** The folder whose location is tracked: only the folder of a workspace that supports locations. */
	private getFolder(): IWorkspaceFolder | undefined {
		const folder = this.contextService.getWorkspace().folders.at(0);
		return folder && this.folderLocationService.canSetLocation(folder) ? folder : undefined;
	}

	private getCurrentKey(): string | undefined {
		const folder = this.getFolder();
		return folder ? this.toKey(folder.uri) : undefined;
	}

	private toKey(uri: URI): string {
		return this.uriIdentityService.extUri.getComparisonKey(uri);
	}

	/** Makes the editor area hold the editors of the current location. */
	private reconcile(): void {
		// Always queue: the owner can still change while an earlier apply is pending, so
		// whether anything is left to do is decided once the earlier work has settled.
		this.sequencer.queue(async () => {
			this.deferred = false;

			// Restored editors, for example untitled ones whose backup is still being restored, must not be closed
			await this.editorGroupsService.whenRestored;

			// Outside of a workspace that supports locations nothing is switched or saved, and the stored data is kept
			const entering = this.getCurrentKey();
			if (this.disposed || !this.owner || !entering || (this.owner === entering && !this.partial)) {
				return;
			}

			// Closing an input whose backup is not restored yet discards the backup, and closing a side by side editor disposes
			// its dirty sides: retried once inputs change their dirty state. A change that comes in while the backups are
			// queried could be missed by them, so it checks again right away.
			const generation = this.workingCopyGeneration;
			this.deferred = await this.wouldCloseUnsavedInputs();
			if (this.deferred || this.disposed) {
				if (this.deferred && generation !== this.workingCopyGeneration) {
					this.reconcile();
				} else if (this.deferred) {
					this.logService.info('[folderLocation] Deferring the switch of the editors until their backups are restored and the dirty sides of closing side by side editors are saved');
				}
				return;
			}

			await this.switchWorkingSet(this.owner, entering);
		}).catch(error => this.logService.error('[folderLocation] Failed to switch the editors', error));
	}

	/**
	 * Whether applying a working set would dispose unsaved content: an input that has a backup that is not
	 * restored yet, or a dirty side of a side by side editor that closes because its primary side is not dirty or is saving.
	 * A backup only exists for unsaved content and a restored one makes its input dirty: so a backup of an
	 * input that is not dirty is not restored yet, also when its working copy is already registered.
	 * A backup whose input never restores, or a dirty side that is never saved, keeps the switch deferred.
	 */
	private async wouldCloseUnsavedInputs(): Promise<boolean> {
		if (this.getClosingInputs().length === 0) {
			return false;
		}

		const backups = await this.workingCopyBackupService.getBackups();

		// The editors are only looked at once the backups are known, so that they are current
		return this.getClosingInputs().some(({ input, side }) => input.isDirty()
			? side
			: backups.some(backup => this.uriIdentityService.extUri.isEqual(input.resource, backup.resource)));
	}

	/**
	 * The inputs that applying a working set disposes: the editors that close without confirmation
	 * (that are not dirty, or are dirty and saving) and, for side by side editors, all of their sides,
	 * also the dirty ones, because closing the editor disposes them.
	 */
	private getClosingInputs(): { input: EditorInput; side: boolean }[] {
		const inputs: { input: EditorInput; side: boolean }[] = [];
		const add = (input: EditorInput, side: boolean) => {
			inputs.push({ input, side });
			if (input instanceof SideBySideEditorInput) {
				add(input.primary, true);
				add(input.secondary, true);
			}
		};
		for (const part of this.editorGroupsService.parts) {
			if (part.isTransient) {
				continue;
			}
			for (const group of part.groups) {
				for (const editor of group.editors) {
					if (!editor.isDirty() || editor.isSaving()) {
						add(editor, false);
					}
				}
			}
		}
		return inputs;
	}

	private async switchWorkingSet(leaving: string, entering: string): Promise<void> {

		// Save the editors of the location being left. Nothing is saved for an empty editor
		// area so that the location restores to what it had before the editors were closed.
		// The editors of the main part and of the windows that are part of working sets count.
		// The editor area is not saved over the working set of an owner it only partially holds.
		if (!this.partial && this.editorGroupsService.parts.some(part => !part.isTransient && part.groups.some(group => group.count > 0))) {
			this.save(leaving, entering);
		}

		// Apply the editors of the location being entered. The location only owns the editor
		// area once that worked. When its saved working set cannot be applied, the editors of the
		// location being left (already saved above) must not stay open: they belong to another
		// location. The entering location then starts empty. Its saved set is kept, because
		// the failure can be transient: it is replaced when the location is left with editors open.
		const target = this.workingSets.find(entry => entry.key === entering);
		if (this.disposed) {
			return;
		}

		// Applying replaces the editors before it settles: until it succeeded, the saved working set
		// of the owner stays authoritative, also for a window that restarts meanwhile.
		if (!this.partial) {
			this.partial = true;
			this.store();
		}
		if (target && await this.tryApply(target.workingSet)) {
			this.owner = entering;
			this.partial = false;
			this.store();
			return;
		}
		if (leaving !== entering && await this.tryApply('empty')) {
			this.owner = entering;
			this.partial = false;
			this.store();
		}
	}

	private async tryApply(workingSet: IEditorWorkingSet | 'empty'): Promise<boolean> {
		try {
			if (await this.editorGroupsService.applyWorkingSet(workingSet, { preserveFocus: true })) {
				return true;
			}
			this.logService.error('[folderLocation] The working set could not be applied');
		} catch (error) {
			this.logService.error('[folderLocation] Failed to apply the working set', error);
		}
		return false;
	}

	private save(key: string, protectedKey: string): void {
		const previous = this.workingSets.find(entry => entry.key === key);
		const workingSet = this.editorGroupsService.saveWorkingSet(FOLDER_LOCATION_WORKING_SET_NAME_PREFIX + key);

		this.workingSets = this.workingSets.filter(entry => entry !== previous);
		this.workingSets.push({ key, workingSet });
		if (previous) {
			this.editorGroupsService.deleteWorkingSet(previous.workingSet);
		}

		// The location being entered is about to be restored, so it is the last to be evicted
		while (this.workingSets.length > FOLDER_LOCATION_MAX_WORKING_SETS) {
			const index = this.workingSets.findIndex(entry => entry.key !== protectedKey);
			const [evicted] = this.workingSets.splice(index, 1);
			this.editorGroupsService.deleteWorkingSet(evicted.workingSet);
		}

		this.store();
	}

	/** Deletes the working sets that were saved but never made it into the stored mapping, for example because of a crash. */
	private deleteOrphans(): void {
		const referenced = new Set(this.workingSets.map(entry => entry.workingSet.id));
		for (const workingSet of this.editorGroupsService.getWorkingSets()) {
			if (workingSet.name.startsWith(FOLDER_LOCATION_WORKING_SET_NAME_PREFIX) && !referenced.has(workingSet.id)) {
				this.editorGroupsService.deleteWorkingSet(workingSet);
			}
		}
	}

	private load(): { owner: string | undefined; partial: boolean; entries: { key: string; workingSet: IEditorWorkingSet }[] } {
		const raw = this.storageService.get(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return { owner: undefined, partial: false, entries: [] };
		}

		let stored: IStoredWorkingSets | undefined;
		try {
			stored = JSON.parse(raw);
		} catch {
			return { owner: undefined, partial: false, entries: [] };
		}
		if (stored?.version !== 1 || !Array.isArray(stored.entries)) {
			return { owner: undefined, partial: false, entries: [] };
		}

		// Drop handles whose editor state no longer exists. Keys are normalized, so that a location
		// stored with another casing of its path is the same location. The most recently saved wins.
		const existing = new Set(this.editorGroupsService.getWorkingSets().map(workingSet => workingSet.id));
		const entries = new Map<string, { key: string; workingSet: IEditorWorkingSet }>();
		for (const entry of stored.entries) {
			const key = typeof entry.key === 'string' ? this.normalizeKey(entry.key) : undefined;
			if (key && existing.has(entry.workingSet?.id)) {
				entries.delete(key);
				entries.set(key, { key, workingSet: entry.workingSet });
			}
		}
		return {
			owner: typeof stored.owner === 'string' ? this.normalizeKey(stored.owner) : undefined,
			partial: stored.partial === true,
			entries: [...entries.values()].slice(-FOLDER_LOCATION_MAX_WORKING_SETS)
		};
	}

	private normalizeKey(key: string): string | undefined {
		try {
			return this.toKey(URI.parse(key, true));
		} catch {
			return undefined;
		}
	}

	private store(): void {
		const stored: IStoredWorkingSets = { version: 1, owner: this.owner, partial: this.partial || undefined, entries: this.workingSets };
		this.storageService.store(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
