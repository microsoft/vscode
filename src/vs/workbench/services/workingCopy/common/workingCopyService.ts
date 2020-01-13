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
import { ISaveOptions } from 'vs/workbench/common/editor';

export const enum WorkingCopyCapabilities {

	/**
	 * Signals that the working copy requires
	 * additional input when saving, e.g. an
	 * associated path to save to.
	 */
	Untitled = 1 << 1
}

export interface IWorkingCopy {

	readonly resource: URI;

	readonly capabilities: WorkingCopyCapabilities;


	//#region Events

	readonly onDidChangeDirty: Event<void>;

	readonly onDidChangeContent: Event<void>;

	//#endregion


	//#region Dirty Tracking

	isDirty(): boolean;

	//#endregion


	//#region Save / Backup

	save(options?: ISaveOptions): Promise<boolean>;

	backup(): Promise<void>;

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

	readonly hasDirty: boolean;

	isDirty(resource: URI): boolean;

	//#endregion


	//#region Registry

	readonly workingCopies: IWorkingCopy[];

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


	//#region Dirty Tracking

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

	//#endregion


	//#region Registry

	private mapResourceToWorkingCopy = TernarySearchTree.forPaths<Set<IWorkingCopy>>();

	get workingCopies(): IWorkingCopy[] { return values(this._workingCopies); }
	private _workingCopies = new Set<IWorkingCopy>();

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
}

registerSingleton(IWorkingCopyService, WorkingCopyService, true);
