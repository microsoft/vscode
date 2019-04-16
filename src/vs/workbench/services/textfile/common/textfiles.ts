/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IEncodingSupport, ConfirmResult, IRevertOptions } from 'vs/workbench/common/editor';
import { IReadTextFileOptions, ITextSnapshot, IBaseStatWithMetadata, IWriteTextFileOptions, IFileStatWithMetadata, IResourceEncodings } from 'vs/platform/files/common/files';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { ITextBufferFactory, ITextModel } from 'vs/editor/common/model';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const ITextFileService = createDecorator<ITextFileService>('textFileService');

export interface ITextFileService extends IDisposable {

	_serviceBrand: ServiceIdentifier<any>;

	readonly onWillMove: Event<IWillMoveEvent>;

	readonly onAutoSaveConfigurationChange: Event<IAutoSaveConfiguration>;

	readonly onFilesAssociationChange: Event<void>;

	readonly isHotExitEnabled: boolean;

	/**
	 * Access to the manager of text file editor models providing further methods to work with them.
	 */
	readonly models: ITextFileEditorModelManager;

	/**
	 * Helper to determine encoding for resources.
	 */
	readonly encoding: IResourceEncodings;

	/**
	 * A resource is dirty if it has unsaved changes or is an untitled file not yet saved.
	 *
	 * @param resource the resource to check for being dirty. If it is not specified, will check for
	 * all dirty resources.
	 */
	isDirty(resource?: URI): boolean;

	/**
	 * Returns all resources that are currently dirty matching the provided resources or all dirty resources.
	 *
	 * @param resources the resources to check for being dirty. If it is not specified, will check for
	 * all dirty resources.
	 */
	getDirty(resources?: URI[]): URI[];

	/**
	 * Saves the resource.
	 *
	 * @param resource the resource to save
	 * @param options optional save options
	 * @return true if the resource was saved.
	 */
	save(resource: URI, options?: ISaveOptions): Promise<boolean>;

	/**
	 * Saves the provided resource asking the user for a file name or using the provided one.
	 *
	 * @param resource the resource to save as.
	 * @param targetResource the optional target to save to.
	 * @param options optional save options
	 * @return Path of the saved resource.
	 */
	saveAs(resource: URI, targetResource?: URI, options?: ISaveOptions): Promise<URI | undefined>;

	/**
	 * Saves the set of resources and returns a promise with the operation result.
	 *
	 * @param resources can be null to save all.
	 * @param includeUntitled to save all resources and optionally exclude untitled ones.
	 */
	saveAll(includeUntitled?: boolean, options?: ISaveOptions): Promise<ITextFileOperationResult>;
	saveAll(resources: URI[], options?: ISaveOptions): Promise<ITextFileOperationResult>;

	/**
	 * Reverts the provided resource.
	 *
	 * @param resource the resource of the file to revert.
	 * @param force to force revert even when the file is not dirty
	 */
	revert(resource: URI, options?: IRevertOptions): Promise<boolean>;

	/**
	 * Reverts all the provided resources and returns a promise with the operation result.
	 */
	revertAll(resources?: URI[], options?: IRevertOptions): Promise<ITextFileOperationResult>;

	/**
	 * Create a file. If the file exists it will be overwritten with the contents if
	 * the options enable to overwrite.
	 */
	create(resource: URI, contents?: string | ITextSnapshot, options?: { overwrite?: boolean }): Promise<IFileStatWithMetadata>;

	/**
	 * Read the contents of a file identified by the resource.
	 */
	read(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileContent>;

	/**
	 * Read the contents of a file identified by the resource as stream.
	 */
	readStream(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileStreamContent>;

	/**
	 * Update a file with given contents.
	 */
	write(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata>;

	/**
	 * Delete a file. If the file is dirty, it will get reverted and then deleted from disk.
	 */
	delete(resource: URI, options?: { useTrash?: boolean, recursive?: boolean }): Promise<void>;

	/**
	 * Move a file. If the file is dirty, its contents will be preserved and restored.
	 */
	move(source: URI, target: URI, overwrite?: boolean): Promise<void>;

	/**
	 * Brings up the confirm dialog to either save, don't save or cancel.
	 *
	 * @param resources the resources of the files to ask for confirmation or null if
	 * confirming for all dirty resources.
	 */
	confirmSave(resources?: URI[]): Promise<ConfirmResult>;

	/**
	 * Convinient fast access to the current auto save mode.
	 */
	getAutoSaveMode(): AutoSaveMode;

	/**
	 * Convinient fast access to the raw configured auto save settings.
	 */
	getAutoSaveConfiguration(): IAutoSaveConfiguration;
}

/**
 * The save error handler can be installed on the text file editor model to install code that executes when save errors occur.
 */
export interface ISaveErrorHandler {

	/**
	 * Called whenever a save fails.
	 */
	onSaveError(error: Error, model: ITextFileEditorModel): void;
}

export interface ISaveParticipant {

	/**
	 * Participate in a save of a model. Allows to change the model before it is being saved to disk.
	 */
	participate(model: IResolvedTextFileEditorModel, env: { reason: SaveReason }): Promise<void>;
}

/**
 * States the text file editor model can be in.
 */
export const enum ModelState {

	/**
	 * A model is saved.
	 */
	SAVED,

	/**
	 * A model is dirty.
	 */
	DIRTY,

	/**
	 * A model is transitioning from dirty to saved.
	 */
	PENDING_SAVE,

	/**
	 * A model is in conflict mode when changes cannot be saved because the
	 * underlying file has changed. Models in conflict mode are always dirty.
	 */
	CONFLICT,

	/**
	 * A model is in orphan state when the underlying file has been deleted.
	 */
	ORPHAN,

	/**
	 * Any error that happens during a save that is not causing the CONFLICT state.
	 * Models in error mode are always diry.
	 */
	ERROR
}

export const enum StateChange {
	DIRTY,
	SAVING,
	SAVE_ERROR,
	SAVED,
	REVERTED,
	ENCODING,
	CONTENT_CHANGE,
	ORPHANED_CHANGE
}

export class TextFileModelChangeEvent {
	private _resource: URI;

	constructor(model: ITextFileEditorModel, private _kind: StateChange) {
		this._resource = model.getResource();
	}

	get resource(): URI {
		return this._resource;
	}

	get kind(): StateChange {
		return this._kind;
	}
}

export const AutoSaveContext = new RawContextKey<string>('config.files.autoSave', undefined);

export interface ITextFileOperationResult {
	results: IResult[];
}

export interface IResult {
	source: URI;
	target?: URI;
	success?: boolean;
}

export interface IAutoSaveConfiguration {
	autoSaveDelay?: number;
	autoSaveFocusChange: boolean;
	autoSaveApplicationChange: boolean;
}

export const enum AutoSaveMode {
	OFF,
	AFTER_SHORT_DELAY,
	AFTER_LONG_DELAY,
	ON_FOCUS_CHANGE,
	ON_WINDOW_CHANGE
}

export const enum SaveReason {
	EXPLICIT = 1,
	AUTO = 2,
	FOCUS_CHANGE = 3,
	WINDOW_CHANGE = 4
}

export const enum LoadReason {
	EDITOR = 1,
	REFERENCE = 2,
	OTHER = 3
}

interface IBaseTextFileContent extends IBaseStatWithMetadata {

	/**
	 * The encoding of the content if known.
	 */
	encoding: string;
}

export interface ITextFileContent extends IBaseTextFileContent {

	/**
	 * The content of a text file.
	 */
	value: string;
}

export interface ITextFileStreamContent extends IBaseTextFileContent {

	/**
	 * The line grouped content of a text file.
	 */
	value: ITextBufferFactory;
}

export interface IModelLoadOrCreateOptions {

	/**
	 * Context why the model is being loaded or created.
	 */
	reason?: LoadReason;

	/**
	 * The encoding to use when resolving the model text content.
	 */
	encoding?: string;

	/**
	 * If the model was already loaded before, allows to trigger
	 * a reload of it to fetch the latest contents:
	 * - async: loadOrCreate() will return immediately and trigger
	 * a reload that will run in the background.
	 * - sync: loadOrCreate() will only return resolved when the
	 * model has finished reloading.
	 */
	reload?: {
		async: boolean
	};

	/**
	 * Allow to load a model even if we think it is a binary file.
	 */
	allowBinary?: boolean;
}

export interface ITextFileEditorModelManager {

	readonly onModelDisposed: Event<URI>;
	readonly onModelContentChanged: Event<TextFileModelChangeEvent>;
	readonly onModelEncodingChanged: Event<TextFileModelChangeEvent>;

	readonly onModelDirty: Event<TextFileModelChangeEvent>;
	readonly onModelSaveError: Event<TextFileModelChangeEvent>;
	readonly onModelSaved: Event<TextFileModelChangeEvent>;
	readonly onModelReverted: Event<TextFileModelChangeEvent>;
	readonly onModelOrphanedChanged: Event<TextFileModelChangeEvent>;

	readonly onModelsDirty: Event<TextFileModelChangeEvent[]>;
	readonly onModelsSaveError: Event<TextFileModelChangeEvent[]>;
	readonly onModelsSaved: Event<TextFileModelChangeEvent[]>;
	readonly onModelsReverted: Event<TextFileModelChangeEvent[]>;

	get(resource: URI): ITextFileEditorModel | undefined;

	getAll(resource?: URI): ITextFileEditorModel[];

	loadOrCreate(resource: URI, options?: IModelLoadOrCreateOptions): Promise<ITextFileEditorModel>;

	disposeModel(model: ITextFileEditorModel): void;
}

export interface ISaveOptions {
	force?: boolean;
	reason?: SaveReason;
	overwriteReadonly?: boolean;
	overwriteEncoding?: boolean;
	skipSaveParticipants?: boolean;
	writeElevated?: boolean;
}

export interface ILoadOptions {

	/**
	 * Go to disk bypassing any cache of the model if any.
	 */
	forceReadFromDisk?: boolean;

	/**
	 * Allow to load a model even if we think it is a binary file.
	 */
	allowBinary?: boolean;

	/**
	 * Context why the model is being loaded.
	 */
	reason?: LoadReason;
}

export interface ITextFileEditorModel extends ITextEditorModel, IEncodingSupport {

	readonly onDidContentChange: Event<StateChange>;
	readonly onDidStateChange: Event<StateChange>;

	getVersionId(): number;

	getResource(): URI;

	hasState(state: ModelState): boolean;

	getETag(): string | null;

	updatePreferredEncoding(encoding: string): void;

	save(options?: ISaveOptions): Promise<void>;

	load(options?: ILoadOptions): Promise<ITextFileEditorModel>;

	revert(soft?: boolean): Promise<void>;

	createSnapshot(): ITextSnapshot | null;

	isDirty(): boolean;

	isResolved(): boolean;

	isDisposed(): boolean;
}

export interface IResolvedTextFileEditorModel extends ITextFileEditorModel {
	readonly textEditorModel: ITextModel;

	createSnapshot(): ITextSnapshot;
}

export interface IWillMoveEvent {
	oldResource: URI;
	newResource: URI;

	waitUntil(p: Promise<unknown>): void;
}
