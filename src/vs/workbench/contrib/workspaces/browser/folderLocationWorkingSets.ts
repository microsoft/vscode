/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../services/editor/common/editorGroupsService.js';

export const FOLDER_LOCATION_RESTORE_EDITORS_SETTING = 'workbench.folderLocation.restoreEditors';
export const FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY = 'folderLocation.workingSets';
export const FOLDER_LOCATION_MAX_WORKING_SETS = 20;

interface IStoredWorkingSets {
	readonly version: 1;
	readonly entries: readonly { readonly key: string; readonly workingSet: IEditorWorkingSet }[];
}

/**
 * Keeps one working set of open editors per location of the workspace folder:
 * when the folder switches location, the editors of the location being left are
 * saved and the ones of the location being entered are restored. A location that
 * is visited for the first time starts with no editors.
 */
export class FolderLocationWorkingSetsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.folderLocationWorkingSets';

	private readonly sequencer = new Sequencer();

	/** Ordered from least to most recently saved. */
	private workingSets: { key: string; workingSet: IEditorWorkingSet }[];

	private currentKey: string | undefined;

	private disposed = false;

	constructor(
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._register(toDisposable(() => this.disposed = true));
		this.workingSets = this.load();
		this.currentKey = this.getCurrentKey();

		this._register(this.folderLocationService.onDidChangeCurrentLocation(() => this.onDidChangeLocation()));
	}

	private getCurrentKey(): string | undefined {
		const folder = this.contextService.getWorkspace().folders.at(0);
		return folder ? this.uriIdentityService.asCanonicalUri(folder.uri).toString() : undefined;
	}

	private onDidChangeLocation(): void {
		const leaving = this.currentKey;
		const entering = this.getCurrentKey();
		this.currentKey = entering;

		if (!leaving || !entering || leaving === entering || !this.configurationService.getValue<boolean>(FOLDER_LOCATION_RESTORE_EDITORS_SETTING)) {
			return;
		}

		this.sequencer.queue(() => this.disposed || !this.configurationService.getValue<boolean>(FOLDER_LOCATION_RESTORE_EDITORS_SETTING) ? Promise.resolve() : this.switchWorkingSet(leaving, entering)).catch(error => this.logService.error('[folderLocation] Failed to switch the editors', error));
	}

	private async switchWorkingSet(leaving: string, entering: string): Promise<void> {

		// Save the editors of the location being left. Nothing is saved for an empty editor
		// area so that the location restores to what it had before the editors were closed.
		// The editors of the main part and of the windows that are part of working sets count.
		if (this.editorGroupsService.parts.some(part => !part.isTransient && part.groups.some(group => group.count > 0))) {
			this.save(leaving, entering);
		}

		// Apply the editors of the location being entered. A failure keeps the current editors.
		const target = this.workingSets.find(entry => entry.key === entering)?.workingSet;
		if (this.disposed) {
			return;
		}
		try {
			await this.editorGroupsService.applyWorkingSet(target ?? 'empty', { preserveFocus: true });
		} catch (error) {
			this.logService.error('[folderLocation] Failed to apply the working set', error);
		}
	}

	private save(key: string, protectedKey: string): void {
		const previous = this.workingSets.find(entry => entry.key === key);
		const workingSet = this.editorGroupsService.saveWorkingSet(key);

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

	private load(): { key: string; workingSet: IEditorWorkingSet }[] {
		const raw = this.storageService.get(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return [];
		}

		let stored: IStoredWorkingSets | undefined;
		try {
			stored = JSON.parse(raw);
		} catch {
			return [];
		}
		if (stored?.version !== 1 || !Array.isArray(stored.entries)) {
			return [];
		}

		// Drop handles whose editor state no longer exists
		const existing = new Set(this.editorGroupsService.getWorkingSets().map(workingSet => workingSet.id));
		return stored.entries.filter(entry => typeof entry.key === 'string' && existing.has(entry.workingSet?.id)).slice(-FOLDER_LOCATION_MAX_WORKING_SETS);
	}

	private store(): void {
		const stored: IStoredWorkingSets = { version: 1, entries: this.workingSets };
		this.storageService.store(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
