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
import { IAgenticModeService } from '../../../services/agenticMode/common/agenticMode.js';
import { IEditableWorkspaceContextService } from '../../../services/configuration/common/configuration.js';
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

	/** The editors the window had when it entered Agentic Mode, until they are restored after it left the mode. */
	readonly window?: IEditorWorkingSet | 'empty';
}

const WINDOW_WORKING_SET_NAME = FOLDER_LOCATION_WORKING_SET_NAME_PREFIX + 'window';

/** The location of the editors of Agentic Mode while it has no folder mounted. */
const AGENTIC_MODE_WITHOUT_FOLDER = URI.from({ scheme: 'vscode-agentic-mode', path: '/no-folder' });

/**
 * Keeps one working set of open editors per location of the workspace folder:
 * when the folder switches location, the editors of the location being left are
 * saved and the ones of the location being entered are restored. A location that
 * is visited for the first time starts with no editors.
 *
 * The location that owns the editor area is persisted, so that a window that starts at
 * another location than the one it was closed at (for example because the alternate
 * location is gone) swaps the editors of the last session out.
 *
 * In Agentic Mode the window's single mounted folder is tracked the same way: moving it to another
 * location of it, such as a worktree of its repository, swaps the editors. Entering the mode, mounting a
 * folder, and replacing it with a folder of another repository switch nothing: the location then takes over
 * the editors that are open. Changes are looked at once they settled: when the window enters the mode,
 * mounts a folder and moves it before the editors are reconciled, the location it moved to takes over the editors too.
 * The editors the window had when it entered the mode are saved, and restored when it leaves the mode: the editors
 * of the mode are saved for the location they belong to. Without a mounted folder, the editors of the mode have a location
 * of their own: they are saved when the mode is left, and come back when the mode is entered without a folder again.
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

	/** Whether the window was in Agentic Mode when the editors were last reconciled. */
	private wasAgenticMode: boolean;

	/** In Agentic Mode, the location the tracked folder was mounted at when the editors were last reconciled. */
	private mountedPrimary: string | undefined;

	/** The editors the window had when it entered Agentic Mode, kept until they are restored after it left the mode. */
	private windowEditors: IEditorWorkingSet | 'empty' | undefined;

	constructor(
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService & Partial<Pick<IEditableWorkspaceContextService, 'getFolderPrimaryLocation'>>,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IEditorService editorService: IEditorService,
		@IAgenticModeService private readonly agenticModeService: IAgenticModeService
	) {
		super();

		this._register(toDisposable(() => this.disposed = true));

		this.wasAgenticMode = this.agenticModeService.isActive;
		const stored = this.load();
		this.workingSets = stored.entries;
		this.owner = stored.owner ?? this.getCurrentKey();
		this.partial = stored.partial;
		this.windowEditors = stored.window;
		this.deleteOrphans();

		this._register(this.folderLocationService.onDidChangeLocation(() => this.reconcile()));

		// Agentic Mode moves its mounted folder in place and reports the move as a change of the workspace folders
		this._register(this.agenticModeService.onDidChange(() => this.reconcile()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => {
			if (this.agenticModeService.isActive) {
				this.reconcile();
			}
		}));

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

	/**
	 * The folder whose location is tracked: only the folder of a workspace that supports locations,
	 * or in Agentic Mode the single mounted folder, which the mode moves between its locations.
	 */
	private getFolder(): IWorkspaceFolder | undefined {
		const folders = this.contextService.getWorkspace().folders;
		const folder = folders.at(0);
		if (!folder) {
			return undefined;
		}
		if (this.agenticModeService.isActive) {
			return folders.length === 1 && this.contextService.getFolderPrimaryLocation?.(folder.uri) ? folder : undefined;
		}
		return this.folderLocationService.canSetLocation(folder) ? folder : undefined;
	}

	/**
	 * What changed since the editors were last reconciled, and records it: entering or leaving Agentic Mode, and in the
	 * mode mounting a folder or replacing it with a folder of another repository, after which the current location takes
	 * over the editors that are open instead of switching them. Only moving the mounted folder keeps the location it was mounted at.
	 */
	private takeChange(folder: IWorkspaceFolder | undefined): 'entered' | 'left' | 'mounted' | undefined {
		const agenticMode = this.agenticModeService.isActive;
		const primary = agenticMode && folder ? this.contextService.getFolderPrimaryLocation?.(folder.uri) : undefined;
		const mountedPrimary = primary ? this.toKey(primary) : undefined;
		const modeChanged = agenticMode !== this.wasAgenticMode;
		const mountChanged = mountedPrimary !== this.mountedPrimary;
		this.wasAgenticMode = agenticMode;
		this.mountedPrimary = mountedPrimary;
		if (modeChanged) {
			return agenticMode ? 'entered' : 'left';
		}
		return agenticMode && mountChanged ? 'mounted' : undefined;
	}

	/** Whether the editor area has editors: those of the main part and of the windows that are part of working sets count. */
	private hasEditors(): boolean {
		return this.editorGroupsService.parts.some(part => !part.isTransient && part.groups.some(group => group.count > 0));
	}

	/** The location of the editors: in Agentic Mode without a mounted folder, the editors of the mode have a location of their own. */
	private getCurrentKey(): string | undefined {
		if (this.agenticModeService.isActive && this.contextService.getWorkspace().folders.length === 0) {
			return this.toKey(AGENTIC_MODE_WITHOUT_FOLDER);
		}
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

			if (this.disposed) {
				return;
			}

			const folder = this.getFolder();
			const entering = this.getCurrentKey();
			const change = this.takeChange(folder);

			// The editors the window had before it entered the mode are kept for when it leaves the mode
			if (change === 'entered' && !this.windowEditors) {
				this.windowEditors = this.hasEditors() ? this.editorGroupsService.saveWorkingSet(WINDOW_WORKING_SET_NAME) : 'empty';
				this.store();
			}

			// Restoring them is pending until it worked, also across a restart or a deferred switch
			if (!this.agenticModeService.isActive && this.windowEditors) {
				if (!await this.deferIfClosingUnsavedInputs()) {
					await this.restoreWindowEditors(this.windowEditors, entering);
				}
				return;
			}

			// Entering the mode without a folder brings back the editors it had the last time it had none. The editor area
			// holds the window's editors, kept above, so it only partially holds them: their saved working set is applied.
			if (change === 'entered' && entering && entering === this.toKey(AGENTIC_MODE_WITHOUT_FOLDER) && this.workingSets.some(entry => entry.key === entering)) {
				this.owner = entering;
				this.partial = true;
				this.store();
			} else if (change) {
				if (entering && (this.owner !== entering || this.partial)) {
					this.owner = entering;
					this.partial = false;
					this.store();
				}
				return;
			}

			// Outside of a workspace that supports locations nothing is switched or saved, and the stored data is kept
			if (!this.owner || !entering || (this.owner === entering && !this.partial)) {
				return;
			}

			if (await this.deferIfClosingUnsavedInputs()) {
				return;
			}

			await this.switchWorkingSet(this.owner, entering, this.workingSets.find(entry => entry.key === entering)?.workingSet, this.owner !== entering);
		}).catch(error => this.logService.error('[folderLocation] Failed to switch the editors', error));
	}

	/**
	 * Closing an input whose backup is not restored yet discards the backup, and closing a side by side editor disposes
	 * its dirty sides: retried once inputs change their dirty state. A change that comes in while the backups are
	 * queried could be missed by them, so it checks again right away.
	 */
	private async deferIfClosingUnsavedInputs(): Promise<boolean> {
		const generation = this.workingCopyGeneration;
		this.deferred = await this.wouldCloseUnsavedInputs();
		if (this.deferred && generation !== this.workingCopyGeneration) {
			this.reconcile();
		} else if (this.deferred) {
			this.logService.info('[folderLocation] Deferring the switch of the editors until their backups are restored and the dirty sides of closing side by side editors are saved');
		}
		return this.deferred || this.disposed;
	}

	/** After leaving Agentic Mode: saves the editors of the mode for the location they belong to and restores the window's own. */
	private async restoreWindowEditors(windowEditors: IEditorWorkingSet | 'empty', entering: string | undefined): Promise<void> {
		if (await this.switchWorkingSet(this.owner, entering, windowEditors, true)) {
			if (windowEditors !== 'empty') {
				this.editorGroupsService.deleteWorkingSet(windowEditors);
			}
			this.windowEditors = undefined;
			this.store();
		}
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

	/**
	 * Saves the editors for the location being left, if any, and applies `target`. Returns whether the editors were replaced.
	 * `fallBackToEmpty` closes the editors when `target` cannot be applied.
	 */
	private async switchWorkingSet(leaving: string | undefined, entering: string | undefined, target: IEditorWorkingSet | 'empty' | undefined, fallBackToEmpty: boolean): Promise<boolean> {

		// Save the editors of the location being left. Nothing is saved for an empty editor
		// area so that the location restores to what it had before the editors were closed.
		// The editor area is not saved over the working set of an owner it only partially holds.
		if (leaving && !this.partial && this.hasEditors()) {
			this.save(leaving, entering);
		}

		// Apply the editors of the location being entered. The location only owns the editor
		// area once that worked. When its saved working set cannot be applied, the editors of the
		// location being left (already saved above) must not stay open: they belong to another
		// location. The entering location then starts empty. Its saved set is kept, because
		// the failure can be transient: it is replaced when the location is left with editors open.
		if (this.disposed) {
			return false;
		}

		// Applying replaces the editors before it settles: until it succeeded, the saved working set
		// of the owner stays authoritative, also for a window that restarts meanwhile.
		if (!this.partial) {
			this.partial = true;
			this.store();
		}
		if ((target && await this.tryApply(target)) || (fallBackToEmpty && target !== 'empty' && await this.tryApply('empty'))) {
			this.owner = entering;
			this.partial = false;
			this.store();
			return true;
		}
		return false;
	}

	private async tryApply(workingSet: IEditorWorkingSet | 'empty'): Promise<boolean> {
		try {
			this.logService.trace(`[folderLocation] Applying the working set ${workingSet === 'empty' ? 'empty' : workingSet.id}`);
			const applied = await this.editorGroupsService.applyWorkingSet(workingSet, { preserveFocus: true, switchesEditors: true });
			this.logService.trace(`[folderLocation] Applied the working set: ${applied}`);
			if (applied) {
				return true;
			}
			this.logService.error('[folderLocation] The working set could not be applied');
		} catch (error) {
			this.logService.error('[folderLocation] Failed to apply the working set', error);
		}
		return false;
	}

	private save(key: string, protectedKey: string | undefined): void {
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
		if (this.windowEditors && this.windowEditors !== 'empty') {
			referenced.add(this.windowEditors.id);
		}
		for (const workingSet of this.editorGroupsService.getWorkingSets()) {
			if (workingSet.name.startsWith(FOLDER_LOCATION_WORKING_SET_NAME_PREFIX) && !referenced.has(workingSet.id)) {
				this.editorGroupsService.deleteWorkingSet(workingSet);
			}
		}
	}

	private load(): { owner: string | undefined; partial: boolean; entries: { key: string; workingSet: IEditorWorkingSet }[]; window?: IEditorWorkingSet | 'empty' } {
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
			entries: [...entries.values()].slice(-FOLDER_LOCATION_MAX_WORKING_SETS),
			// Editors whose working set no longer exists can't be restored: leaving the mode then closes the editors of the mode
			window: stored.window === 'empty' || (stored.window && existing.has(stored.window.id)) ? stored.window : stored.window ? 'empty' : undefined
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
		const stored: IStoredWorkingSets = { version: 1, owner: this.owner, partial: this.partial || undefined, entries: this.workingSets, window: this.windowEditors };
		this.storageService.store(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
