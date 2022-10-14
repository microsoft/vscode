/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { Promises } from 'vs/base/common/async';
import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { IFileWorkingCopy, IFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';

export interface IBaseFileWorkingCopyManager<M extends IFileWorkingCopyModel, W extends IFileWorkingCopy<M>> extends IDisposable {

	/**
	 * An event for when a file working copy was created.
	 */
	readonly onDidCreate: Event<W>;

	/**
	 * Access to all known file working copies within the manager.
	 */
	readonly workingCopies: readonly W[];

	/**
	 * Returns the file working copy for the provided resource
	 * or `undefined` if none.
	 */
	get(resource: URI): W | undefined;

	/**
	 * Disposes all working copies of the manager and disposes the manager. This
	 * method is different from `dispose` in that it will unregister any working
	 * copy from the `IWorkingCopyService`. Since this impact things like backups,
	 * the method is `async` because it needs to trigger `save` for any dirty
	 * working copy to preserve the data.
	 *
	 * Callers should make sure to e.g. close any editors associated with the
	 * working copy.
	 */
	destroy(): Promise<void>;
}

export abstract class BaseFileWorkingCopyManager<M extends IFileWorkingCopyModel, W extends IFileWorkingCopy<M>> extends Disposable implements IBaseFileWorkingCopyManager<M, W> {

	private readonly _onDidCreate = this._register(new Emitter<W>());
	readonly onDidCreate = this._onDidCreate.event;

	private readonly mapResourceToWorkingCopy = new ResourceMap<W>();
	private readonly mapResourceToDisposeListener = new ResourceMap<IDisposable>();

	constructor(
		@IFileService protected readonly fileService: IFileService,
		@ILogService protected readonly logService: ILogService,
		@IWorkingCopyBackupService protected readonly workingCopyBackupService: IWorkingCopyBackupService
	) {
		super();
	}

	protected has(resource: URI): boolean {
		return this.mapResourceToWorkingCopy.has(resource);
	}

	protected add(resource: URI, workingCopy: W): void {
		const knownWorkingCopy = this.get(resource);
		if (knownWorkingCopy === workingCopy) {
			return; // already cached
		}

		// Add to our working copy map
		this.mapResourceToWorkingCopy.set(resource, workingCopy);

		// Update our dispose listener to remove it on dispose
		this.mapResourceToDisposeListener.get(resource)?.dispose();
		this.mapResourceToDisposeListener.set(resource, workingCopy.onWillDispose(() => this.remove(resource)));

		// Signal creation event
		this._onDidCreate.fire(workingCopy);
	}

	protected remove(resource: URI): boolean {

		// Dispose any existing listener
		const disposeListener = this.mapResourceToDisposeListener.get(resource);
		if (disposeListener) {
			dispose(disposeListener);
			this.mapResourceToDisposeListener.delete(resource);
		}

		// Remove from our working copy map
		return this.mapResourceToWorkingCopy.delete(resource);
	}

	//#region Get / Get all

	get workingCopies(): W[] {
		return [...this.mapResourceToWorkingCopy.values()];
	}

	get(resource: URI): W | undefined {
		return this.mapResourceToWorkingCopy.get(resource);
	}

	//#endregion

	//#region Lifecycle

	override dispose(): void {
		super.dispose();

		// Clear working copy caches
		//
		// Note: we are not explicitly disposing the working copies
		// known to the manager because this can have unwanted side
		// effects such as backups getting discarded once the working
		// copy unregisters. We have an explicit `destroy`
		// for that purpose (https://github.com/microsoft/vscode/pull/123555)
		//
		this.mapResourceToWorkingCopy.clear();

		// Dispose the dispose listeners
		dispose(this.mapResourceToDisposeListener.values());
		this.mapResourceToDisposeListener.clear();
	}

	async destroy(): Promise<void> {

		// Make sure all dirty working copies are saved to disk
		try {
			await Promises.settled(this.workingCopies.map(async workingCopy => {
				if (workingCopy.isDirty()) {
					await this.saveWithFallback(workingCopy);
				}
			}));
		} catch (error) {
			this.logService.error(error);
		}

		// Dispose all working copies
		dispose(this.mapResourceToWorkingCopy.values());

		// Finally dispose manager
		this.dispose();
	}

	private async saveWithFallback(workingCopy: W): Promise<void> {

		// First try regular save
		let saveSuccess = false;
		try {
			saveSuccess = await workingCopy.save();
		} catch (error) {
			// Ignore
		}

		// Then fallback to backup if that exists
		if (!saveSuccess || workingCopy.isDirty()) {
			const backup = await this.workingCopyBackupService.resolve(workingCopy);
			if (backup) {
				await this.fileService.writeFile(workingCopy.resource, backup.value, { unlock: true });
			}
		}
	}

	//#endregion
}
