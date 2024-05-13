/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ITextContentFileWorkingCopy, ITextContentFileWorkingCopyInitialContents, ITextContentFileWorkingCopyModel, ITextContentFileWorkingCopyModelFactory, ITextContentFileWorkingCopySaveDelegate, TextContentFileWorkingCopy } from 'vs/workbench/services/workingCopy/common/textContentFileWorkingCopy';
import { Event, Emitter } from 'vs/base/common/event';
import { Schemas } from 'vs/base/common/network';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { IFileService } from 'vs/platform/files/common/files';
import { BaseFileWorkingCopyManager, IBaseFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/abstractFileWorkingCopyManager';
import { ResourceMap } from 'vs/base/common/map';
import { ITextModelService } from 'vs/editor/common/services/resolverService';

/**
 * The only one that should be dealing with `ITextContentFileWorkingCopy` and
 * handle all operations that are working copy related, such as save/revert,
 * backup and resolving.
 */
export interface ITextContentFileWorkingCopyManager<M extends ITextContentFileWorkingCopyModel> extends IBaseFileWorkingCopyManager<M, ITextContentFileWorkingCopy<M>> {

	/**
	 * An event for when a untitled file working copy changed it's dirty state.
	 */
	readonly onDidChangeDirty: Event<ITextContentFileWorkingCopy<M>>;

	/**
	 * An event for when a untitled file working copy is about to be disposed.
	 */
	readonly onWillDispose: Event<ITextContentFileWorkingCopy<M>>;

	/**
	 * TODO - foo bar biz. DO_NOT_SUBMIT Add a docstring here and clarify if options are required.
	 */
	resolve(uri: URI, options?: ITextContentFileWorkingCopyResolveOptions): Promise<ITextContentFileWorkingCopy<M>>;
}

export interface ITextContentFileWorkingCopyResolveOptions {
	readonly contents?: VSBufferReadableStream;
}

type IInternalTextContentFileWorkingCopyOptions = ITextContentFileWorkingCopyResolveOptions;

export class TextContentFileWorkingCopyManager<M extends ITextContentFileWorkingCopyModel> extends BaseFileWorkingCopyManager<M, ITextContentFileWorkingCopy<M>> implements ITextContentFileWorkingCopyManager<M> {

	//#region Events

	private readonly _onDidChangeDirty = this._register(new Emitter<ITextContentFileWorkingCopy<M>>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onWillDispose = this._register(new Emitter<ITextContentFileWorkingCopy<M>>());
	readonly onWillDispose = this._onWillDispose.event;

	//#endregion

	private readonly mapResourceToWorkingCopyListeners = new ResourceMap<IDisposable>();

	constructor(
		private readonly workingCopyTypeId: string,
		private readonly modelFactory: ITextContentFileWorkingCopyModelFactory<M>,
		private readonly saveDelegate: ITextContentFileWorkingCopySaveDelegate<M>,
		@IFileService fileService: IFileService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService logService: ILogService,
		@IWorkingCopyBackupService workingCopyBackupService: IWorkingCopyBackupService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService
	) {
		super(fileService, logService, workingCopyBackupService);
	}

	//#region Resolve

	async resolve(uri: URI, options?: ITextContentFileWorkingCopyResolveOptions): Promise<ITextContentFileWorkingCopy<M>> {
		const workingCopy = this.doCreateOrGet(uri, options);
		await workingCopy.resolve();

		return workingCopy;
	}

	private doCreateOrGet(uri: URI, options: ITextContentFileWorkingCopyResolveOptions = Object.create(null)): ITextContentFileWorkingCopy<M> {
		const existingWorkingCopy = this.get(uri);
		if (existingWorkingCopy) {
			return existingWorkingCopy;
		}

		// Create new instance otherwise
		return this.doCreate(uri, options);
	}

	private doCreate(uri: URI, options: ITextContentFileWorkingCopyResolveOptions): ITextContentFileWorkingCopy<M> {
		// Create new working copy with provided options
		const workingCopy = new TextContentFileWorkingCopy(
			this.workingCopyTypeId,
			uri,
			this.labelService.getUriBasenameLabel(uri),
			/* hasAssociatedFilePath */ false,
			options.contents ? { value: options.contents } : undefined,
			this.modelFactory,
			this.saveDelegate,
			this.textModelService,
			this.workingCopyService,
			this.logService
		);

		// Register
		this.registerWorkingCopy(workingCopy);

		return workingCopy;
	}

	private registerWorkingCopy(workingCopy: ITextContentFileWorkingCopy<M>): void {

		// Install working copy listeners
		const workingCopyListeners = new DisposableStore();
		workingCopyListeners.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));
		workingCopyListeners.add(workingCopy.onWillDispose(() => this._onWillDispose.fire(workingCopy)));

		// Keep for disposal
		this.mapResourceToWorkingCopyListeners.set(workingCopy.resource, workingCopyListeners);

		// Add to cache
		this.add(workingCopy.resource, workingCopy);

		// If the working copy is dirty right from the beginning,
		// make sure to emit this as an event
		if (workingCopy.isDirty()) {
			this._onDidChangeDirty.fire(workingCopy);
		}
	}

	protected override remove(resource: URI): boolean {
		const removed = super.remove(resource);

		// Dispose any existing working copy listeners
		const workingCopyListener = this.mapResourceToWorkingCopyListeners.get(resource);
		if (workingCopyListener) {
			dispose(workingCopyListener);
			this.mapResourceToWorkingCopyListeners.delete(resource);
		}

		return removed;
	}

	//#endregion

	//#region Lifecycle

	override dispose(): void {
		super.dispose();

		// Dispose the working copy change listeners
		dispose(this.mapResourceToWorkingCopyListeners.values());
		this.mapResourceToWorkingCopyListeners.clear();
	}

	//#endregion
}
