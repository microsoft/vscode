/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, AsyncEmitter, IWaitUntil } from 'vs/base/common/event';
import { insert } from 'vs/base/common/arrays';
import { URI } from 'vs/base/common/uri';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IFileService, FileOperation, IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IWorkingCopyService, IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { isEqualOrParent, isEqual } from 'vs/base/common/resources';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';
import { WorkingCopyFileOperationParticipant } from 'vs/workbench/services/workingCopy/common/workingCopyFileOperationParticipant';

export const IWorkingCopyFileService = createDecorator<IWorkingCopyFileService>('workingCopyFileService');

export interface WorkingCopyFileEvent extends IWaitUntil {

	/**
	 * An identifier to correlate the operation through the
	 * different event types (before, after, error).
	 */
	readonly correlationId: number;

	/**
	 * The file operation that is taking place.
	 */
	readonly operation: FileOperation;

	/**
	 * The resource the event is about.
	 */
	readonly target: URI;

	/**
	 * A property that is defined for move operations.
	 */
	readonly source?: URI;
}

export interface IWorkingCopyFileOperationParticipant {

	/**
	 * Participate in a file operation of a working copy. Allows to
	 * change the working copy before it is being saved to disk.
	 */
	participate(
		target: URI,
		source: URI | undefined,
		operation: FileOperation,
		progress: IProgress<IProgressStep>,
		timeout: number,
		token: CancellationToken
	): Promise<void>;
}

/**
 * Returns the working copies for a given resource.
 */
type WorkingCopyProvider = (resourceOrFolder: URI) => IWorkingCopy[];

/**
 * A service that allows to perform file operations with working copy support.
 * Any operation that would leave a stale dirty working copy behind will make
 * sure to revert the working copy first.
 *
 * On top of that events are provided to participate in each state of the
 * operation to perform additional work.
 */
export interface IWorkingCopyFileService {

	_serviceBrand: undefined;

	//#region Events

	/**
	 * An event that is fired when a certain working copy IO operation is about to run.
	 *
	 * Participants can join this event with a long running operation to keep some state
	 * before the operation is started, but working copies should not be changed at this
	 * point in time. For that purpose, use the `IWorkingCopyFileOperationParticipant` API.
	 */
	readonly onWillRunWorkingCopyFileOperation: Event<WorkingCopyFileEvent>;

	/**
	 * An event that is fired after a working copy IO operation has failed.
	 *
	 * Participants can join this event with a long running operation to clean up as needed.
	 */
	readonly onDidFailWorkingCopyFileOperation: Event<WorkingCopyFileEvent>;

	/**
	 * An event that is fired after a working copy IO operation has been performed.
	 *
	 * Participants can join this event with a long running operation to make changes
	 * after the operation has finished.
	 */
	readonly onDidRunWorkingCopyFileOperation: Event<WorkingCopyFileEvent>;

	//#endregion


	//#region File operation participants

	/**
	 * Adds a participant for file operations on working copies.
	 */
	addFileOperationParticipant(participant: IWorkingCopyFileOperationParticipant): IDisposable;

	/**
	 * Execute all known file operation participants.
	 */
	runFileOperationParticipants(target: URI, source: URI | undefined, operation: FileOperation): Promise<void>


	//#region File operations

	/**
	 * Will move working copies matching the provided resource and children
	 * to the target resource using the associated file service for that resource.
	 *
	 * Working copy owners can listen to the `onWillRunWorkingCopyFileOperation` and
	 * `onDidRunWorkingCopyFileOperation` events to participate.
	 */
	move(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata>;

	/**
	 * Will copy working copies matching the provided resource and children
	 * to the target using the associated file service for that resource.
	 *
	 * Working copy owners can listen to the `onWillRunWorkingCopyFileOperation` and
	 * `onDidRunWorkingCopyFileOperation` events to participate.
	 */
	copy(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata>;

	/**
	 * Will delete working copies matching the provided resource and children
	 * using the associated file service for that resource.
	 *
	 * Working copy owners can listen to the `onWillRunWorkingCopyFileOperation` and
	 * `onDidRunWorkingCopyFileOperation` events to participate.
	 */
	delete(resource: URI, options?: { useTrash?: boolean, recursive?: boolean }): Promise<void>;

	//#endregion

	//#region Path related

	/**
	 * Register a new provider for working copies based on a resource.
	 *
	 * @return a disposable that unregisters the provider.
	 */
	registerWorkingCopyProvider(provider: WorkingCopyProvider): IDisposable;

	/**
	 * Will return all working copies that are dirty matching the provided resource.
	 * If the resource is a folder and the scheme supports file operations, a working
	 * copy that is dirty and is a child of that folder will also be returned.
	 */
	getDirty(resource: URI): IWorkingCopy[];

	//#endregion
}

export class WorkingCopyFileService extends Disposable implements IWorkingCopyFileService {

	_serviceBrand: undefined;

	//#region Events

	private readonly _onWillRunWorkingCopyFileOperation = this._register(new AsyncEmitter<WorkingCopyFileEvent>());
	readonly onWillRunWorkingCopyFileOperation = this._onWillRunWorkingCopyFileOperation.event;

	private readonly _onDidFailWorkingCopyFileOperation = this._register(new AsyncEmitter<WorkingCopyFileEvent>());
	readonly onDidFailWorkingCopyFileOperation = this._onDidFailWorkingCopyFileOperation.event;

	private readonly _onDidRunWorkingCopyFileOperation = this._register(new AsyncEmitter<WorkingCopyFileEvent>());
	readonly onDidRunWorkingCopyFileOperation = this._onDidRunWorkingCopyFileOperation.event;

	//#endregion

	private correlationIds = 0;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		// register a default working copy provider that uses the working copy service
		this.registerWorkingCopyProvider(resource => {
			return this.workingCopyService.workingCopies.filter(workingCopy => {
				if (this.fileService.canHandleResource(resource)) {
					// only check for parents if the resource can be handled
					// by the file system where we then assume a folder like
					// path structure
					return isEqualOrParent(workingCopy.resource, resource);
				}

				return isEqual(workingCopy.resource, resource);
			});
		});
	}

	async move(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		return this.moveOrCopy(source, target, true, overwrite);
	}

	async copy(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		return this.moveOrCopy(source, target, false, overwrite);
	}

	private async moveOrCopy(source: URI, target: URI, move: boolean, overwrite?: boolean): Promise<IFileStatWithMetadata> {

		// file operation participant
		await this.runFileOperationParticipants(target, source, move ? FileOperation.MOVE : FileOperation.COPY);

		// before event
		const event = { correlationId: this.correlationIds++, operation: move ? FileOperation.MOVE : FileOperation.COPY, target, source };
		await this._onWillRunWorkingCopyFileOperation.fireAsync(event, CancellationToken.None);

		// handle dirty working copies depending on the operation:
		// - move: revert both source and target (if any)
		// - copy: revert target (if any)
		const dirtyWorkingCopies = (move ? [...this.getDirty(source), ...this.getDirty(target)] : this.getDirty(target));
		await Promise.all(dirtyWorkingCopies.map(dirtyWorkingCopy => dirtyWorkingCopy.revert({ soft: true })));

		// now we can rename the source to target via file operation
		let stat: IFileStatWithMetadata;
		try {
			if (move) {
				stat = await this.fileService.move(source, target, overwrite);
			} else {
				stat = await this.fileService.copy(source, target, overwrite);
			}
		} catch (error) {

			// error event
			await this._onDidFailWorkingCopyFileOperation.fireAsync(event, CancellationToken.None);

			throw error;
		}

		// after event
		await this._onDidRunWorkingCopyFileOperation.fireAsync(event, CancellationToken.None);

		return stat;
	}

	async delete(resource: URI, options?: { useTrash?: boolean, recursive?: boolean }): Promise<void> {

		// file operation participant
		await this.runFileOperationParticipants(resource, undefined, FileOperation.DELETE);

		// before events
		const event = { correlationId: this.correlationIds++, operation: FileOperation.DELETE, target: resource };
		await this._onWillRunWorkingCopyFileOperation.fireAsync(event, CancellationToken.None);

		// Check for any existing dirty working copies for the resource
		// and do a soft revert before deleting to be able to close
		// any opened editor with these working copies
		const dirtyWorkingCopies = this.getDirty(resource);
		await Promise.all(dirtyWorkingCopies.map(dirtyWorkingCopy => dirtyWorkingCopy.revert({ soft: true })));

		// Now actually delete from disk
		try {
			await this.fileService.del(resource, options);
		} catch (error) {

			// error event
			await this._onDidFailWorkingCopyFileOperation.fireAsync(event, CancellationToken.None);

			throw error;
		}

		// after event
		await this._onDidRunWorkingCopyFileOperation.fireAsync(event, CancellationToken.None);
	}


	//#region File operation participants

	private readonly fileOperationParticipants = this._register(this.instantiationService.createInstance(WorkingCopyFileOperationParticipant));

	addFileOperationParticipant(participant: IWorkingCopyFileOperationParticipant): IDisposable {
		return this.fileOperationParticipants.addFileOperationParticipant(participant);
	}

	runFileOperationParticipants(target: URI, source: URI | undefined, operation: FileOperation): Promise<void> {
		return this.fileOperationParticipants.participate(target, source, operation);
	}

	//#endregion


	//#region Path related

	private readonly workingCopyProviders: WorkingCopyProvider[] = [];

	registerWorkingCopyProvider(provider: WorkingCopyProvider): IDisposable {
		const remove = insert(this.workingCopyProviders, provider);
		return toDisposable(remove);
	}

	getDirty(resource: URI): IWorkingCopy[] {
		const dirtyWorkingCopies = new Set<IWorkingCopy>();
		for (const provider of this.workingCopyProviders) {
			for (const workingCopy of provider(resource)) {
				if (workingCopy.isDirty()) {
					dirtyWorkingCopies.add(workingCopy);
				}
			}
		}
		return Array.from(dirtyWorkingCopies);
	}

	//#endregion
}

registerSingleton(IWorkingCopyFileService, WorkingCopyFileService, true);
