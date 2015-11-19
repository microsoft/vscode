/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import types = require('vs/base/common/types');
import URI from 'vs/base/common/uri';
import objects = require('vs/base/common/objects');
import {IEditor, IEditorViewState, IRange} from 'vs/editor/common/editorCommon';
import {IEditorInput, IEditorModel, IEditorOptions, ITextInput} from 'vs/platform/editor/common/editor';

/**
 * A simple bag for input related status that can be shown in the UI
 */
export interface IInputStatus {

	/**
	 * An identifier of the state that can be used e.g. as CSS class when displaying the input.
	 */
	state?: string;

	/**
	 * A label to display describing the current input status.
	 */
	displayText?: string;

	/**
	 * A longer description giving more detail about the current input status.
	 */
	description?: string;

	/**
	 * Preferably a short label to append to the input name to indicate the input status.
	 */
	decoration?: string;
}

/**
 * Editor inputs are lightweight objects that can be passed to the workbench API to open inside the editor part.
 * Each editor input is mapped to an editor that is capable of opening it through the Platform facade.
 */
export abstract class EditorInput extends EventEmitter implements IEditorInput {
	private disposed: boolean;

	/**
	 * Returns the unique id of this input.
	 */
	public abstract getId(): string;

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
	 * Returns status information about this input that can be shown to the user. Examples include showing the status
	 * of the input when hovering over the name of the input.
	 */
	public getStatus(): IInputStatus {
		return null;
	}

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
	 * Returns true if this input is identical to the otherInput.
	 */
	public matches(otherInput: any): boolean {
		return this === otherInput;
	}

	/**
	 * Returns a type of EditorModel that represents the resolved input. Subclasses should
	 * override to provide a meaningful model. The optional second argument allows to specify
	 * if the EditorModel should be refreshed before returning it. Depending on the implementation
	 * this could mean to refresh the editor model contents with the version from disk.
	 */
	public abstract resolve(refresh?: boolean): TPromise<EditorModel>;

	/**
	 * Called when an editor input is no longer needed. Allows to free up any resources taken by
	 * resolving the editor input.
	 */
	public dispose(): void {
		this.disposed = true;
		this.emit('dispose');

		super.dispose();
	}

	/**
	 * Returns wether this input was disposed or not.
	 */
	public isDisposed(): boolean {
		return this.disposed;
	}
}

/**
 * The base class of editor inputs that have an original and modified side.
 */
export abstract class DiffEditorInput extends EditorInput {
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

	public getOriginalInput(): EditorInput {
		return this.originalInput;
	}

	public getModifiedInput(): EditorInput {
		return this.modifiedInput;
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
	public static create(settings: { preserveFocus?: boolean; forceOpen?: boolean; }): EditorOptions {
		let options = new EditorOptions();
		options.preserveFocus = settings.preserveFocus;
		options.forceOpen = settings.forceOpen;

		return options;
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
	 * Ensures that the editor is being activated even if the input is already showing. This only applies
	 * if there is more than one editor open already and preserveFocus is set to false.
	 */
	public forceActive: boolean;

	/**
	 * Returns true if this options is identical to the otherOptions.
	 */
	public matches(otherOptions: any): boolean {
		return this === otherOptions;
	}
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

	public static from(textInput: ITextInput): TextEditorOptions {
		let options: TextEditorOptions = null;
		if (textInput && textInput.options) {
			if (textInput.options.selection || textInput.options.forceOpen || textInput.options.preserveFocus) {
				options = new TextEditorOptions();
			}

			if (textInput.options.selection) {
				let selection = textInput.options.selection;
				options.selection(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn);
			}

			if (textInput.options.forceOpen) {
				options.forceOpen = true;
			}

			if (textInput.options.preserveFocus) {
				options.preserveFocus = true;
			}
		}

		return options;
	}

	/**
	 * Helper to create TextEditorOptions inline.
	 */
	public static create(settings: { preserveFocus?: boolean; forceOpen?: boolean; forceActive?: boolean; selection?: IRange }): TextEditorOptions {
		let options = new TextEditorOptions();
		options.preserveFocus = settings.preserveFocus;
		options.forceActive = settings.forceActive;
		options.forceOpen = settings.forceOpen;

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

	public matches(otherOptions: any): boolean {
		if (super.matches(otherOptions) === true) {
			return true;
		}

		if (otherOptions) {
			return otherOptions instanceof TextEditorOptions &&
				(<TextEditorOptions>otherOptions).startLineNumber === this.startLineNumber &&
				(<TextEditorOptions>otherOptions).startColumn === this.startColumn &&
				(<TextEditorOptions>otherOptions).endLineNumber === this.endLineNumber &&
				(<TextEditorOptions>otherOptions).endColumn === this.endColumn &&
				(<TextEditorOptions>otherOptions).preserveFocus === this.preserveFocus &&
				(<TextEditorOptions>otherOptions).forceOpen === this.forceOpen &&
				objects.equals((<TextEditorOptions>otherOptions).editorViewState, this.editorViewState);
		}

		return false;
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
	 * Wether to auto reveal the first change when the text editor is opened or not. By default
	 * the first change will not be revealed.
	 */
	public autoRevealFirstChange: boolean;
}

export interface IResourceEditorInput extends IEditorInput {

	/**
	 * Gets the absolute file resource URI this input is about.
	 */
	getResource(): URI;
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
export interface IFileEditorInput extends IResourceEditorInput, IEncodingSupport {

	/**
	 * Gets the mime type of the file this input is about.
	 */
	getMime(): string;

	/**
	 * Sets the mime type of the file this input is about.
	 */
	setMime(mime: string): void;

	/**
	 * Sets the absolute file resource URI this input is about.
	 */
	setResource(resource: URI): void;
}

/**
 * Given an input, tries to get the associated URI for it (either file or untitled scheme).
 */
export function getUntitledOrFileResource(input: IEditorInput, supportDiff?: boolean): URI {
	if (!input) {
		return null;
	}

	let resourceInput = <IResourceEditorInput>input;
	if (types.isFunction(resourceInput.getResource)) {
		return resourceInput.getResource();
	}

	let fileInput = asFileEditorInput(input, supportDiff);
	return fileInput && fileInput.getResource();
}

/**
 * Returns the object as IFileEditorInput only if it matches the signature.
 */
export function asFileEditorInput(obj: any, supportDiff?: boolean): IFileEditorInput {
	if (!obj) {
		return null;
	}

	// Check for diff if we are asked to
	if (supportDiff && types.isFunction((<DiffEditorInput>obj).getModifiedInput)) {
		obj = (<DiffEditorInput>obj).getModifiedInput();
	}

	let i = <IFileEditorInput>obj;

	return i instanceof EditorInput && types.areFunctions(i.setResource, i.setMime, i.getResource, i.getMime) ? i : null;
}