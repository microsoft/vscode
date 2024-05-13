/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { bufferToStream, VSBuffer, VSBufferReadableStream } from 'vs/base/common/buffer';
import { IWorkingCopyBackup, IWorkingCopySaveEvent, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IFileWorkingCopy, IFileWorkingCopyModel, IFileWorkingCopyModelFactory, SnapshotContext } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { Disposable } from 'vs/base/common/lifecycle';
import { toReadable } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ISaveOptions } from 'vs/workbench/common/editor';
import { raceCancellation } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';

/**
 * Untitled file specific working copy model factory.
 */
export interface ITextContentFileWorkingCopyModelFactory<M extends ITextContentFileWorkingCopyModel> extends IFileWorkingCopyModelFactory<M> { }

/**
 * The underlying model of a untitled file working copy provides
 * some methods for the untitled file working copy to function.
 * The model is typically only available after the working copy
 * has been resolved via it's `resolve()` method.
 */
export interface ITextContentFileWorkingCopyModel extends IFileWorkingCopyModel {

	readonly onDidChangeContent: Event<ITextContentFileWorkingCopyModelContentChangedEvent>;
}

export interface ITextContentFileWorkingCopyModelContentChangedEvent {

	/**
	 * Flag that indicates that the content change should
	 * clear the dirty/modified flags, e.g. because the contents are
	 * back to being empty or back to an initial state that
	 * should not be considered as modified.
	 */
	readonly isInitial: boolean;
}

export interface ITextContentFileWorkingCopy<M extends ITextContentFileWorkingCopyModel> extends IFileWorkingCopy<M> {

	/**
	 * Whether this untitled file working copy model has an associated file path.
	 */
	readonly hasAssociatedFilePath: boolean;

	/**
	 * Whether we have a resolved model or not.
	 */
	isResolved(): this is IResolvedTextContentFileWorkingCopy<M>;
}

export interface IResolvedTextContentFileWorkingCopy<M extends ITextContentFileWorkingCopyModel> extends ITextContentFileWorkingCopy<M> {

	/**
	 * A resolved untitled file working copy has a resolved model.
	 */
	readonly model: M;
}

export interface ITextContentFileWorkingCopySaveDelegate<M extends ITextContentFileWorkingCopyModel> {

	/**
	 * A delegate to enable saving of untitled file working copies.
	 */
	(workingCopy: ITextContentFileWorkingCopy<M>, options?: ISaveOptions): Promise<boolean>;
}

export interface ITextContentFileWorkingCopyInitialContents {

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

export class TextContentFileWorkingCopy<M extends ITextContentFileWorkingCopyModel> extends Disposable implements ITextContentFileWorkingCopy<M> {

	readonly capabilities: WorkingCopyCapabilities = WorkingCopyCapabilities.None;

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
		private readonly initialContents: ITextContentFileWorkingCopyInitialContents | undefined,
		private readonly modelFactory: ITextContentFileWorkingCopyModelFactory<M>,
		private readonly saveDelegate: ITextContentFileWorkingCopySaveDelegate<M>,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		// Make known to working copy service
		this._register(workingCopyService.registerWorkingCopy(this));
	}

	//#region Dirty/Modified

	private modified = this.hasAssociatedFilePath || Boolean(this.initialContents && this.initialContents.markModified !== false);

	isDirty(): boolean {
		return this.modified;
	}

	isModified(): boolean {
		return this.modified;
	}

	private setModified(modified: boolean): void {
		if (this.modified === modified) {
			return;
		}

		this.modified = modified;
		this._onDidChangeDirty.fire();
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

		const model = await this.textModelService.createModelReference(this.resource);

		// Create model
		await this.doCreateModel(model.object);

		// Untitled associated to file path are modified right away as well as untitled with content
		this.setModified(false);

		// If we have initial contents, make sure to emit this
		// as the appropriate events to the outside.
		if (this.initialContents) {
			this._onDidChangeContent.fire();
		}
	}

	private async doCreateModel(model: IResolvedTextEditorModel): Promise<void> {
		this.trace('doCreateModel()');

		// Create model and dispose it when we get disposed
		const contents = model.textEditorModel.getValue();
		const readable = bufferToStream(VSBuffer.fromString(contents)) as VSBufferReadableStream;
		this._model = this._register(await this.modelFactory.createModel(this.resource, readable, CancellationToken.None));

		// Model listeners
		this.installModelListeners(this._model);
	}

	private installModelListeners(model: M): void {

		// Content Change
		this._register(model.onDidChangeContent(e => this.onModelContentChanged(e)));

		// Lifecycle
		this._register(model.onWillDispose(() => this.dispose()));
	}

	private onModelContentChanged(e: ITextContentFileWorkingCopyModelContentChangedEvent): void {

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

	isResolved(): this is IResolvedTextContentFileWorkingCopy<M> {
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
