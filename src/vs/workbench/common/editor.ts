/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import Event, {Emitter} from 'vs/base/common/event';
import types = require('vs/base/common/types');
import URI from 'vs/base/common/uri';
import {IEditor, IEditorViewState} from 'vs/editor/common/editorCommon';
import {IEditorInput, IEditorModel, IEditorOptions, IEditorOptionsBag, ITextEditorOptions, IResourceInput, Position} from 'vs/platform/editor/common/editor';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {Event as BaseEvent} from 'vs/base/common/events';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';

export enum ConfirmResult {
	SAVE,
	DONT_SAVE,
	CANCEL
}

/**
 * Editor inputs are lightweight objects that can be passed to the workbench API to open inside the editor part.
 * Each editor input is mapped to an editor that is capable of opening it through the Platform facade.
 */
export abstract class EditorInput extends EventEmitter implements IEditorInput {
	protected _onDidChangeDirty: Emitter<void>;
	private disposed: boolean;

	constructor() {
		super();

		this._onDidChangeDirty = new Emitter<void>();
		this.disposed = false;
	}

	/**
	 * Fired when the dirty state of this input changes.
	 */
	public get onDidChangeDirty(): Event<void> {
		return this._onDidChangeDirty.event;
	}

	/**
	 * Returns the name of this input that can be shown to the user. Examples include showing the name of the input
	 * above the editor area when the input is shown.
	 */
	public getName(): string {
		return null;
	}

	/**
	 * Returns the description of this input that can be shown to the user. Examples include showing the description of
	 * the input above the editor area to the side of the name of the input.
	 *
	 * @param verbose controls if the description should be short or can contain additional details.
	 */
	public getDescription(verbose?: boolean): string {
		return null;
	}

	/**
	 * Returns the unique type identifier of this input.
	 */
	public abstract getTypeId(): string;

	/**
	 * Returns the preferred editor for this input. A list of candidate editors is passed in that whee registered
	 * for the input. This allows subclasses to decide late which editor to use for the input on a case by case basis.
	 */
	public getPreferredEditorId(candidates: string[]): string {
		if (candidates && candidates.length > 0) {
			return candidates[0];
		}

		return null;
	}

	/**
	 * Returns a type of EditorModel that represents the resolved input. Subclasses should
	 * override to provide a meaningful model. The optional second argument allows to specify
	 * if the EditorModel should be refreshed before returning it. Depending on the implementation
	 * this could mean to refresh the editor model contents with the version from disk.
	 */
	public abstract resolve(refresh?: boolean): TPromise<EditorModel>;

	/**
	 * An editor that is dirty will be asked to be saved once it closes.
	 */
	public isDirty(): boolean {
		return false;
	}

	/**
	 * Subclasses should bring up a proper dialog for the user if the editor is dirty and return the result.
	 */
	public confirmSave(): ConfirmResult {
		return ConfirmResult.DONT_SAVE;
	}

	/**
	 * Saves the editor if it is dirty. Subclasses return a promise with a boolean indicating the success of the operation.
	 */
	public save(): TPromise<boolean> {
		return TPromise.as(true);
	}

	/**
	 * Reverts the editor if it is dirty. Subclasses return a promise with a boolean indicating the success of the operation.
	 */
	public revert(): TPromise<boolean> {
		return TPromise.as(true);
	}

	/**
	 * Called when this input is no longer opened in any editor. Subclasses can free resources as needed.
	 */
	public close(): void {
		this.dispose();
	}

	/**
	 * Subclasses can set this to false if it does not make sense to split the editor input.
	 */
	public supportsSplitEditor(): boolean {
		return true;
	}

	/**
	 * Returns true if this input is identical to the otherInput.
	 */
	public matches(otherInput: any): boolean {
		return this === otherInput;
	}

	/**
	 * Called when an editor input is no longer needed. Allows to free up any resources taken by
	 * resolving the editor input.
	 */
	public dispose(): void {
		this._onDidChangeDirty.dispose();
		this.disposed = true;
		this.emit('dispose');

		super.dispose();
	}

	/**
	 * Returns whether this input was disposed or not.
	 */
	public isDisposed(): boolean {
		return this.disposed;
	}
}

export class EditorInputEvent extends BaseEvent {
	private _editorInput: IEditorInput;
	private prevented: boolean;

	constructor(editorInput: IEditorInput) {
		super(null);

		this._editorInput = editorInput;
	}

	public get editorInput(): IEditorInput {
		return this._editorInput;
	}

	public prevent(): void {
		this.prevented = true;
	}

	public isPrevented(): boolean {
		return this.prevented;
	}
}

export enum EncodingMode {

	/**
	 * Instructs the encoding support to encode the current input with the provided encoding
	 */
	Encode,

	/**
	 * Instructs the encoding support to decode the current input with the provided encoding
	 */
	Decode
}

export interface IEncodingSupport {

	/**
	 * Gets the encoding of the input if known.
	 */
	getEncoding(): string;

	/**
	 * Sets the encoding for the input for saving.
	 */
	setEncoding(encoding: string, mode: EncodingMode): void;
}

/**
 * This is a tagging interface to declare an editor input being capable of dealing with files. It is only used in the editor registry
 * to register this kind of input to the platform.
 */
export interface IFileEditorInput extends IEditorInput, IEncodingSupport {

	/**
	 * Gets the mime type of the file this input is about.
	 */
	getMime(): string;

	/**
	 * Sets the mime type of the file this input is about.
	 */
	setMime(mime: string): void;

	/**
	 * Gets the absolute file resource URI this input is about.
	 */
	getResource(): URI;

	/**
	 * Sets the absolute file resource URI this input is about.
	 */
	setResource(resource: URI): void;

	/**
	 * Sets the preferred encodingt to use for this input.
	 */
	setPreferredEncoding(encoding: string): void;
}

/**
 * The base class of untitled editor inputs in the workbench.
 */
export abstract class UntitledEditorInput extends EditorInput implements IEncodingSupport {

	abstract getResource(): URI;

	abstract isDirty(): boolean;

	abstract suggestFileName(): string;

	abstract getMime(): string;

	abstract getEncoding(): string;

	abstract setEncoding(encoding: string, mode: EncodingMode): void;
}

/**
 * The base class of editor inputs that have an original and modified side.
 */
export abstract class BaseDiffEditorInput extends EditorInput {
	private _originalInput: EditorInput;
	private _modifiedInput: EditorInput;

	constructor(originalInput: EditorInput, modifiedInput: EditorInput) {
		super();

		this._originalInput = originalInput;
		this._modifiedInput = modifiedInput;
	}

	public get originalInput(): EditorInput {
		return this._originalInput;
	}

	public get modifiedInput(): EditorInput {
		return this._modifiedInput;
	}

	public isDirty(): boolean {
		return this._modifiedInput.isDirty();
	}

	public confirmSave(): ConfirmResult {
		return this._modifiedInput.confirmSave();
	}

	public save(): TPromise<boolean> {
		return this._modifiedInput.save();
	}

	public revert(): TPromise<boolean> {
		return this._modifiedInput.revert();
	}
}

/**
 * The editor model is the heavyweight counterpart of editor input. Depending on the editor input, it
 * connects to the disk to retrieve content and may allow for saving it back or reverting it. Editor models
 * are typically cached for some while because they are expensive to construct.
 */
export class EditorModel extends EventEmitter implements IEditorModel {

	/**
	 * Causes this model to load returning a promise when loading is completed.
	 */
	public load(): TPromise<EditorModel> {
		return TPromise.as(this);
	}

	/**
	 * Returns whether this model was loaded or not.
	 */
	public isResolved(): boolean {
		return true;
	}

	/**
	 * Subclasses should implement to free resources that have been claimed through loading.
	 */
	public dispose(): void {
		this.emit('dispose');

		super.dispose();
	}
}

/**
 * The editor options is the base class of options that can be passed in when opening an editor.
 */
export class EditorOptions implements IEditorOptions {

	/**
	 * Helper to create EditorOptions inline.
	 */
	public static create(settings: IEditorOptionsBag): EditorOptions {
		let options = new EditorOptions();
		options.preserveFocus = settings.preserveFocus;
		options.forceOpen = settings.forceOpen;
		options.pinned = settings.pinned;
		options.index = settings.index;
		options.inactive = settings.inactive;

		return options;
	}

	/**
	 * Inherit all options from other EditorOptions instance.
	 */
	public mixin(other: EditorOptions): void {
		this.preserveFocus = other.preserveFocus;
		this.forceOpen = other.forceOpen;
		this.pinned = other.pinned;
		this.index = other.index;
	}

	/**
	 * Tells the editor to not receive keyboard focus when the editor is being opened. By default,
	 * the editor will receive keyboard focus on open.
	 */
	public preserveFocus: boolean;

	/**
	 * Tells the editor to replace the editor input in the editor even if it is identical to the one
	 * already showing. By default, the editor will not replace the input if it is identical to the
	 * one showing.
	 */
	public forceOpen: boolean;

	/**
	 * An editor that is pinned remains in the editor stack even when another editor is being opened.
	 * An editor that is not pinned will always get replaced by another editor that is not pinned.
	 */
	public pinned: boolean;

	/**
	 * The index in the document stack where to insert the editor into when opening.
	 */
	public index: number;

	/**
	 * An active editor that is opened will show its contents directly. Set to true to open an editor
	 * in the background.
	 */
	public inactive: boolean;
}

/**
 * Base Text Editor Options.
 */
export class TextEditorOptions extends EditorOptions {
	private startLineNumber: number;
	private startColumn: number;
	private endLineNumber: number;
	private endColumn: number;
	private editorViewState: IEditorViewState;

	public static from(input: IResourceInput): TextEditorOptions {
		let options: TextEditorOptions = null;
		if (input && input.options) {
			if (input.options.selection || input.options.forceOpen || input.options.preserveFocus || input.options.pinned || input.options.inactive || typeof input.options.index === 'number') {
				options = new TextEditorOptions();
			}

			if (input.options.selection) {
				let selection = input.options.selection;
				options.selection(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn);
			}

			if (input.options.forceOpen) {
				options.forceOpen = true;
			}

			if (input.options.preserveFocus) {
				options.preserveFocus = true;
			}

			if (input.options.pinned) {
				options.pinned = true;
			}

			if (input.options.inactive) {
				options.inactive = true;
			}

			if (typeof input.options.index === 'number') {
				options.index = input.options.index;
			}
		}

		return options;
	}

	/**
	 * Helper to create TextEditorOptions inline.
	 */
	public static create(settings: ITextEditorOptions): TextEditorOptions {
		let options = new TextEditorOptions();
		options.preserveFocus = settings.preserveFocus;
		options.forceOpen = settings.forceOpen;
		options.pinned = settings.pinned;
		options.index = settings.index;

		if (settings.selection) {
			options.startLineNumber = settings.selection.startLineNumber;
			options.startColumn = settings.selection.startColumn;
			options.endLineNumber = settings.selection.endLineNumber || settings.selection.startLineNumber;
			options.endColumn = settings.selection.endColumn || settings.selection.startColumn;
		}

		return options;
	}

	/**
	 * Returns if this options object has objects defined for the editor.
	 */
	public hasOptionsDefined(): boolean {
		return !!this.editorViewState || (!types.isUndefinedOrNull(this.startLineNumber) && !types.isUndefinedOrNull(this.startColumn));
	}

	/**
	 * Tells the editor to set show the given selection when the editor is being opened.
	 */
	public selection(startLineNumber: number, startColumn: number, endLineNumber: number = startLineNumber, endColumn: number = startColumn): EditorOptions {
		this.startLineNumber = startLineNumber;
		this.startColumn = startColumn;
		this.endLineNumber = endLineNumber;
		this.endColumn = endColumn;

		return this;
	}

	/**
	 * Sets the view state to be used when the editor is opening.
	 */
	public viewState(viewState: IEditorViewState): void {
		this.editorViewState = viewState;
	}

	/**
	 * Apply the view state or selection to the given editor.
	 *
	 * @return if something was applied
	 */
	public apply(textEditor: IEditor): boolean {
		let gotApplied = false;

		// First try viewstate
		if (this.editorViewState) {
			textEditor.restoreViewState(this.editorViewState);
			gotApplied = true;
		}

		// Otherwise check for selection
		else if (!types.isUndefinedOrNull(this.startLineNumber) && !types.isUndefinedOrNull(this.startColumn)) {

			// Select
			if (!types.isUndefinedOrNull(this.endLineNumber) && !types.isUndefinedOrNull(this.endColumn)) {
				let range = {
					startLineNumber: this.startLineNumber,
					startColumn: this.startColumn,
					endLineNumber: this.endLineNumber,
					endColumn: this.endColumn
				};
				textEditor.setSelection(range);
				textEditor.revealRangeInCenter(range);
			}

			// Reveal
			else {
				let pos = {
					lineNumber: this.startLineNumber,
					column: this.startColumn
				};
				textEditor.setPosition(pos);
				textEditor.revealPositionInCenter(pos);
			}

			gotApplied = true;
		}

		return gotApplied;
	}
}

/**
 * Base Text Diff Editor Options.
 */
export class TextDiffEditorOptions extends TextEditorOptions {

	/**
	 * Helper to create TextDiffEditorOptions inline.
	 */
	public static create(settings: { autoRevealFirstChange?: boolean; preserveFocus?: boolean; forceOpen?: boolean; }): TextDiffEditorOptions {
		let options = new TextDiffEditorOptions();
		options.autoRevealFirstChange = settings.autoRevealFirstChange;
		options.preserveFocus = settings.preserveFocus;
		options.forceOpen = settings.forceOpen;

		return options;
	}

	/**
	 * Whether to auto reveal the first change when the text editor is opened or not. By default
	 * the first change will not be revealed.
	 */
	public autoRevealFirstChange: boolean;
}

/**
 * Given an input, tries to get the associated URI for it (either file or untitled scheme).
 */
export function getUntitledOrFileResource(input: IEditorInput, supportDiff?: boolean): URI {
	if (!input) {
		return null;
	}

	// Untitled
	if (input instanceof UntitledEditorInput) {
		return input.getResource();
	}

	// File
	let fileInput = asFileEditorInput(input, supportDiff);
	return fileInput && fileInput && fileInput.getResource();
}

export function getResource(input: IEditorInput): URI {
	if (input && typeof (<any> input).getResource === 'function') {
		let candidate = (<any>input).getResource();
		if (candidate instanceof URI) {
			return candidate;
		}
	}
	return getUntitledOrFileResource(input, true);
}

/**
 * Helper to return all opened editors with resources not belonging to the currently opened workspace.
 */
export function getOutOfWorkspaceEditorResources(editorGroupService: IEditorGroupService, contextService: IWorkspaceContextService): URI[] {
	const resources: URI[] = [];

	editorGroupService.getStacksModel().groups.forEach(group => {
		const editors = group.getEditors();
		editors.forEach(editor => {
			const fileInput = asFileEditorInput(editor, true);
			if (fileInput && !contextService.isInsideWorkspace(fileInput.getResource())) {
				resources.push(fileInput.getResource());
			}
		});
	});

	return resources;
}

/**
 * Returns the object as IFileEditorInput only if it matches the signature.
 */
export function asFileEditorInput(obj: any, supportDiff?: boolean): IFileEditorInput {
	if (!obj) {
		return null;
	}

	// Check for diff if we are asked to
	if (supportDiff && obj instanceof BaseDiffEditorInput) {
		obj = (<BaseDiffEditorInput>obj).modifiedInput;
	}

	let i = <IFileEditorInput>obj;

	return i instanceof EditorInput && types.areFunctions(i.setResource, i.setMime, i.setEncoding, i.getEncoding, i.getResource, i.getMime) ? i : null;
}

export interface IStacksModelChangeEvent {
	group: IEditorGroup;
	editor?: IEditorInput;
	structural?: boolean;
}

export interface IEditorStacksModel {

	onModelChanged: Event<IStacksModelChangeEvent>;
	onEditorClosed: Event<IGroupEvent>;

	groups: IEditorGroup[];
	activeGroup: IEditorGroup;
	isActive(IEditorGroup): boolean;

	getGroup(id: GroupIdentifier): IEditorGroup;

	positionOfGroup(group: IEditorGroup): Position;
	groupAt(position: Position): IEditorGroup;

	next(): IEditorIdentifier;
	previous(): IEditorIdentifier;

	isOpen(editor: IEditorInput): boolean;
	isOpen(resource: URI): boolean;

	toString(): string;
}

export interface IEditorGroup {

	id: GroupIdentifier;
	label: string;
	count: number;
	activeEditor: IEditorInput;
	previewEditor: IEditorInput;

	getEditor(index: number): IEditorInput;
	indexOf(editor: IEditorInput): number;

	contains(editor: IEditorInput): boolean;
	contains(resource: URI): boolean;

	getEditors(mru?: boolean): IEditorInput[];
	isActive(editor: IEditorInput): boolean;
	isPreview(editor: IEditorInput): boolean;
	isPinned(editor: IEditorInput): boolean;
}

export interface IEditorIdentifier {
	group: IEditorGroup;
	editor: IEditorInput;
}

export interface IEditorContext extends IEditorIdentifier {
	event: any;
}

export interface IGroupEvent {
	editor: IEditorInput;
	pinned: boolean;
}

export type GroupIdentifier = number;

export const EditorOpenPositioning = {
	LEFT: 'left',
	RIGHT: 'right',
	FIRST: 'first',
	LAST: 'last'
};

export interface IWorkbenchEditorConfiguration {
	workbench: {
		editor: {
			showTabs: boolean;
			enablePreview: boolean;
			enablePreviewFromQuickOpen: boolean;
			openPositioning: string;
		}
	};
}