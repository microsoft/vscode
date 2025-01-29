/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable, IDisposable, toDisposable, DisposableStore, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IWorkingCopy, IWorkingCopyIdentifier, IWorkingCopySaveEvent as IBaseWorkingCopySaveEvent } from './workingCopy.js';

export const IWorkingCopyService = createDecorator<IWorkingCopyService>('workingCopyService');

export interface IWorkingCopySaveEvent extends IBaseWorkingCopySaveEvent {

	/**
	 * The working copy that was saved.
	 */
	readonly workingCopy: IWorkingCopy;
}

export interface IWorkingCopyService {

	readonly _serviceBrand: undefined;


	//#region Events

	/**
	 * An event for when a working copy was registered.
	 */
	readonly onDidRegister: Event<IWorkingCopy>;

	/**
	 * An event for when a working copy was unregistered.
	 */
	readonly onDidUnregister: Event<IWorkingCopy>;

	/**
	 * An event for when a working copy dirty state changed.
	 */
	readonly onDidChangeDirty: Event<IWorkingCopy>;

	/**
	 * An event for when a working copy's content changed.
	 */
	readonly onDidChangeContent: Event<IWorkingCopy>;

	/**
	 * An event for when a working copy was saved.
	 */
	readonly onDidSave: Event<IWorkingCopySaveEvent>;

	//#endregion


	//#region Dirty Tracking

	/**
	 * The number of dirty working copies that are registered.
	 */
	readonly dirtyCount: number;

	/**
	 * All dirty working copies that are registered.
	 */
	readonly dirtyWorkingCopies: readonly IWorkingCopy[];

	/**
	 * The number of modified working copies that are registered,
	 * including scratchpads, which are never dirty.
	 */
	readonly modifiedCount: number;

	/**
	 * All working copies with unsaved changes,
	 * including scratchpads, which are never dirty.
	 */
	readonly modifiedWorkingCopies: readonly IWorkingCopy[];

	/**
	 * Whether there is any registered working copy that is dirty.
	 */
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

	/**
	 * All working copies that are registered.
	 */
	readonly workingCopies: readonly IWorkingCopy[];

	/**
	 * Register a new working copy with the service. This method will
	 * throw if you try to register a working copy on a resource that
	 * has already been registered.
	 *
	 * Overall there can only ever be 1 working copy with the same
	 * resource.
	 */
	registerWorkingCopy(workingCopy: IWorkingCopy): IDisposable;

	/**
	 * Whether a working copy with the given resource or identifier
	 * exists.
	 */
	has(identifier: IWorkingCopyIdentifier): boolean;
	has(resource: URI): boolean;

	/**
	 * Returns a working copy with the given identifier or `undefined`
	 * if no such working copy exists.
	 */
	get(identifier: IWorkingCopyIdentifier): IWorkingCopy | undefined;

	/**
	 * Returns all working copies with the given resource or `undefined`
	 * if no such working copy exists.
	 */
	getAll(resource: URI): readonly IWorkingCopy[] | undefined;

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

	private readonly _onDidSave = this._register(new Emitter<IWorkingCopySaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	//#endregion


	//#region Registry

	get workingCopies(): IWorkingCopy[] { return Array.from(this._workingCopies.values()); }
	private _workingCopies = new Set<IWorkingCopy>();

	private readonly mapResourceToWorkingCopies = new ResourceMap<Map<string, IWorkingCopy>>();
	private readonly mapWorkingCopyToListeners = this._register(new DisposableMap<IWorkingCopy>());

	registerWorkingCopy(workingCopy: IWorkingCopy): IDisposable {
		let workingCopiesForResource = this.mapResourceToWorkingCopies.get(workingCopy.resource);
		if (workingCopiesForResource?.has(workingCopy.typeId)) {
			throw new Error(`Cannot register more than one working copy with the same resource ${workingCopy.resource.toString()} and type ${workingCopy.typeId}.`);
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
		disposables.add(workingCopy.onDidSave(e => this._onDidSave.fire({ workingCopy, ...e })));
		this.mapWorkingCopyToListeners.set(workingCopy, disposables);

		// Send some initial events
		this._onDidRegister.fire(workingCopy);
		if (workingCopy.isDirty()) {
			this._onDidChangeDirty.fire(workingCopy);
		}

		return toDisposable(() => {

			// Unregister working copy
			this.unregisterWorkingCopy(workingCopy);

			// Signal as event
			this._onDidUnregister.fire(workingCopy);
		});
	}

	protected unregisterWorkingCopy(workingCopy: IWorkingCopy): void {

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

		// Remove all listeners associated to working copy
		this.mapWorkingCopyToListeners.deleteAndDispose(workingCopy);
	}

	has(identifier: IWorkingCopyIdentifier): boolean;
	has(resource: URI): boolean;
	has(resourceOrIdentifier: URI | IWorkingCopyIdentifier): boolean {
		if (URI.isUri(resourceOrIdentifier)) {
			return this.mapResourceToWorkingCopies.has(resourceOrIdentifier);
		}

		return this.mapResourceToWorkingCopies.get(resourceOrIdentifier.resource)?.has(resourceOrIdentifier.typeId) ?? false;
	}

	get(identifier: IWorkingCopyIdentifier): IWorkingCopy | undefined {
		return this.mapResourceToWorkingCopies.get(identifier.resource)?.get(identifier.typeId);
	}

	getAll(resource: URI): readonly IWorkingCopy[] | undefined {
		const workingCopies = this.mapResourceToWorkingCopies.get(resource);
		if (!workingCopies) {
			return undefined;
		}

		return Array.from(workingCopies.values());
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

	get modifiedCount(): number {
		let totalModifiedCount = 0;

		for (const workingCopy of this._workingCopies) {
			if (workingCopy.isModified()) {
				totalModifiedCount++;
			}
		}

		return totalModifiedCount;
	}

	get modifiedWorkingCopies(): IWorkingCopy[] {
		return this.workingCopies.filter(workingCopy => workingCopy.isModified());
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

registerSingleton(IWorkingCopyService, WorkingCopyService, InstantiationType.Delayed);
