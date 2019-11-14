/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { Disposable, IDisposable, toDisposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { TernarySearchTree } from 'vs/base/common/map';

export const enum WorkingCopyCapabilities {

	/**
	 * Signals that the working copy participates
	 * in auto saving as configured by the user.
	 */
	AutoSave = 1 << 1
}

export interface IWorkingCopy {

	//#region Dirty Tracking

	readonly onDidChangeDirty: Event<void>;

	isDirty(): boolean;

	//#endregion

	readonly resource: URI;

	readonly capabilities: WorkingCopyCapabilities;
}

export const IWorkingCopyService = createDecorator<IWorkingCopyService>('workingCopyService');

export interface IWorkingCopyService {

	_serviceBrand: undefined;

	//#region Dirty Tracking

	readonly onDidChangeDirty: Event<IWorkingCopy>;

	readonly dirtyCount: number;

	readonly hasDirty: boolean;

	isDirty(resource: URI): boolean;

	getDirty(...resources: URI[]): IWorkingCopy[];

	//#endregion


	//#region Registry

	registerWorkingCopy(workingCopy: IWorkingCopy): IDisposable;

	//#endregion
}

export class WorkingCopyService extends Disposable implements IWorkingCopyService {

	_serviceBrand: undefined;

	//#region Dirty Tracking

	private readonly _onDidChangeDirty = this._register(new Emitter<IWorkingCopy>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	getDirty(...resources: URI[]): IWorkingCopy[] {
		const dirtyWorkingCopies: IWorkingCopy[] = [];

		// Specific resource(s)
		if (resources.length > 0) {
			for (const resource of resources) {
				this.fillDirty(this.mapResourceToWorkingCopy.get(resource.toString()), dirtyWorkingCopies);
			}
		}

		// All resources
		else {
			this.fillDirty(this.workingCopies, dirtyWorkingCopies);
		}

		return dirtyWorkingCopies;
	}

	private fillDirty(workingCopies: Set<IWorkingCopy> | undefined, target: IWorkingCopy[]): void {
		if (workingCopies) {
			for (const workingCopy of workingCopies) {
				if (workingCopy.isDirty()) {
					target.push(workingCopy);
				}
			}
		}
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

	get hasDirty(): boolean {
		for (const workingCopy of this.workingCopies) {
			if (workingCopy.isDirty()) {
				return true;
			}
		}

		return false;
	}

	get dirtyCount(): number {
		let totalDirtyCount = 0;

		for (const workingCopy of this.workingCopies) {
			if (workingCopy.isDirty()) {
				totalDirtyCount++;
			}
		}

		return totalDirtyCount;
	}

	//#endregion


	//#region Registry

	private mapResourceToWorkingCopy = TernarySearchTree.forPaths<Set<IWorkingCopy>>();
	private workingCopies = new Set<IWorkingCopy>();

	registerWorkingCopy(workingCopy: IWorkingCopy): IDisposable {
		const disposables = new DisposableStore();

		// Registry
		let workingCopiesForResource = this.mapResourceToWorkingCopy.get(workingCopy.resource.toString());
		if (!workingCopiesForResource) {
			workingCopiesForResource = new Set<IWorkingCopy>();
			this.mapResourceToWorkingCopy.set(workingCopy.resource.toString(), workingCopiesForResource);
		}

		workingCopiesForResource.add(workingCopy);

		this.workingCopies.add(workingCopy);

		// Dirty Events
		disposables.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));
		if (workingCopy.isDirty()) {
			this._onDidChangeDirty.fire(workingCopy);
		}

		return toDisposable(() => {
			this.unregisterWorkingCopy(workingCopy);
			dispose(disposables);
		});
	}

	private unregisterWorkingCopy(workingCopy: IWorkingCopy): void {

		// Remove from registry
		const workingCopiesForResource = this.mapResourceToWorkingCopy.get(workingCopy.resource.toString());
		if (workingCopiesForResource && workingCopiesForResource.delete(workingCopy) && workingCopiesForResource.size === 0) {
			this.mapResourceToWorkingCopy.delete(workingCopy.resource.toString());
		}

		this.workingCopies.delete(workingCopy);

		// If copy is dirty, ensure to fire an event to signal the dirty change
		// (a disposed working copy cannot account for being dirty in our model)
		if (workingCopy.isDirty()) {
			this._onDidChangeDirty.fire(workingCopy);
		}
	}

	//#endregion
}

registerSingleton(IWorkingCopyService, WorkingCopyService, true);
