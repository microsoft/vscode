/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { Disposable, IDisposable, toDisposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { TernarySearchTree, values } from 'vs/base/common/map';
import { ISaveOptions, IRevertOptions } from 'vs/workbench/common/editor';
import { ITextSnapshot } from 'vs/editor/common/model';

export const enum WorkingCopyCapabilities {

	/**
	 * Signals that the working copy requires
	 * additional input when saving, e.g. an
	 * associated path to save to.
	 */
	Untitled = 1 << 1
}

/**
 * Data to be associated with working copy backups. Use
 * `IBackupFileService.resolve(workingCopy.resource)` to
 * retrieve the backup when loading the working copy.
 */
export interface IWorkingCopyBackup {

	/**
	 * Any serializable metadata to be associated with the backup.
	 */
	meta?: object;

	/**
	 * Use this for larger textual content of the backup.
	 */
	content?: ITextSnapshot;
}

export interface IWorkingCopy {

	readonly resource: URI;

	readonly name: string;

	readonly capabilities: WorkingCopyCapabilities;


	//#region Events

	/**
	 * Used by the workbench to signal if the working copy
	 * is dirty or not. Typically a working copy is dirty
	 * once changed until saved or reverted.
	 */
	readonly onDidChangeDirty: Event<void>;

	/**
	 * Used by the workbench e.g. to trigger auto-save
	 * (unless this working copy is untitled) and backups.
	 */
	readonly onDidChangeContent: Event<void>;

	//#endregion


	//#region Dirty Tracking

	isDirty(): boolean;

	//#endregion


	//#region Save / Backup

	/**
	 * The workbench may call this method often after it receives
	 * the `onDidChangeContent` event for the working copy. The motivation
	 * is to allow to quit VSCode with dirty working copies present.
	 *
	 * Providers of working copies should use `IBackupFileService.resolve(workingCopy.resource)`
	 * to retrieve the backup metadata associated when loading the working copy.
	 *
	 * Not providing this method from the working copy will disable any
	 * backups and hot-exit functionality for those working copies.
	 */
	backup?(): Promise<IWorkingCopyBackup>;

	save(options?: ISaveOptions): Promise<boolean>;

	revert(options?: IRevertOptions): Promise<boolean>;

	//#endregion
}

export const IWorkingCopyService = createDecorator<IWorkingCopyService>('workingCopyService');

export interface IWorkingCopyService {

	_serviceBrand: undefined;


	//#region Events

	readonly onDidRegister: Event<IWorkingCopy>;

	readonly onDidUnregister: Event<IWorkingCopy>;

	readonly onDidChangeDirty: Event<IWorkingCopy>;

	readonly onDidChangeContent: Event<IWorkingCopy>;

	//#endregion


	//#region Dirty Tracking

	readonly dirtyCount: number;

	readonly dirtyWorkingCopies: IWorkingCopy[];

	readonly hasDirty: boolean;

	isDirty(resource: URI): boolean;

	//#endregion


	//#region Registry

	readonly workingCopies: IWorkingCopy[];

	getWorkingCopies(resource: URI): IWorkingCopy[];

	registerWorkingCopy(workingCopy: IWorkingCopy): IDisposable;

	//#endregion
}

export class WorkingCopyService extends Disposable implements IWorkingCopyService {

	_serviceBrand: undefined;

	//#region Events

	private readonly _onDidRegister = this._register(new Emitter<IWorkingCopy>());
	readonly onDidRegister = this._onDidRegister.event;

	private readonly _onDidUnregister = this._register(new Emitter<IWorkingCopy>());
	readonly onDidUnregister = this._onDidUnregister.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<IWorkingCopy>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeContent = this._register(new Emitter<IWorkingCopy>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	//#endregion


	//#region Registry

	private readonly mapResourceToWorkingCopy = TernarySearchTree.forPaths<Set<IWorkingCopy>>();

	get workingCopies(): IWorkingCopy[] { return values(this._workingCopies); }
	private _workingCopies = new Set<IWorkingCopy>();

	getWorkingCopies(resource: URI): IWorkingCopy[] {
		const workingCopies = this.mapResourceToWorkingCopy.get(resource.toString());

		return workingCopies ? values(workingCopies) : [];
	}

	registerWorkingCopy(workingCopy: IWorkingCopy): IDisposable {
		const disposables = new DisposableStore();

		// Registry
		let workingCopiesForResource = this.mapResourceToWorkingCopy.get(workingCopy.resource.toString());
		if (!workingCopiesForResource) {
			workingCopiesForResource = new Set<IWorkingCopy>();
			this.mapResourceToWorkingCopy.set(workingCopy.resource.toString(), workingCopiesForResource);
		}

		workingCopiesForResource.add(workingCopy);

		this._workingCopies.add(workingCopy);

		// Wire in Events
		disposables.add(workingCopy.onDidChangeContent(() => this._onDidChangeContent.fire(workingCopy)));
		disposables.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));

		// Send some initial events
		this._onDidRegister.fire(workingCopy);
		if (workingCopy.isDirty()) {
			this._onDidChangeDirty.fire(workingCopy);
		}

		return toDisposable(() => {
			this.unregisterWorkingCopy(workingCopy);
			dispose(disposables);

			// Signal as event
			this._onDidUnregister.fire(workingCopy);
		});
	}

	private unregisterWorkingCopy(workingCopy: IWorkingCopy): void {

		// Remove from registry
		const workingCopiesForResource = this.mapResourceToWorkingCopy.get(workingCopy.resource.toString());
		if (workingCopiesForResource && workingCopiesForResource.delete(workingCopy) && workingCopiesForResource.size === 0) {
			this.mapResourceToWorkingCopy.delete(workingCopy.resource.toString());
		}

		this._workingCopies.delete(workingCopy);

		// If copy is dirty, ensure to fire an event to signal the dirty change
		// (a disposed working copy cannot account for being dirty in our model)
		if (workingCopy.isDirty()) {
			this._onDidChangeDirty.fire(workingCopy);
		}
	}

	//#endregion


	//#region Dirty Tracking

	get hasDirty(): boolean {
		for (const workingCopy of this._workingCopies) {
			if (workingCopy.isDirty()) {
				return true;
			}
		}

		return false;
	}

	get dirtyCount(): number {
		let totalDirtyCount = 0;

		for (const workingCopy of this._workingCopies) {
			if (workingCopy.isDirty()) {
				totalDirtyCount++;
			}
		}

		return totalDirtyCount;
	}

	get dirtyWorkingCopies(): IWorkingCopy[] {
		return this.workingCopies.filter(workingCopy => workingCopy.isDirty());
	}

	isDirty(resource: URI): boolean {
		const workingCopies = this.mapResourceToWorkingCopy.get(resource.toString());
		if (workingCopies) {
			for (const workingCopy of workingCopies) {
				if (workingCopy.isDirty()) {
					return true;
				}
			}
		}

		return false;
	}

	//#endregion
}

registerSingleton(IWorkingCopyService, WorkingCopyService, true);
