/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { ISaveOptions, IRevertOptions } from 'vs/workbench/common/editor';
import { IWorkingCopy, IWorkingCopyBackup, IWorkingCopySaveEvent, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';

/**
 * A resource based `IWorkingCopy` is backed by a `URI` from a
 * known file system provider.
 */
export interface IResourceWorkingCopy extends IWorkingCopy, IDisposable {

	/**
	 * An event for when the orphaned state of the resource working copy changes.
	 */
	readonly onDidChangeOrphaned: Event<void>;

	/**
	 * Whether the resource working copy is orphaned or not.
	 */
	isOrphaned(): boolean;

	/**
	 * An event for when the file working copy has been disposed.
	 */
	readonly onWillDispose: Event<void>;

	/**
	 * Whether the file working copy has been disposed or not.
	 */
	isDisposed(): boolean;
}

export abstract class ResourceWorkingCopy extends Disposable implements IResourceWorkingCopy {

	constructor(
		readonly resource: URI,
		@IFileService protected readonly fileService: IFileService
	) {
		super();

		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
	}

	//#region Orphaned Tracking

	private readonly _onDidChangeOrphaned = this._register(new Emitter<void>());
	readonly onDidChangeOrphaned = this._onDidChangeOrphaned.event;

	private orphaned = false;

	isOrphaned(): boolean {
		return this.orphaned;
	}

	private async onDidFilesChange(e: FileChangesEvent): Promise<void> {
		let fileEventImpactsUs = false;
		let newInOrphanModeGuess: boolean | undefined;

		// If we are currently orphaned, we check if the file was added back
		if (this.orphaned) {
			const fileWorkingCopyResourceAdded = e.contains(this.resource, FileChangeType.ADDED);
			if (fileWorkingCopyResourceAdded) {
				newInOrphanModeGuess = false;
				fileEventImpactsUs = true;
			}
		}

		// Otherwise we check if the file was deleted
		else {
			const fileWorkingCopyResourceDeleted = e.contains(this.resource, FileChangeType.DELETED);
			if (fileWorkingCopyResourceDeleted) {
				newInOrphanModeGuess = true;
				fileEventImpactsUs = true;
			}
		}

		if (fileEventImpactsUs && this.orphaned !== newInOrphanModeGuess) {
			let newInOrphanModeValidated: boolean = false;
			if (newInOrphanModeGuess) {

				// We have received reports of users seeing delete events even though the file still
				// exists (network shares issue: https://github.com/microsoft/vscode/issues/13665).
				// Since we do not want to mark the working copy as orphaned, we have to check if the
				// file is really gone and not just a faulty file event.
				await timeout(100);

				if (this.isDisposed()) {
					newInOrphanModeValidated = true;
				} else {
					const exists = await this.fileService.exists(this.resource);
					newInOrphanModeValidated = !exists;
				}
			}

			if (this.orphaned !== newInOrphanModeValidated && !this.isDisposed()) {
				this.setOrphaned(newInOrphanModeValidated);
			}
		}
	}

	protected setOrphaned(orphaned: boolean): void {
		if (this.orphaned !== orphaned) {
			this.orphaned = orphaned;

			this._onDidChangeOrphaned.fire();
		}
	}

	//#endregion


	//#region Dispose

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	private disposed = false;

	isDisposed(): boolean {
		return this.disposed;
	}

	override dispose(): void {

		// State
		this.disposed = true;
		this.orphaned = false;

		// Event
		this._onWillDispose.fire();

		super.dispose();
	}

	//#endregion

	//#region Modified Tracking

	isModified(): boolean {
		return this.isDirty();
	}

	//#endregion

	//#region Abstract

	abstract typeId: string;
	abstract name: string;
	abstract capabilities: WorkingCopyCapabilities;

	abstract onDidChangeDirty: Event<void>;
	abstract onDidChangeContent: Event<void>;
	abstract onDidSave: Event<IWorkingCopySaveEvent>;

	abstract isDirty(): boolean;

	abstract backup(token: CancellationToken): Promise<IWorkingCopyBackup>;
	abstract save(options?: ISaveOptions): Promise<boolean>;
	abstract revert(options?: IRevertOptions): Promise<void>;

	//#endregion
}
