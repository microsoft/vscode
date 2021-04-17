/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { Disposable, IDisposable, toDisposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { ISaveOptions, IRevertOptions } from 'vs/workbench/common/editor';
import { ITextSnapshot } from 'vs/editor/common/model';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IBackupMeta } from 'vs/workbench/services/backup/common/backup';

export const enum WorkingCopyCapabilities {

	/**
	 * Signals no specific capability for the working copy.
	 */
	None = 0,

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
	meta?: IBackupMeta;

	/**
	 * Use this for larger textual content of the backup.
	 */
	content?: ITextSnapshot;
}

/**
 * @deprecated it is important to provide a type identifier
 * for working copies to enable all capabilities.
 */
export const NO_TYPE_ID = '';

/**
 * A working copy is an abstract concept to unify handling of
 * data that can be worked on (e.g. edited) in an editor.
 *
 * Every working copy has in common that it is identified by
 * a resource `URI` and a `typeId`. There can only be one
 * working copy registered with the same `URI` and `typeId`.
 *
 * A working copy resource may be the backing store of the data
 * (e.g. a file on disk), but that is not a requirement. If
 * your working copy is file based, consider to use the
 * `IFileWorkingCopy` instead that simplifies a lot of things
 * when working with file based working copies.
 */
export interface IWorkingCopy {

	/**
	 * The type identifier of the working copy for grouping
	 * working copies of the same domain together.
	 *
	 * There can only be one working copy for a given resource
	 * and type identifier.
	 */
	readonly typeId: string;

	/**
	 * The resource of the working copy must be unique for
	 * working copies of the same `typeId`.
	 */
	readonly resource: URI;

	/**
	 * Human readable name of the working copy.
	 */
	readonly name: string;

	/**
	 * The capabilities of the working copy.
	 */
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
	 * @param token support for cancellation
	 */
	backup(token: CancellationToken): Promise<IWorkingCopyBackup>;

	/**
	 * Asks the working copy to save. If the working copy was dirty, it is
	 * expected to be non-dirty after this operation has finished.
	 *
	 * @returns `true` if the operation was successful and `false` otherwise.
	 */
	save(options?: ISaveOptions): Promise<boolean>;

	/**
	 * Asks the working copy to revert. If the working copy was dirty, it is
	 * expected to be non-dirty after this operation has finished.
	 */
	revert(options?: IRevertOptions): Promise<void>;

	//#endregion
}

export const IWorkingCopyService = createDecorator<IWorkingCopyService>('workingCopyService');

export interface IWorkingCopyService {

	readonly _serviceBrand: undefined;


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

	/**
	 * Figure out if working copies with the given
	 * resource are dirty or not.
	 *
	 * @param resource the URI of the working copy
	 * @param typeId optional type identifier to only
	 * consider working copies of that type.
	 */
	isDirty(resource: URI, typeId?: string): boolean;

	//#endregion


	//#region Registry

	readonly workingCopies: IWorkingCopy[];

	/**
	 * Register a new working copy with the service. This method will
	 * throw if you try to register a working copy on a resource that
	 * has already been registered.
	 *
	 * Overall there can only ever be 1 working copy with the same
	 * resource.
	 */
	registerWorkingCopy(workingCopy: IWorkingCopy): IDisposable;

	//#endregion
}

export class WorkingCopyService extends Disposable implements IWorkingCopyService {

	declare readonly _serviceBrand: undefined;

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

	get workingCopies(): IWorkingCopy[] { return Array.from(this._workingCopies.values()); }
	private _workingCopies = new Set<IWorkingCopy>();

	private readonly mapResourceToWorkingCopies = new ResourceMap<Map<string, IWorkingCopy>>();

	registerWorkingCopy(workingCopy: IWorkingCopy): IDisposable {
		let workingCopiesForResource = this.mapResourceToWorkingCopies.get(workingCopy.resource);
		if (workingCopiesForResource?.has(workingCopy.typeId)) {
			throw new Error(`Cannot register more than one working copy with the same resource ${workingCopy.resource.toString(true)} and type ${workingCopy.typeId}.`);
		}

		// Registry (all)
		this._workingCopies.add(workingCopy);

		// Registry (type based)
		if (!workingCopiesForResource) {
			workingCopiesForResource = new Map();
			this.mapResourceToWorkingCopies.set(workingCopy.resource, workingCopiesForResource);
		}
		workingCopiesForResource.set(workingCopy.typeId, workingCopy);

		// Wire in Events
		const disposables = new DisposableStore();
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

		// Registry (all)
		this._workingCopies.delete(workingCopy);

		// Registry (type based)
		const workingCopiesForResource = this.mapResourceToWorkingCopies.get(workingCopy.resource);
		if (workingCopiesForResource?.delete(workingCopy.typeId) && workingCopiesForResource.size === 0) {
			this.mapResourceToWorkingCopies.delete(workingCopy.resource);
		}

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

	isDirty(resource: URI, typeId?: string): boolean {
		const workingCopies = this.mapResourceToWorkingCopies.get(resource);
		if (workingCopies) {

			// For a specific type
			if (typeof typeId === 'string') {
				return workingCopies.get(typeId)?.isDirty() ?? false;
			}

			// Across all working copies
			else {
				for (const [, workingCopy] of workingCopies) {
					if (workingCopy.isDirty()) {
						return true;
					}
				}
			}
		}

		return false;
	}

	//#endregion
}

registerSingleton(IWorkingCopyService, WorkingCopyService, true);
