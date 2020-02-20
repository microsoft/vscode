/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, AsyncEmitter, IWaitUntil } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService, FileOperation, IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IWorkingCopyService, IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { isEqualOrParent, isEqual } from 'vs/base/common/resources';

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
	 * An event that is fired before attempting a certain working copy IO operation.
	 *
	 * Participants can join this event with a long running operation to make changes
	 * to the working copy before the operation starts.
	 */
	readonly onBeforeWorkingCopyFileOperation: Event<WorkingCopyFileEvent>;

	/**
	 * An event that is fired when a certain working copy IO operation is about to run.
	 *
	 * Participants can join this event with a long running operation to keep some state
	 * before the operation is started, but working copies should not be changed at this
	 * point in time.
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

	private readonly _onBeforeWorkingCopyFileOperation = this._register(new AsyncEmitter<WorkingCopyFileEvent>());
	readonly onBeforeWorkingCopyFileOperation = this._onBeforeWorkingCopyFileOperation.event;

	private readonly _onWillRunWorkingCopyFileOperation = this._register(new AsyncEmitter<WorkingCopyFileEvent>());
	readonly onWillRunWorkingCopyFileOperation = this._onWillRunWorkingCopyFileOperation.event;

	private readonly _onDidFailWorkingCopyFileOperation = this._register(new AsyncEmitter<WorkingCopyFileEvent>());
	readonly onDidFailWorkingCopyFileOperation = this._onDidFailWorkingCopyFileOperation.event;

	private readonly _onDidRunWorkingCopyFileOperation = this._register(new AsyncEmitter<WorkingCopyFileEvent>());
	readonly onDidRunWorkingCopyFileOperation = this._onDidRunWorkingCopyFileOperation.event;

	//#endregion

	private correlationIds = 0;

	constructor(
		@IFileService private fileService: IFileService,
		@IWorkingCopyService private workingCopyService: IWorkingCopyService
	) {
		super();
	}

	async move(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		return this.moveOrCopy(source, target, true, overwrite);
	}

	async copy(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		return this.moveOrCopy(source, target, false, overwrite);
	}

	private async moveOrCopy(source: URI, target: URI, move: boolean, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		const event = { correlationId: this.correlationIds++, operation: move ? FileOperation.MOVE : FileOperation.COPY, target, source };

		// before events
		await this._onBeforeWorkingCopyFileOperation.fireAsync(event, CancellationToken.None);
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
		const event = { correlationId: this.correlationIds++, operation: FileOperation.DELETE, target: resource };

		// before events
		await this._onBeforeWorkingCopyFileOperation.fireAsync(event, CancellationToken.None);
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


	//#region Path related

	getDirty(resource: URI): IWorkingCopy[] {
		return this.workingCopyService.dirtyWorkingCopies.filter(dirty => {
			if (this.fileService.canHandleResource(resource)) {
				// only check for parents if the resource can be handled
				// by the file system where we then assume a folder like
				// path structure
				return isEqualOrParent(dirty.resource, resource);
			}

			return isEqual(dirty.resource, resource);
		});
	}

	//#endregion
}

registerSingleton(IWorkingCopyFileService, WorkingCopyFileService, true);
