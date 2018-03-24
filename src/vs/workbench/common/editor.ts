/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Event, Emitter, once } from 'vs/base/common/event';
import * as objects from 'vs/base/common/objects';
import * as types from 'vs/base/common/types';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { IEditor, IEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { IEditorInput, IEditorModel, IEditorOptions, ITextEditorOptions, IBaseResourceInput, Position, Verbosity, IEditor as IBaseEditor, IRevertOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService, IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITextModel } from 'vs/editor/common/model';
import { Schemas } from 'vs/base/common/network';

export const TextCompareEditorVisible = new RawContextKey<boolean>('textCompareEditorVisible', false);

export enum ConfirmResult {
	SAVE,
	DONT_SAVE,
	CANCEL
}

/**
 * Text diff editor id.
 */
export const TEXT_DIFF_EDITOR_ID = 'workbench.editors.textDiffEditor';

export const PREFERENCES_EDITOR_ID = 'workbench.editor.preferencesEditor';

/**
 * Binary diff editor id.
 */
export const BINARY_DIFF_EDITOR_ID = 'workbench.editors.binaryResourceDiffEditor';

export interface IFileInputFactory {

	createFileInput(resource: URI, encoding: string, instantiationService: IInstantiationService): IFileEditorInput;

	isFileInput(obj: any): obj is IFileEditorInput;
}

export interface IEditorInputFactoryRegistry {

	/**
	 * Registers the file input factory to use for file inputs.
	 */
	registerFileInputFactory(factory: IFileInputFactory): void;

	/**
	 * Returns the file input factory to use for file inputs.
	 */
	getFileInputFactory(): IFileInputFactory;

	/**
	 * Registers a editor input factory for the given editor input to the registry. An editor input factory
	 * is capable of serializing and deserializing editor inputs from string data.
	 *
	 * @param editorInputId the identifier of the editor input
	 * @param factory the editor input factory for serialization/deserialization
	 */
	registerEditorInputFactory(editorInputId: string, ctor: IConstructorSignature0<IEditorInputFactory>): void;

	/**
	 * Returns the editor input factory for the given editor input.
	 *
	 * @param editorInputId the identifier of the editor input
	 */
	getEditorInputFactory(editorInputId: string): IEditorInputFactory;

	setInstantiationService(service: IInstantiationService): void;
}

export interface IEditorInputFactory {

	/**
	 * Returns a string representation of the provided editor input that contains enough information
	 * to deserialize back to the original editor input from the deserialize() method.
	 */
	serialize(editorInput: EditorInput): string;

	/**
	 * Returns an editor input from the provided serialized form of the editor input. This form matches
	 * the value returned from the serialize() method.
	 */
	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput;
}

/**
 * Editor inputs are lightweight objects that can be passed to the workbench API to open inside the editor part.
 * Each editor input is mapped to an editor that is capable of opening it through the Platform facade.
 */
export abstract class EditorInput implements IEditorInput {
	private readonly _onDispose: Emitter<void>;
	protected _onDidChangeDirty: Emitter<void>;
	protected _onDidChangeLabel: Emitter<void>;

	private disposed: boolean;

	constructor() {
		this._onDidChangeDirty = new Emitter<void>();
		this._onDidChangeLabel = new Emitter<void>();
		this._onDispose = new Emitter<void>();

		this.disposed = false;
	}

	/**
	 * Fired when the dirty state of this input changes.
	 */
	public get onDidChangeDirty(): Event<void> {
		return this._onDidChangeDirty.event;
	}

	/**
	 * Fired when the label this input changes.
	 */
	public get onDidChangeLabel(): Event<void> {
		return this._onDidChangeLabel.event;
	}

	/**
	 * Fired when the model gets disposed.
	 */
	public get onDispose(): Event<void> {
		return this._onDispose.event;
	}

	/**
	 * Returns the associated resource of this input if any.
	 */
	public getResource(): URI {
		return null;
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
	 */
	public getDescription(verbosity?: Verbosity): string {
		return null;
	}

	public getTitle(verbosity?: Verbosity): string {
		return this.getName();
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
	 * Returns a descriptor suitable for telemetry events or null if none is available.
	 *
	 * Subclasses should extend if they can contribute.
	 */
	public getTelemetryDescriptor(): object {
		/* __GDPR__FRAGMENT__
			"EditorTelemetryDescriptor" : {
				"typeId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		return { typeId: this.getTypeId() };
	}

	/**
	 * Returns a type of EditorModel that represents the resolved input. Subclasses should
	 * override to provide a meaningful model. The optional second argument allows to specify
	 * if the EditorModel should be refreshed before returning it. Depending on the implementation
	 * this could mean to refresh the editor model contents with the version from disk.
	 */
	public abstract resolve(refresh?: boolean): TPromise<IEditorModel>;

	/**
	 * An editor that is dirty will be asked to be saved once it closes.
	 */
	public isDirty(): boolean {
		return false;
	}

	/**
	 * Subclasses should bring up a proper dialog for the user if the editor is dirty and return the result.
	 */
	public confirmSave(): TPromise<ConfirmResult> {
		return TPromise.wrap(ConfirmResult.DONT_SAVE);
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
	public revert(options?: IRevertOptions): TPromise<boolean> {
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
		this.disposed = true;
		this._onDispose.fire();

		this._onDidChangeDirty.dispose();
		this._onDidChangeLabel.dispose();
		this._onDispose.dispose();
	}

	/**
	 * Returns whether this input was disposed or not.
	 */
	public isDisposed(): boolean {
		return this.disposed;
	}
}

export interface IEditorOpeningEvent {
	input: IEditorInput;
	options?: IEditorOptions;
	position: Position;

	/**
	 * Allows to prevent the opening of an editor by providing a callback
	 * that will be executed instead. By returning another editor promise
	 * it is possible to override the opening with another editor. It is ok
	 * to return a promise that resolves to NULL to prevent the opening
	 * altogether.
	 */
	prevent(callback: () => TPromise<IBaseEditor>): void;
}

export class EditorOpeningEvent implements IEditorOpeningEvent {
	private override: () => TPromise<IBaseEditor>;

	constructor(private _input: IEditorInput, private _options: IEditorOptions, private _position: Position) {
	}

	public get input(): IEditorInput {
		return this._input;
	}

	public get options(): IEditorOptions {
		return this._options;
	}

	public get position(): Position {
		return this._position;
	}

	public prevent(callback: () => TPromise<IBaseEditor>): void {
		this.override = callback;
	}

	public isPrevented(): () => TPromise<IBaseEditor> {
		return this.override;
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
	 * Sets the preferred encodingt to use for this input.
	 */
	setPreferredEncoding(encoding: string): void;

	/**
	 * Forces this file input to open as binary instead of text.
	 */
	setForceOpenAsBinary(): void;
}

/**
 * Side by side editor inputs that have a master and details side.
 */
export class SideBySideEditorInput extends EditorInput {

	public static readonly ID: string = 'workbench.editorinputs.sidebysideEditorInput';

	private _toUnbind: IDisposable[];

	constructor(private name: string, private description: string, private _details: EditorInput, private _master: EditorInput) {
		super();
		this._toUnbind = [];
		this.registerListeners();
	}

	get master(): EditorInput {
		return this._master;
	}

	get details(): EditorInput {
		return this._details;
	}

	public isDirty(): boolean {
		return this.master.isDirty();
	}

	public confirmSave(): TPromise<ConfirmResult> {
		return this.master.confirmSave();
	}

	public save(): TPromise<boolean> {
		return this.master.save();
	}

	public revert(): TPromise<boolean> {
		return this.master.revert();
	}

	public getTelemetryDescriptor(): object {
		const descriptor = this.master.getTelemetryDescriptor();
		return objects.assign(descriptor, super.getTelemetryDescriptor());
	}

	private registerListeners(): void {

		// When the details or master input gets disposed, dispose this diff editor input
		const onceDetailsDisposed = once(this.details.onDispose);
		this._toUnbind.push(onceDetailsDisposed(() => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		const onceMasterDisposed = once(this.master.onDispose);
		this._toUnbind.push(onceMasterDisposed(() => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		// Reemit some events from the master side to the outside
		this._toUnbind.push(this.master.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this._toUnbind.push(this.master.onDidChangeLabel(() => this._onDidChangeLabel.fire()));
	}

	public get toUnbind() {
		return this._toUnbind;
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {
		return TPromise.as(null);
	}

	getTypeId(): string {
		return SideBySideEditorInput.ID;
	}

	public getName(): string {
		return this.name;
	}

	public getDescription(): string {
		return this.description;
	}

	public supportsSplitEditor(): boolean {
		return false;
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput) {
			if (!(otherInput instanceof SideBySideEditorInput)) {
				return false;
			}

			const otherDiffInput = <SideBySideEditorInput>otherInput;
			return this.details.matches(otherDiffInput.details) && this.master.matches(otherDiffInput.master);
		}

		return false;
	}

	public dispose(): void {
		this._toUnbind = dispose(this._toUnbind);
		super.dispose();
	}
}

export interface ITextEditorModel extends IEditorModel {
	textEditorModel: ITextModel;
}

/**
 * The editor model is the heavyweight counterpart of editor input. Depending on the editor input, it
 * connects to the disk to retrieve content and may allow for saving it back or reverting it. Editor models
 * are typically cached for some while because they are expensive to construct.
 */
export class EditorModel extends Disposable implements IEditorModel {
	private readonly _onDispose: Emitter<void>;

	constructor() {
		super();
		this._onDispose = new Emitter<void>();
	}

	/**
	 * Fired when the model gets disposed.
	 */
	public get onDispose(): Event<void> {
		return this._onDispose.event;
	}

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
		this._onDispose.fire();
		this._onDispose.dispose();
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
	public static create(settings: IEditorOptions): EditorOptions {
		const options = new EditorOptions();

		options.preserveFocus = settings.preserveFocus;
		options.forceOpen = settings.forceOpen;
		options.revealIfVisible = settings.revealIfVisible;
		options.revealIfOpened = settings.revealIfOpened;
		options.pinned = settings.pinned;
		options.index = settings.index;
		options.inactive = settings.inactive;

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
	 * Will reveal the editor if it is already opened and visible in any of the opened editor groups.
	 */
	public revealIfVisible: boolean;

	/**
	 * Will reveal the editor if it is already opened (even when not visible) in any of the opened editor groups.
	 */
	public revealIfOpened: boolean;

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

	private revealInCenterIfOutsideViewport: boolean;
	private editorViewState: IEditorViewState;

	public static from(input?: IBaseResourceInput): TextEditorOptions {
		if (!input || !input.options) {
			return null;
		}

		return TextEditorOptions.create(input.options);
	}

	/**
	 * Helper to convert options bag to real class
	 */
	public static create(options: ITextEditorOptions = Object.create(null)): TextEditorOptions {
		const textEditorOptions = new TextEditorOptions();

		if (options.selection) {
			const selection = options.selection;
			textEditorOptions.selection(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn);
		}

		if (options.viewState) {
			textEditorOptions.editorViewState = options.viewState as IEditorViewState;
		}

		if (options.forceOpen) {
			textEditorOptions.forceOpen = true;
		}

		if (options.revealIfVisible) {
			textEditorOptions.revealIfVisible = true;
		}

		if (options.revealIfOpened) {
			textEditorOptions.revealIfOpened = true;
		}

		if (options.preserveFocus) {
			textEditorOptions.preserveFocus = true;
		}

		if (options.revealInCenterIfOutsideViewport) {
			textEditorOptions.revealInCenterIfOutsideViewport = true;
		}

		if (options.pinned) {
			textEditorOptions.pinned = true;
		}

		if (options.inactive) {
			textEditorOptions.inactive = true;
		}

		if (typeof options.index === 'number') {
			textEditorOptions.index = options.index;
		}

		return textEditorOptions;
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
	 * Create a TextEditorOptions inline to be used when the editor is opening.
	 */
	public static fromEditor(editor: IEditor, settings?: IEditorOptions): TextEditorOptions {
		const options = TextEditorOptions.create(settings);

		// View state
		options.editorViewState = editor.saveViewState();

		return options;
	}

	/**
	 * Apply the view state or selection to the given editor.
	 *
	 * @return if something was applied
	 */
	public apply(editor: IEditor, scrollType: ScrollType): boolean {

		// View state
		return this.applyViewState(editor, scrollType);
	}

	private applyViewState(editor: IEditor, scrollType: ScrollType): boolean {
		let gotApplied = false;

		// First try viewstate
		if (this.editorViewState) {
			editor.restoreViewState(this.editorViewState);
			gotApplied = true;
		}

		// Otherwise check for selection
		else if (!types.isUndefinedOrNull(this.startLineNumber) && !types.isUndefinedOrNull(this.startColumn)) {

			// Select
			if (!types.isUndefinedOrNull(this.endLineNumber) && !types.isUndefinedOrNull(this.endColumn)) {
				const range = {
					startLineNumber: this.startLineNumber,
					startColumn: this.startColumn,
					endLineNumber: this.endLineNumber,
					endColumn: this.endColumn
				};
				editor.setSelection(range);
				if (this.revealInCenterIfOutsideViewport) {
					editor.revealRangeInCenterIfOutsideViewport(range, scrollType);
				} else {
					editor.revealRangeInCenter(range, scrollType);
				}
			}

			// Reveal
			else {
				const pos = {
					lineNumber: this.startLineNumber,
					column: this.startColumn
				};
				editor.setPosition(pos);
				if (this.revealInCenterIfOutsideViewport) {
					editor.revealPositionInCenterIfOutsideViewport(pos, scrollType);
				} else {
					editor.revealPositionInCenter(pos, scrollType);
				}
			}

			gotApplied = true;
		}

		return gotApplied;
	}
}

export interface IStacksModelChangeEvent {
	group: IEditorGroup;
	editor?: IEditorInput;
	structural?: boolean;
}

export interface IEditorStacksModel {

	onModelChanged: Event<IStacksModelChangeEvent>;

	onWillCloseEditor: Event<IEditorCloseEvent>;
	onEditorClosed: Event<IEditorCloseEvent>;

	groups: IEditorGroup[];
	activeGroup: IEditorGroup;
	isActive(group: IEditorGroup): boolean;

	getGroup(id: GroupIdentifier): IEditorGroup;

	positionOfGroup(group: IEditorGroup): Position;
	groupAt(position: Position): IEditorGroup;

	next(jumpGroups: boolean, cycleAtEnd?: boolean): IEditorIdentifier;
	previous(jumpGroups: boolean, cycleAtStart?: boolean): IEditorIdentifier;
	last(): IEditorIdentifier;

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
	getEditor(resource: URI): IEditorInput;
	indexOf(editor: IEditorInput): number;

	contains(editorOrResource: IEditorInput | URI): boolean;

	getEditors(mru?: boolean): IEditorInput[];
	isActive(editor: IEditorInput): boolean;
	isPreview(editor: IEditorInput): boolean;
	isPinned(index: number): boolean;
	isPinned(editor: IEditorInput): boolean;
}

export interface IEditorIdentifier {
	group: IEditorGroup;
	editor: IEditorInput;
}

/**
 * The editor commands context is used for editor commands (e.g. in the editor title)
 * and we must ensure that the context is serializable because it potentially travels
 * to the extension host!
 */
export interface IEditorCommandsContext {
	groupId: GroupIdentifier;
	editorIndex?: number;
}

export interface IEditorCloseEvent extends IEditorIdentifier {
	replaced: boolean;
	index: number;
}

export type GroupIdentifier = number;

export const EditorOpenPositioning = {
	LEFT: 'left',
	RIGHT: 'right',
	FIRST: 'first',
	LAST: 'last'
};

export const OPEN_POSITIONING_CONFIG = 'workbench.editor.openPositioning';

export interface IWorkbenchEditorConfiguration {
	workbench: {
		editor: {
			showTabs: boolean;
			tabCloseButton: 'left' | 'right' | 'off';
			tabSizing: 'fit' | 'shrink';
			showIcons: boolean;
			enablePreview: boolean;
			enablePreviewFromQuickOpen: boolean;
			closeOnFileDelete: boolean;
			openPositioning: 'left' | 'right' | 'first' | 'last';
			revealIfOpen: boolean;
			swipeToNavigate: boolean,
			labelFormat: 'default' | 'short' | 'medium' | 'long';
		},
		iconTheme: string;
	};
}

export const ActiveEditorMovePositioning = {
	FIRST: 'first',
	LAST: 'last',
	LEFT: 'left',
	RIGHT: 'right',
	CENTER: 'center',
	POSITION: 'position',
};

export const ActiveEditorMovePositioningBy = {
	TAB: 'tab',
	GROUP: 'group'
};

export interface ActiveEditorMoveArguments {
	to?: string;
	by?: string;
	value?: number;
}

export const EditorCommands = {
	MoveActiveEditor: 'moveActiveEditor'
};

export interface IResourceOptions {
	supportSideBySide?: boolean;
	filter?: string | string[];
}

export function toResource(editor: IEditorInput, options?: IResourceOptions): URI {
	if (!editor) {
		return null;
	}

	// Check for side by side if we are asked to
	if (options && options.supportSideBySide && editor instanceof SideBySideEditorInput) {
		editor = editor.master;
	}

	const resource = editor.getResource();
	if (!options || !options.filter) {
		return resource; // return early if no filter is specified
	}

	if (!resource) {
		return null;
	}

	let includeFiles: boolean;
	let includeUntitled: boolean;
	if (Array.isArray(options.filter)) {
		includeFiles = (options.filter.indexOf(Schemas.file) >= 0);
		includeUntitled = (options.filter.indexOf(Schemas.untitled) >= 0);
	} else {
		includeFiles = (options.filter === Schemas.file);
		includeUntitled = (options.filter === Schemas.untitled);
	}

	if (includeFiles && resource.scheme === Schemas.file) {
		return resource;
	}

	if (includeUntitled && resource.scheme === Schemas.untitled) {
		return resource;
	}

	return null;
}

class EditorInputFactoryRegistry implements IEditorInputFactoryRegistry {
	private instantiationService: IInstantiationService;
	private fileInputFactory: IFileInputFactory;
	private editorInputFactoryConstructors: { [editorInputId: string]: IConstructorSignature0<IEditorInputFactory> } = Object.create(null);
	private editorInputFactoryInstances: { [editorInputId: string]: IEditorInputFactory } = Object.create(null);

	constructor() {
	}

	public setInstantiationService(service: IInstantiationService): void {
		this.instantiationService = service;

		for (let key in this.editorInputFactoryConstructors) {
			const element = this.editorInputFactoryConstructors[key];
			this.createEditorInputFactory(key, element);
		}

		this.editorInputFactoryConstructors = {};
	}

	private createEditorInputFactory(editorInputId: string, ctor: IConstructorSignature0<IEditorInputFactory>): void {
		const instance = this.instantiationService.createInstance(ctor);
		this.editorInputFactoryInstances[editorInputId] = instance;
	}

	public registerFileInputFactory(factory: IFileInputFactory): void {
		this.fileInputFactory = factory;
	}

	public getFileInputFactory(): IFileInputFactory {
		return this.fileInputFactory;
	}

	public registerEditorInputFactory(editorInputId: string, ctor: IConstructorSignature0<IEditorInputFactory>): void {
		if (!this.instantiationService) {
			this.editorInputFactoryConstructors[editorInputId] = ctor;
		} else {
			this.createEditorInputFactory(editorInputId, ctor);
		}
	}

	public getEditorInputFactory(editorInputId: string): IEditorInputFactory {
		return this.editorInputFactoryInstances[editorInputId];
	}
}

export const Extensions = {
	EditorInputFactories: 'workbench.contributions.editor.inputFactories'
};

Registry.add(Extensions.EditorInputFactories, new EditorInputFactoryRegistry());
