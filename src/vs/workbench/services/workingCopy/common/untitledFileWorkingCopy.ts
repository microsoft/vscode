/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../../base/common/event.js';
import { VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { IWorkingCopyBackup, IWorkingCopySaveEvent, WorkingCopyCapabilities } from './workingCopy.js';
import { IFileWorkingCopy, IFileWorkingCopyModel, IFileWorkingCopyModelFactory, SnapshotContext } from './fileWorkingCopy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkingCopyService } from './workingCopyService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ISaveOptions } from '../../../common/editor.js';
import { raceCancellation } from '../../../../base/common/async.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkingCopyBackupService } from './workingCopyBackup.js';
import { emptyStream } from '../../../../base/common/stream.js';

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
	 * clear the dirty/modified flags, e.g. because the contents are
	 * back to being empty or back to an initial state that
	 * should not be considered as modified.
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
	 * modified by default given initial contents are provided.
	 *
	 * Note: if the untitled file working copy has an associated path
	 * the modified state will always be set.
	 */
	readonly markModified?: boolean;
}

export class UntitledFileWorkingCopy<M extends IUntitledFileWorkingCopyModel> extends Disposable implements IUntitledFileWorkingCopy<M> {

	readonly capabilities: WorkingCopyCapabilities;

	private _model: M | undefined = undefined;
	get model(): M | undefined { return this._model; }

	//#region Events

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidSave = this._register(new Emitter<IWorkingCopySaveEvent>());
	readonly onDidSave = this._onDidSave.event;

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
		private readonly isScratchpad: boolean,
		private readonly initialContents: IUntitledFileWorkingCopyInitialContents | undefined,
		private readonly modelFactory: IUntitledFileWorkingCopyModelFactory<M>,
		private readonly saveDelegate: IUntitledFileWorkingCopySaveDelegate<M>,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.capabilities = this.isScratchpad ? WorkingCopyCapabilities.Untitled | WorkingCopyCapabilities.Scratchpad : WorkingCopyCapabilities.Untitled;
		this.modified = this.hasAssociatedFilePath || Boolean(this.initialContents && this.initialContents.markModified !== false);

		// Make known to working copy service
		this._register(workingCopyService.registerWorkingCopy(this));
	}

	//#region Dirty/Modified

	private modified: boolean;

	isDirty(): boolean {
		return this.modified && !this.isScratchpad; // Scratchpad working copies are never dirty
	}

	isModified(): boolean {
		return this.modified;
	}

	private setModified(modified: boolean): void {
		if (this.modified === modified) {
			return;
		}

		this.modified = modified;
		if (!this.isScratchpad) {
			this._onDidChangeDirty.fire();
		}
	}

	//#endregion


	//#region Resolve

	async resolve(): Promise<void> {
		this.trace('resolve()');

		if (this.isResolved()) {
			this.trace('resolve() - exit (already resolved)');

			// return early if the untitled file working copy is already
			// resolved assuming that the contents have meanwhile changed
			// in the underlying model. we only resolve untitled once.
			return;
		}

		let untitledContents: VSBufferReadableStream;

		// Check for backups or use initial value or empty
		const backup = await this.workingCopyBackupService.resolve(this);
		if (backup) {
			this.trace('resolve() - with backup');

			untitledContents = backup.value;
		} else if (this.initialContents?.value) {
			this.trace('resolve() - with initial contents');

			untitledContents = this.initialContents.value;
		} else {
			this.trace('resolve() - empty');

			untitledContents = emptyStream();
		}

		// Create model
		await this.doCreateModel(untitledContents);

		// Untitled associated to file path are modified right away as well as untitled with content
		this.setModified(this.hasAssociatedFilePath || !!backup || Boolean(this.initialContents && this.initialContents.markModified !== false));

		// If we have initial contents, make sure to emit this
		// as the appropriate events to the outside.
		if (!!backup || this.initialContents) {
			this._onDidChangeContent.fire();
		}
	}

	private async doCreateModel(contents: VSBufferReadableStream): Promise<void> {
		this.trace('doCreateModel()');

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

		// Mark the untitled file working copy as non-modified once its
		// in case provided by the change event and in case we do not
		// have an associated path set
		if (!this.hasAssociatedFilePath && e.isInitial) {
			this.setModified(false);
		}

		// Turn modified otherwise
		else {
			this.setModified(true);
		}

		// Emit as general content change event
		this._onDidChangeContent.fire();
	}

	isResolved(): this is IResolvedUntitledFileWorkingCopy<M> {
		return !!this.model;
	}

	//#endregion


	//#region Backup

	get backupDelay(): number | undefined {
		return this.model?.configuration?.backupDelay;
	}

	async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {
		let content: VSBufferReadableStream | undefined = undefined;

		// Make sure to check whether this working copy has been
		// resolved or not and fallback to the initial value -
		// if any - to prevent backing up an unresolved working
		// copy and loosing the initial value.
		if (this.isResolved()) {
			content = await raceCancellation(this.model.snapshot(SnapshotContext.Backup, token), token);
		} else if (this.initialContents) {
			content = this.initialContents.value;
		}

		return { content };
	}

	//#endregion


	//#region Save

	async save(options?: ISaveOptions): Promise<boolean> {
		this.trace('save()');

		const result = await this.saveDelegate(this, options);

		// Emit Save Event
		if (result) {
			this._onDidSave.fire({ reason: options?.reason, source: options?.source });
		}

		return result;
	}

	//#endregion


	//#region Revert

	async revert(): Promise<void> {
		this.trace('revert()');

		// No longer modified
		this.setModified(false);

		// Emit as event
		this._onDidRevert.fire();

		// A reverted untitled file working copy is invalid
		// because it has no actual source on disk to revert to.
		// As such we dispose the model.
		this.dispose();
	}

	//#endregion

	override dispose(): void {
		this.trace('dispose()');

		this._onWillDispose.fire();

		super.dispose();
	}

	private trace(msg: string): void {
		this.logService.trace(`[untitled file working copy] ${msg}`, this.resource.toString(), this.typeId);
	}
}
