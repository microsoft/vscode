/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { IWorkingCopyBackup, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IFileWorkingCopy, IFileWorkingCopyModel, IFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ISaveOptions } from 'vs/workbench/common/editor';
import { raceCancellation } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { emptyStream } from 'vs/base/common/stream';

/**
 * Untitled file specific working copy model factory.
 */
export interface IUntitledFileWorkingCopyModelFactory<M extends IUntitledFileWorkingCopyModel> extends IFileWorkingCopyModelFactory<M> { }

/**
 * The underlying model of a untitled file working copy provides
 * some methods for the untitled file working copy to function.
 * The model is typically only available after the working copy
 * has been resolved via it's `resolve()` method.
 */
export interface IUntitledFileWorkingCopyModel extends IFileWorkingCopyModel {

	readonly onDidChangeContent: Event<IUntitledFileWorkingCopyModelContentChangedEvent>;
}

export interface IUntitledFileWorkingCopyModelContentChangedEvent {

	/**
	 * Flag that indicates that the content change should
	 * clear the dirty flag, e.g. because the contents are
	 * back to being empty or back to an initial state that
	 * should not be considered as dirty.
	 */
	readonly isInitial: boolean;
}

export interface IUntitledFileWorkingCopy<M extends IUntitledFileWorkingCopyModel> extends IFileWorkingCopy<M> {

	/**
	 * Whether this untitled file working copy model has an associated file path.
	 */
	readonly hasAssociatedFilePath: boolean;

	/**
	 * Whether we have a resolved model or not.
	 */
	isResolved(): this is IResolvedUntitledFileWorkingCopy<M>;
}

export interface IResolvedUntitledFileWorkingCopy<M extends IUntitledFileWorkingCopyModel> extends IUntitledFileWorkingCopy<M> {

	/**
	 * A resolved untitled file working copy has a resolved model.
	 */
	readonly model: M;
}

export interface IUntitledFileWorkingCopySaveDelegate<M extends IUntitledFileWorkingCopyModel> {

	/**
	 * A delegate to enable saving of untitled file working copies.
	 */
	(workingCopy: IUntitledFileWorkingCopy<M>, options?: ISaveOptions): Promise<boolean>;
}

export interface IUntitledFileWorkingCopyInitialContents {

	/**
	 * The initial contents of the untitled file working copy.
	 */
	readonly value: VSBufferReadableStream;

	/**
	 * If not provided, the untitled file working copy will be marked
	 * dirty by default given initial contents are provided.
	 *
	 * Note: if the untitled file working copy has an associated path
	 * the dirty state will always be set.
	 */
	readonly markDirty?: boolean;
}

export class UntitledFileWorkingCopy<M extends IUntitledFileWorkingCopyModel> extends Disposable implements IUntitledFileWorkingCopy<M>  {

	readonly capabilities = WorkingCopyCapabilities.Untitled;

	private _model: M | undefined = undefined;
	get model(): M | undefined { return this._model; }

	//#region Events

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidRevert = this._register(new Emitter<void>());
	readonly onDidRevert = this._onDidRevert.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	//#endregion

	constructor(
		readonly typeId: string,
		readonly resource: URI,
		readonly name: string,
		readonly hasAssociatedFilePath: boolean,
		private readonly initialContents: IUntitledFileWorkingCopyInitialContents | undefined,
		private readonly modelFactory: IUntitledFileWorkingCopyModelFactory<M>,
		private readonly saveDelegate: IUntitledFileWorkingCopySaveDelegate<M>,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		// Make known to working copy service
		this._register(workingCopyService.registerWorkingCopy(this));
	}

	//#region Dirty

	private dirty = this.hasAssociatedFilePath || Boolean(this.initialContents && this.initialContents.markDirty !== false);

	isDirty(): boolean {
		return this.dirty;
	}

	private setDirty(dirty: boolean): void {
		if (this.dirty === dirty) {
			return;
		}

		this.dirty = dirty;
		this._onDidChangeDirty.fire();
	}

	//#endregion


	//#region Resolve

	async resolve(): Promise<void> {
		this.trace('[untitled file working copy] resolve()');

		if (this.isResolved()) {
			this.trace('[untitled file working copy] resolve() - exit (already resolved)');

			// return early if the untitled file working copy is already
			// resolved assuming that the contents have meanwhile changed
			// in the underlying model. we only resolve untitled once.
			return;
		}

		let untitledContents: VSBufferReadableStream;

		// Check for backups or use initial value or empty
		const backup = await this.workingCopyBackupService.resolve(this);
		if (backup) {
			this.trace('[untitled file working copy] resolve() - with backup');

			untitledContents = backup.value;
		} else if (this.initialContents?.value) {
			this.trace('[untitled file working copy] resolve() - with initial contents');

			untitledContents = this.initialContents.value;
		} else {
			this.trace('[untitled file working copy] resolve() - empty');

			untitledContents = emptyStream();
		}

		// Create model
		await this.doCreateModel(untitledContents);

		// Untitled associated to file path are dirty right away as well as untitled with content
		this.setDirty(this.hasAssociatedFilePath || !!backup || Boolean(this.initialContents && this.initialContents.markDirty !== false));

		// If we have initial contents, make sure to emit this
		// as the appropiate events to the outside.
		if (!!backup || this.initialContents) {
			this._onDidChangeContent.fire();
		}
	}

	private async doCreateModel(contents: VSBufferReadableStream): Promise<void> {
		this.trace('[untitled file working copy] doCreateModel()');

		// Create model and dispose it when we get disposed
		this._model = this._register(await this.modelFactory.createModel(this.resource, contents, CancellationToken.None));

		// Model listeners
		this.installModelListeners(this._model);
	}

	private installModelListeners(model: M): void {

		// Content Change
		this._register(model.onDidChangeContent(e => this.onModelContentChanged(e)));

		// Lifecycle
		this._register(model.onWillDispose(() => this.dispose()));
	}

	private onModelContentChanged(e: IUntitledFileWorkingCopyModelContentChangedEvent): void {

		// Mark the untitled file working copy as non-dirty once its
		// in case provided by the change event and in case we do not
		// have an associated path set
		if (!this.hasAssociatedFilePath && e.isInitial) {
			this.setDirty(false);
		}

		// Turn dirty otherwise
		else {
			this.setDirty(true);
		}

		// Emit as general content change event
		this._onDidChangeContent.fire();
	}

	isResolved(): this is IResolvedUntitledFileWorkingCopy<M> {
		return !!this.model;
	}

	//#endregion


	//#region Backup

	async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {

		// Fill in content if we are resolved
		let content: VSBufferReadableStream | undefined = undefined;
		if (this.isResolved()) {
			content = await raceCancellation(this.model.snapshot(token), token);
		}

		return { content };
	}

	//#endregion


	//#region Save

	save(options?: ISaveOptions): Promise<boolean> {
		this.trace('[untitled file working copy] save()');

		return this.saveDelegate(this, options);
	}

	//#endregion


	//#region Revert

	async revert(): Promise<void> {
		this.trace('[untitled file working copy] revert()');

		// No longer dirty
		this.setDirty(false);

		// Emit as event
		this._onDidRevert.fire();

		// A reverted untitled file working copy is invalid
		// because it has no actual source on disk to revert to.
		// As such we dispose the model.
		this.dispose();
	}

	//#endregion

	override dispose(): void {
		this.trace('[untitled file working copy] dispose()');

		this._onWillDispose.fire();

		super.dispose();
	}

	private trace(msg: string): void {
		this.logService.trace(msg, this.resource.toString(true), this.typeId);
	}
}
