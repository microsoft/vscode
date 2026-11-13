/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../services/editor/common/editorGroupsService.js';

export const FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY = 'folderLocation.workingSets';
export const FOLDER_LOCATION_MAX_WORKING_SETS = 20;

/** Marks the working sets owned by this contribution, so that unreferenced ones can be told apart from others. */
export const FOLDER_LOCATION_WORKING_SET_NAME_PREFIX = 'folderLocation:';

interface IStoredWorkingSets {
	readonly version: 1;

	/** The location whose editors are in the editor area. */
	readonly owner?: string;
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

	private disposed = false;

	constructor(
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._register(toDisposable(() => this.disposed = true));

		const stored = this.load();
		this.workingSets = stored.entries;
		this.owner = stored.owner ?? this.getCurrentKey();
		this.deleteOrphans();

		this._register(this.folderLocationService.onDidChangeLocation(() => this.reconcile()));
		this.reconcile();
	}

	private getCurrentKey(): string | undefined {
		const folder = this.contextService.getWorkspace().folders.at(0);
		return folder ? this.uriIdentityService.asCanonicalUri(folder.uri).toString() : undefined;
	}

	/** Makes the editor area hold the editors of the current location. */
	private reconcile(): void {
		// Always queue: the owner can still change while an earlier apply is pending, so
		// whether anything is left to do is decided once the earlier work has settled.
		this.sequencer.queue(async () => {
			const entering = this.getCurrentKey();
			if (this.disposed || !this.owner || !entering || this.owner === entering) {
				return;
			}
			await this.switchWorkingSet(this.owner, entering);
		}).catch(error => this.logService.error('[folderLocation] Failed to switch the editors', error));
	}

	private async switchWorkingSet(leaving: string, entering: string): Promise<void> {

		// Save the editors of the location being left. Nothing is saved for an empty editor
		// area so that the location restores to what it had before the editors were closed.
		// The editors of the main part and of the windows that are part of working sets count.
		if (this.editorGroupsService.parts.some(part => !part.isTransient && part.groups.some(group => group.count > 0))) {
			this.save(leaving, entering);
		}

		// Apply the editors of the location being entered. The location only owns the editor
		// area once that worked: otherwise its saved working set must not be replaced by the
		// editors that are still open.
		const target = this.workingSets.find(entry => entry.key === entering)?.workingSet;
		if (this.disposed) {
			return;
		}
		try {
			if (await this.editorGroupsService.applyWorkingSet(target ?? 'empty', { preserveFocus: true })) {
				this.owner = entering;
				this.store();
			} else {
				this.logService.error('[folderLocation] The working set could not be applied');
			}
		} catch (error) {
			this.logService.error('[folderLocation] Failed to apply the working set', error);
		}
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

	private load(): { owner: string | undefined; entries: { key: string; workingSet: IEditorWorkingSet }[] } {
		const raw = this.storageService.get(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return { owner: undefined, entries: [] };
		}

		let stored: IStoredWorkingSets | undefined;
		try {
			stored = JSON.parse(raw);
		} catch {
			return { owner: undefined, entries: [] };
		}
		if (stored?.version !== 1 || !Array.isArray(stored.entries)) {
			return { owner: undefined, entries: [] };
		}

		// Drop handles whose editor state no longer exists
		const existing = new Set(this.editorGroupsService.getWorkingSets().map(workingSet => workingSet.id));
		return {
			owner: typeof stored.owner === 'string' ? stored.owner : undefined,
			entries: stored.entries.filter(entry => typeof entry.key === 'string' && existing.has(entry.workingSet?.id)).slice(-FOLDER_LOCATION_MAX_WORKING_SETS)
		};
	}

	private store(): void {
		const stored: IStoredWorkingSets = { version: 1, owner: this.owner, entries: this.workingSets };
		this.storageService.store(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
