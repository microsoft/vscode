/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Event as BaseEvent, PropertyChangeEvent} from 'vs/base/common/events';
import URI from 'vs/base/common/uri';
import Event from 'vs/base/common/event';
import {IModel, IEditorOptions, IRawText} from 'vs/editor/common/editorCommon';
import {IDisposable} from 'vs/base/common/lifecycle';
import {EncodingMode, EditorInput, IFileEditorInput, ConfirmResult, IWorkbenchEditorConfiguration, IEditorDescriptor} from 'vs/workbench/common/editor';
import {IFileStat, IFilesConfiguration, IBaseStat, IResolveContentOptions} from 'vs/platform/files/common/files';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {FileStat} from 'vs/workbench/parts/files/common/explorerViewModel';

/**
 * Explorer viewlet id.
 */
export const VIEWLET_ID = 'workbench.view.explorer';

/**
 * File editor input id.
 */
export const FILE_EDITOR_INPUT_ID = 'workbench.editors.files.fileEditorInput';

/**
 * Text file editor id.
 */
export const TEXT_FILE_EDITOR_ID = 'workbench.editors.files.textFileEditor';

/**
 * Binary file editor id.
 */
export const BINARY_FILE_EDITOR_ID = 'workbench.editors.files.binaryFileEditor';

/**
 * API class to denote file editor inputs. Internal implementation is provided.
 *
 * Note: This class is not intended to be instantiated.
 */
export abstract class FileEditorInput extends EditorInput implements IFileEditorInput {

	public abstract setResource(resource: URI): void;

	public abstract getResource(): URI;

	public abstract setMime(mime: string): void;

	public abstract getMime(): string;

	public abstract setPreferredEncoding(encoding: string): void;

	public abstract setEncoding(encoding: string, mode: EncodingMode): void;

	public abstract getEncoding(): string;
}

export interface IFilesConfiguration extends IFilesConfiguration, IWorkbenchEditorConfiguration {
	explorer: {
		openEditors: {
			visible: number;
			dynamicHeight: boolean;
		};
		autoReveal: boolean;
		enableDragAndDrop: boolean;
	};
	editor: IEditorOptions;
}

export interface IFileResource {
	resource: URI;
	isDirectory: boolean;
	mimes: string[];
}

/**
 * Helper to get a file resource from an object.
 */
export function asFileResource(obj: any): IFileResource {
	if (obj instanceof FileStat) {
		let stat = <FileStat>obj;

		return {
			resource: stat.resource,
			mimes: stat.mime ? stat.mime.split(', ') : [],
			isDirectory: stat.isDirectory
		};
	}

	return null;
}

/**
 * List of event types from files.
 */
export const EventType = {

	/**
	 * Indicates that a file content has changed but not yet saved.
	 */
	FILE_DIRTY: 'files:fileDirty',

	/**
	 * Indicates that a file is being saved.
	 */
	FILE_SAVING: 'files:fileSaving',

	/**
	 * Indicates that a file save resulted in an error.
	 */
	FILE_SAVE_ERROR: 'files:fileSaveError',

	/**
	 * Indicates that a file content has been saved to the disk.
	 */
	FILE_SAVED: 'files:fileSaved',

	/**
	 * Indicates that a file content has been reverted to the state
	 * on disk.
	 */
	FILE_REVERTED: 'files:fileReverted'
};

/**
 * States the text text file editor model can be in.
 */
export enum ModelState {
	SAVED,
	DIRTY,
	PENDING_SAVE,
	CONFLICT,
	ERROR
}

/**
 * Local file change events are being emitted when a file is added, removed, moved or its contents got updated. These events
 * are being emitted from within the workbench and are not reflecting the truth on the disk file system. For that, please
 * use FileChangesEvent instead.
 */
export class LocalFileChangeEvent extends PropertyChangeEvent {

	constructor(before?: IFileStat, after?: IFileStat, originalEvent?: BaseEvent) {
		super(null, before, after, originalEvent);
	}

	/**
	 * Returns the meta information of the file before the event occurred or null if the file is new.
	 */
	public getBefore(): IFileStat {
		return this.oldValue;
	}

	/**
	 * Returns the meta information of the file after the event occurred or null if the file got deleted.
	 */
	public getAfter(): IFileStat {
		return this.newValue;
	}

	/**
	 * Indicates if the file was added as a new file.
	 */
	public gotAdded(): boolean {
		return !this.oldValue && !!this.newValue;
	}

	/**
	 * Indicates if the file was moved to a different path.
	 */
	public gotMoved(): boolean {
		return !!this.oldValue && !!this.newValue && this.oldValue.resource.toString() !== this.newValue.resource.toString();
	}

	/**
	 * Indicates if the files metadata was updated.
	 */
	public gotUpdated(): boolean {
		return !!this.oldValue && !!this.newValue && !this.gotMoved() && this.oldValue !== this.newValue;
	}

	/**
	 * Indicates if the file was deleted.
	 */
	public gotDeleted(): boolean {
		return !!this.oldValue && !this.newValue;
	}
}

/**
 * Text file change events are emitted when files are saved or reverted.
 */
export class TextFileChangeEvent extends BaseEvent {
	private _resource: URI;
	private _model: IModel;
	private _isAutoSaved: boolean;

	constructor(resource: URI, model: IModel) {
		super();

		this._resource = resource;
		this._model = model;
	}

	public get resource(): URI {
		return this._resource;
	}

	public get model(): IModel {
		return this._model;
	}

	public setAutoSaved(autoSaved: boolean): void {
		this._isAutoSaved = autoSaved;
	}

	public get isAutoSaved(): boolean {
		return this._isAutoSaved;
	}
}

export const TEXT_FILE_SERVICE_ID = 'textFileService';

export interface ITextFileOperationResult {
	results: IResult[];
}

export interface IResult {
	source: URI;
	target?: URI;
	success?: boolean;
}

export interface IAutoSaveConfiguration {
	autoSaveDelay: number;
	autoSaveFocusChange: boolean;
}

export enum AutoSaveMode {
	OFF,
	AFTER_SHORT_DELAY,
	AFTER_LONG_DELAY,
	ON_FOCUS_CHANGE
}

export interface IFileEditorDescriptor extends IEditorDescriptor {
	getMimeTypes(): string[];
}

export var ITextFileService = createDecorator<ITextFileService>(TEXT_FILE_SERVICE_ID);

export interface IRawTextContent extends IBaseStat {

	/**
	 * The line grouped content of a text file.
	 */
	value: IRawText;

	/**
	 * The line grouped logical hash of a text file.
	 */
	valueLogicalHash: string;

	/**
	 * The encoding of the content if known.
	 */
	encoding: string;
}

export interface ITextFileService extends IDisposable {
	serviceId: ServiceIdentifier<any>;

	/**
	 * Resolve the contents of a file identified by the resource.
	 */
	resolveTextContent(resource: URI, options?: IResolveContentOptions): TPromise<IRawTextContent>;

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
	 * @return true iff the resource was saved.
	 */
	save(resource: URI): TPromise<boolean>;

	/**
	 * Saves the provided resource asking the user for a file name.
	 *
	 * @param resource the resource to save as.
	 * @return true iff the file was saved.
	 */
	saveAs(resource: URI, targetResource?: URI): TPromise<URI>;

	/**
	 * Saves the set of resources and returns a promise with the operation result.
	 *
	 * @param resources can be null to save all.
	 * @param includeUntitled to save all resources and optionally exclude untitled ones.
	 */
	saveAll(includeUntitled?: boolean): TPromise<ITextFileOperationResult>;
	saveAll(resources: URI[]): TPromise<ITextFileOperationResult>;

	/**
	 * Reverts the provided resource.
	 *
	 * @param resource the resource of the file to revert.
	 * @param force to force revert even when the file is not dirty
	 */
	revert(resource: URI, force?: boolean): TPromise<boolean>;

	/**
	 * Reverts all the provided resources and returns a promise with the operation result.
	 *
	 * @param force to force revert even when the file is not dirty
	 */
	revertAll(resources?: URI[], force?: boolean): TPromise<ITextFileOperationResult>;

	/**
	 * Brings up the confirm dialog to either save, don't save or cancel.
	 *
	 * @param resources the resources of the files to ask for confirmation or null if
	 * confirming for all dirty resources.
	 */
	confirmSave(resources?: URI[]): ConfirmResult;

	/**
	 * Convinient fast access to the current auto save mode.
	 */
	getAutoSaveMode(): AutoSaveMode;

	/**
	 * Convinient fast access to the raw configured auto save settings.
	 */
	getAutoSaveConfiguration(): IAutoSaveConfiguration;

	/**
	 * Event is fired with the auto save configuration whenever it changes.
	 */
	onAutoSaveConfigurationChange: Event<IAutoSaveConfiguration>;
}