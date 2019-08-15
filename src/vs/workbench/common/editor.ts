/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IEditor as ICodeEditor, IEditorViewState, ScrollType, IDiffEditor } from 'vs/editor/common/editorCommon';
import { IEditorModel, IEditorOptions, ITextEditorOptions, IBaseResourceInput, IResourceInput } from 'vs/platform/editor/common/editor';
import { IInstantiationService, IConstructorSignature0, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { RawContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ICompositeControl } from 'vs/workbench/common/composite';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { IFileService } from 'vs/platform/files/common/files';
import { IPathData } from 'vs/platform/windows/common/windows';
import { coalesce } from 'vs/base/common/arrays';

export const ActiveEditorContext = new RawContextKey<string | null>('activeEditor', null);
export const EditorsVisibleContext = new RawContextKey<boolean>('editorIsOpen', false);
export const EditorPinnedContext = new RawContextKey<boolean>('editorPinned', false);
export const EditorGroupActiveEditorDirtyContext = new RawContextKey<boolean>('groupActiveEditorDirty', false);
export const EditorGroupEditorsCountContext = new RawContextKey<number>('groupEditorsCount', 0);
export const NoEditorsVisibleContext: ContextKeyExpr = EditorsVisibleContext.toNegated();
export const TextCompareEditorVisibleContext = new RawContextKey<boolean>('textCompareEditorVisible', false);
export const TextCompareEditorActiveContext = new RawContextKey<boolean>('textCompareEditorActive', false);
export const ActiveEditorGroupEmptyContext = new RawContextKey<boolean>('activeEditorGroupEmpty', false);
export const ActiveEditorGroupIndexContext = new RawContextKey<number>('activeEditorGroupIndex', -1);
export const ActiveEditorGroupLastContext = new RawContextKey<boolean>('activeEditorGroupLast', false);
export const MultipleEditorGroupsContext = new RawContextKey<boolean>('multipleEditorGroups', false);
export const SingleEditorGroupsContext = MultipleEditorGroupsContext.toNegated();
export const InEditorZenModeContext = new RawContextKey<boolean>('inZenMode', false);
export const IsCenteredLayoutContext = new RawContextKey<boolean>('isCenteredLayout', false);
export const SplitEditorsVertically = new RawContextKey<boolean>('splitEditorsVertically', false);

/**
 * Text diff editor id.
 */
export const TEXT_DIFF_EDITOR_ID = 'workbench.editors.textDiffEditor';

/**
 * Binary diff editor id.
 */
export const BINARY_DIFF_EDITOR_ID = 'workbench.editors.binaryResourceDiffEditor';

export interface IEditor {

	/**
	 * The assigned input of this editor.
	 */
	input: IEditorInput | null;

	/**
	 * The assigned options of this editor.
	 */
	options: IEditorOptions | null;

	/**
	 * The assigned group this editor is showing in.
	 */
	group: IEditorGroup | undefined;

	/**
	 * The minimum width of this editor.
	 */
	readonly minimumWidth: number;

	/**
	 * The maximum width of this editor.
	 */
	readonly maximumWidth: number;

	/**
	 * The minimum height of this editor.
	 */
	readonly minimumHeight: number;

	/**
	 * The maximum height of this editor.
	 */
	readonly maximumHeight: number;

	/**
	 * An event to notify whenever minimum/maximum width/height changes.
	 */
	readonly onDidSizeConstraintsChange: Event<{ width: number; height: number; } | undefined>;

	/**
	 * Returns the unique identifier of this editor.
	 */
	getId(): string;

	/**
	 * Returns the underlying control of this editor.
	 */
	getControl(): IEditorControl | undefined;

	/**
	 * Asks the underlying control to focus.
	 */
	focus(): void;

	/**
	 * Finds out if this editor is visible or not.
	 */
	isVisible(): boolean;
}

export interface ITextEditor extends IEditor {

	/**
	 * Returns the underlying text editor widget of this editor.
	 */
	getControl(): ICodeEditor;
}

export interface ITextDiffEditor extends IEditor {

	/**
	 * Returns the underlying text editor widget of this editor.
	 */
	getControl(): IDiffEditor;
}

export interface ITextSideBySideEditor extends IEditor {

	/**
	 * Returns the underlying text editor widget of the master side
	 * of this side-by-side editor.
	 */
	getMasterEditor(): ITextEditor;

	/**
	 * Returns the underlying text editor widget of the details side
	 * of this side-by-side editor.
	 */
	getDetailsEditor(): ITextEditor;
}

/**
 * Marker interface for the base editor control
 */
export interface IEditorControl extends ICompositeControl { }

export interface IFileInputFactory {

	createFileInput(resource: URI, encoding: string | undefined, mode: string | undefined, instantiationService: IInstantiationService): IFileEditorInput;

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
	getEditorInputFactory(editorInputId: string): IEditorInputFactory | undefined;

	/**
	 * Starts the registry by providing the required services.
	 */
	start(accessor: ServicesAccessor): void;
}

export interface IEditorInputFactory {

	/**
	 * Returns a string representation of the provided editor input that contains enough information
	 * to deserialize back to the original editor input from the deserialize() method.
	 */
	serialize(editorInput: EditorInput): string | undefined;

	/**
	 * Returns an editor input from the provided serialized form of the editor input. This form matches
	 * the value returned from the serialize() method.
	 */
	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput | undefined;
}

export interface IUntitledResourceInput extends IBaseResourceInput {

	/**
	 * Optional resource. If the resource is not provided a new untitled file is created (e.g. Untitled-1).
	 * Otherwise the untitled editor will have an associated path and use that when saving.
	 */
	resource?: URI;

	/**
	 * Optional language of the untitled resource.
	 */
	mode?: string;

	/**
	 * Optional contents of the untitled resource.
	 */
	contents?: string;

	/**
	 * Optional encoding of the untitled resource.
	 */
	encoding?: string;
}

export interface IResourceDiffInput extends IBaseResourceInput {

	/**
	 * The left hand side URI to open inside a diff editor.
	 */
	leftResource: URI;

	/**
	 * The right hand side URI to open inside a diff editor.
	 */
	rightResource: URI;
}

export interface IResourceSideBySideInput extends IBaseResourceInput {

	/**
	 * The right hand side URI to open inside a side by side editor.
	 */
	masterResource: URI;

	/**
	 * The left hand side URI to open inside a side by side editor.
	 */
	detailResource: URI;
}

export const enum Verbosity {
	SHORT,
	MEDIUM,
	LONG
}

export interface IRevertOptions {

	/**
	 *  Forces to load the contents of the editor again even if the editor is not dirty.
	 */
	force?: boolean;

	/**
	 * A soft revert will clear dirty state of an editor but will not attempt to load it.
	 */
	soft?: boolean;
}

export interface IEditorInput extends IDisposable {

	/**
	 * Triggered when this input is disposed.
	 */
	onDispose: Event<void>;

	/**
	 * Returns the associated resource of this input.
	 */
	getResource(): URI | undefined;

	/**
	 * Unique type identifier for this inpput.
	 */
	getTypeId(): string;

	/**
	 * Returns the display name of this input.
	 */
	getName(): string | null;

	/**
	 * Returns the display description of this input.
	 */
	getDescription(verbosity?: Verbosity): string | undefined;

	/**
	 * Returns the display title of this input.
	 */
	getTitle(verbosity?: Verbosity): string | null;

	/**
	 * Resolves the input.
	 */
	resolve(): Promise<IEditorModel | null>;

	/**
	 * Returns if this input is dirty or not.
	 */
	isDirty(): boolean;

	/**
	 * Reverts this input.
	 */
	revert(options?: IRevertOptions): Promise<boolean>;

	/**
	 * Returns if the other object matches this input.
	 */
	matches(other: unknown): boolean;
}

/**
 * Editor inputs are lightweight objects that can be passed to the workbench API to open inside the editor part.
 * Each editor input is mapped to an editor that is capable of opening it through the Platform facade.
 */
export abstract class EditorInput extends Disposable implements IEditorInput {

	protected readonly _onDidChangeDirty: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;

	protected readonly _onDidChangeLabel: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLabel: Event<void> = this._onDidChangeLabel.event;

	private readonly _onDispose: Emitter<void> = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	private disposed: boolean = false;

	/**
	 * Returns the unique type identifier of this input.
	 */
	abstract getTypeId(): string;

	/**
	 * Returns the associated resource of this input if any.
	 */
	getResource(): URI | undefined {
		return undefined;
	}

	/**
	 * Returns the name of this input that can be shown to the user. Examples include showing the name of the input
	 * above the editor area when the input is shown.
	 */
	getName(): string | null {
		return null;
	}

	/**
	 * Returns the description of this input that can be shown to the user. Examples include showing the description of
	 * the input above the editor area to the side of the name of the input.
	 */
	getDescription(verbosity?: Verbosity): string | undefined {
		return undefined;
	}

	/**
	 * Returns the title of this input that can be shown to the user. Examples include showing the title of
	 * the input above the editor area as hover over the input label.
	 */
	getTitle(verbosity?: Verbosity): string | null {
		return this.getName();
	}

	/**
	 * Returns the preferred editor for this input. A list of candidate editors is passed in that whee registered
	 * for the input. This allows subclasses to decide late which editor to use for the input on a case by case basis.
	 */
	getPreferredEditorId(candidates: string[]): string | undefined {
		if (candidates.length > 0) {
			return candidates[0];
		}

		return undefined;
	}

	/**
	 * Returns a descriptor suitable for telemetry events.
	 *
	 * Subclasses should extend if they can contribute.
	 */
	getTelemetryDescriptor(): { [key: string]: unknown } {
		/* __GDPR__FRAGMENT__
			"EditorTelemetryDescriptor" : {
				"typeId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		return { typeId: this.getTypeId() };
	}

	/**
	 * Returns a type of EditorModel that represents the resolved input. Subclasses should
	 * override to provide a meaningful model.
	 */
	abstract resolve(): Promise<IEditorModel | null>;

	/**
	 * An editor that is dirty will be asked to be saved once it closes.
	 */
	isDirty(): boolean {
		return false;
	}

	/**
	 * Subclasses should bring up a proper dialog for the user if the editor is dirty and return the result.
	 */
	confirmSave(): Promise<ConfirmResult> {
		return Promise.resolve(ConfirmResult.DONT_SAVE);
	}

	/**
	 * Saves the editor if it is dirty. Subclasses return a promise with a boolean indicating the success of the operation.
	 */
	save(): Promise<boolean> {
		return Promise.resolve(true);
	}

	/**
	 * Reverts the editor if it is dirty. Subclasses return a promise with a boolean indicating the success of the operation.
	 */
	revert(options?: IRevertOptions): Promise<boolean> {
		return Promise.resolve(true);
	}

	/**
	 * Called when this input is no longer opened in any editor. Subclasses can free resources as needed.
	 */
	close(): void {
		this.dispose();
	}

	/**
	 * Subclasses can set this to false if it does not make sense to split the editor input.
	 */
	supportsSplitEditor(): boolean {
		return true;
	}

	/**
	 * Returns true if this input is identical to the otherInput.
	 */
	matches(otherInput: unknown): boolean {
		return this === otherInput;
	}

	/**
	 * Returns whether this input was disposed or not.
	 */
	isDisposed(): boolean {
		return this.disposed;
	}

	/**
	 * Called when an editor input is no longer needed. Allows to free up any resources taken by
	 * resolving the editor input.
	 */
	dispose(): void {
		this.disposed = true;
		this._onDispose.fire();

		super.dispose();
	}
}

export const enum ConfirmResult {
	SAVE,
	DONT_SAVE,
	CANCEL
}

export const enum EncodingMode {

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

export interface IModeSupport {

	/**
	 * Sets the language mode of the input.
	 */
	setMode(mode: string): void;
}

/**
 * This is a tagging interface to declare an editor input being capable of dealing with files. It is only used in the editor registry
 * to register this kind of input to the platform.
 */
export interface IFileEditorInput extends IEditorInput, IEncodingSupport, IModeSupport {

	/**
	 * Gets the resource this editor is about.
	 */
	getResource(): URI;

	/**
	 * Sets the preferred encoding to use for this input.
	 */
	setPreferredEncoding(encoding: string): void;

	/**
	 * Sets the preferred language mode to use for this input.
	 */
	setPreferredMode(mode: string): void;

	/**
	 * Forces this file input to open as binary instead of text.
	 */
	setForceOpenAsBinary(): void;
}

/**
 * Side by side editor inputs that have a master and details side.
 */
export class SideBySideEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.editorinputs.sidebysideEditorInput';

	constructor(
		private readonly name: string,
		private readonly description: string | undefined,
		private readonly _details: EditorInput,
		private readonly _master: EditorInput
	) {
		super();

		this.registerListeners();
	}

	get master(): EditorInput {
		return this._master;
	}

	get details(): EditorInput {
		return this._details;
	}

	isDirty(): boolean {
		return this.master.isDirty();
	}

	confirmSave(): Promise<ConfirmResult> {
		return this.master.confirmSave();
	}

	save(): Promise<boolean> {
		return this.master.save();
	}

	revert(): Promise<boolean> {
		return this.master.revert();
	}

	getTelemetryDescriptor(): { [key: string]: unknown } {
		const descriptor = this.master.getTelemetryDescriptor();

		return assign(descriptor, super.getTelemetryDescriptor());
	}

	private registerListeners(): void {

		// When the details or master input gets disposed, dispose this diff editor input
		const onceDetailsDisposed = Event.once(this.details.onDispose);
		this._register(onceDetailsDisposed(() => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		const onceMasterDisposed = Event.once(this.master.onDispose);
		this._register(onceMasterDisposed(() => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		// Reemit some events from the master side to the outside
		this._register(this.master.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this._register(this.master.onDidChangeLabel(() => this._onDidChangeLabel.fire()));
	}

	resolve(): Promise<EditorModel | null> {
		return Promise.resolve(null);
	}

	getTypeId(): string {
		return SideBySideEditorInput.ID;
	}

	getName(): string {
		return this.name;
	}

	getDescription(): string | undefined {
		return this.description;
	}

	matches(otherInput: unknown): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput) {
			if (!(otherInput instanceof SideBySideEditorInput)) {
				return false;
			}

			return this.details.matches(otherInput.details) && this.master.matches(otherInput.master);
		}

		return false;
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

	private readonly _onDispose: Emitter<void> = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	/**
	 * Causes this model to load returning a promise when loading is completed.
	 */
	load(): Promise<IEditorModel> {
		return Promise.resolve(this);
	}

	/**
	 * Returns whether this model was loaded or not.
	 */
	isResolved(): boolean {
		return true;
	}

	/**
	 * Subclasses should implement to free resources that have been claimed through loading.
	 */
	dispose(): void {
		this._onDispose.fire();

		super.dispose();
	}
}

export interface IEditorInputWithOptions {
	editor: IEditorInput;
	options?: IEditorOptions | ITextEditorOptions;
}

export function isEditorInputWithOptions(obj: unknown): obj is IEditorInputWithOptions {
	const editorInputWithOptions = obj as IEditorInputWithOptions;

	return !!editorInputWithOptions && !!editorInputWithOptions.editor;
}

/**
 * The editor options is the base class of options that can be passed in when opening an editor.
 */
export class EditorOptions implements IEditorOptions {

	/**
	 * Helper to create EditorOptions inline.
	 */
	static create(settings: IEditorOptions): EditorOptions {
		const options = new EditorOptions();

		options.preserveFocus = settings.preserveFocus;
		options.forceReload = settings.forceReload;
		options.revealIfVisible = settings.revealIfVisible;
		options.revealIfOpened = settings.revealIfOpened;
		options.pinned = settings.pinned;
		options.index = settings.index;
		options.inactive = settings.inactive;
		options.ignoreError = settings.ignoreError;

		return options;
	}

	/**
	 * Tells the editor to not receive keyboard focus when the editor is being opened. By default,
	 * the editor will receive keyboard focus on open.
	 */
	preserveFocus: boolean | undefined;

	/**
	 * Tells the editor to reload the editor input in the editor even if it is identical to the one
	 * already showing. By default, the editor will not reload the input if it is identical to the
	 * one showing.
	 */
	forceReload: boolean | undefined;

	/**
	 * Will reveal the editor if it is already opened and visible in any of the opened editor groups.
	 */
	revealIfVisible: boolean | undefined;

	/**
	 * Will reveal the editor if it is already opened (even when not visible) in any of the opened editor groups.
	 */
	revealIfOpened: boolean | undefined;

	/**
	 * An editor that is pinned remains in the editor stack even when another editor is being opened.
	 * An editor that is not pinned will always get replaced by another editor that is not pinned.
	 */
	pinned: boolean | undefined;

	/**
	 * The index in the document stack where to insert the editor into when opening.
	 */
	index: number | undefined;

	/**
	 * An active editor that is opened will show its contents directly. Set to true to open an editor
	 * in the background.
	 */
	inactive: boolean | undefined;

	/**
	 * Will not show an error in case opening the editor fails and thus allows to show a custom error
	 * message as needed. By default, an error will be presented as notification if opening was not possible.
	 */
	ignoreError: boolean | undefined;
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
	private editorViewState: IEditorViewState | null;

	static from(input?: IBaseResourceInput): TextEditorOptions | undefined {
		if (!input || !input.options) {
			return undefined;
		}

		return TextEditorOptions.create(input.options);
	}

	/**
	 * Helper to convert options bag to real class
	 */
	static create(options: ITextEditorOptions = Object.create(null)): TextEditorOptions {
		const textEditorOptions = new TextEditorOptions();

		if (options.selection) {
			const selection = options.selection;
			textEditorOptions.selection(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn);
		}

		if (options.viewState) {
			textEditorOptions.editorViewState = options.viewState as IEditorViewState;
		}

		if (options.forceReload) {
			textEditorOptions.forceReload = true;
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

		if (options.ignoreError) {
			textEditorOptions.ignoreError = true;
		}

		if (typeof options.index === 'number') {
			textEditorOptions.index = options.index;
		}

		return textEditorOptions;
	}

	/**
	 * Returns if this options object has objects defined for the editor.
	 */
	hasOptionsDefined(): boolean {
		return !!this.editorViewState || (!isUndefinedOrNull(this.startLineNumber) && !isUndefinedOrNull(this.startColumn));
	}

	/**
	 * Tells the editor to set show the given selection when the editor is being opened.
	 */
	selection(startLineNumber: number, startColumn: number, endLineNumber: number = startLineNumber, endColumn: number = startColumn): EditorOptions {
		this.startLineNumber = startLineNumber;
		this.startColumn = startColumn;
		this.endLineNumber = endLineNumber;
		this.endColumn = endColumn;

		return this;
	}

	/**
	 * Create a TextEditorOptions inline to be used when the editor is opening.
	 */
	static fromEditor(editor: ICodeEditor, settings?: IEditorOptions): TextEditorOptions {
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
	apply(editor: ICodeEditor, scrollType: ScrollType): boolean {

		// View state
		return this.applyViewState(editor, scrollType);
	}

	private applyViewState(editor: ICodeEditor, scrollType: ScrollType): boolean {
		let gotApplied = false;

		// First try viewstate
		if (this.editorViewState) {
			editor.restoreViewState(this.editorViewState);
			gotApplied = true;
		}

		// Otherwise check for selection
		else if (!isUndefinedOrNull(this.startLineNumber) && !isUndefinedOrNull(this.startColumn)) {

			// Select
			if (!isUndefinedOrNull(this.endLineNumber) && !isUndefinedOrNull(this.endColumn)) {
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

export interface IEditorIdentifier {
	groupId: GroupIdentifier;
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

export class EditorCommandsContextActionRunner extends ActionRunner {

	constructor(
		private context: IEditorCommandsContext
	) {
		super();
	}

	run(action: IAction): Promise<void> {
		return super.run(action, this.context);
	}
}

export interface IEditorCloseEvent extends IEditorIdentifier {
	replaced: boolean;
	index: number;
}

export type GroupIdentifier = number;

export interface IWorkbenchEditorConfiguration {
	workbench: {
		editor: IEditorPartConfiguration,
		iconTheme: string;
	};
}

interface IEditorPartConfiguration {
	showTabs?: boolean;
	highlightModifiedTabs?: boolean;
	tabCloseButton?: 'left' | 'right' | 'off';
	tabSizing?: 'fit' | 'shrink';
	focusRecentEditorAfterClose?: boolean;
	showIcons?: boolean;
	enablePreview?: boolean;
	enablePreviewFromQuickOpen?: boolean;
	closeOnFileDelete?: boolean;
	openPositioning?: 'left' | 'right' | 'first' | 'last';
	openSideBySideDirection?: 'right' | 'down';
	closeEmptyGroups?: boolean;
	revealIfOpen?: boolean;
	mouseBackForwardToNavigate?: boolean;
	labelFormat?: 'default' | 'short' | 'medium' | 'long';
	restoreViewState?: boolean;
}

export interface IEditorPartOptions extends IEditorPartConfiguration {
	iconTheme?: string;
}

export enum SideBySideEditor {
	MASTER = 1,
	DETAILS = 2
}

export interface IResourceOptions {
	supportSideBySide?: SideBySideEditor;
	filterByScheme?: string | string[];
}

export function toResource(editor: IEditorInput | undefined, options?: IResourceOptions): URI | undefined {
	if (!editor) {
		return undefined;
	}

	if (options && options.supportSideBySide && editor instanceof SideBySideEditorInput) {
		editor = options.supportSideBySide === SideBySideEditor.MASTER ? editor.master : editor.details;
	}

	const resource = editor.getResource();
	if (!resource || !options || !options.filterByScheme) {
		return resource;
	}

	if (Array.isArray(options.filterByScheme) && options.filterByScheme.some(scheme => resource.scheme === scheme)) {
		return resource;
	}

	if (options.filterByScheme === resource.scheme) {
		return resource;
	}

	return undefined;
}

export const enum CloseDirection {
	LEFT,
	RIGHT
}

export interface IEditorMemento<T> {

	saveEditorState(group: IEditorGroup, resource: URI, state: T): void;
	saveEditorState(group: IEditorGroup, editor: EditorInput, state: T): void;

	loadEditorState(group: IEditorGroup, resource: URI): T | undefined;
	loadEditorState(group: IEditorGroup, editor: EditorInput): T | undefined;

	clearEditorState(resource: URI, group?: IEditorGroup): void;
	clearEditorState(editor: EditorInput, group?: IEditorGroup): void;
}

class EditorInputFactoryRegistry implements IEditorInputFactoryRegistry {
	private instantiationService: IInstantiationService;
	private fileInputFactory: IFileInputFactory;
	private readonly editorInputFactoryConstructors: Map<string, IConstructorSignature0<IEditorInputFactory>> = new Map();
	private readonly editorInputFactoryInstances: Map<string, IEditorInputFactory> = new Map();

	start(accessor: ServicesAccessor): void {
		this.instantiationService = accessor.get(IInstantiationService);

		this.editorInputFactoryConstructors.forEach((ctor, key) => {
			this.createEditorInputFactory(key, ctor);
		});

		this.editorInputFactoryConstructors.clear();
	}

	private createEditorInputFactory(editorInputId: string, ctor: IConstructorSignature0<IEditorInputFactory>): void {
		const instance = this.instantiationService.createInstance(ctor);
		this.editorInputFactoryInstances.set(editorInputId, instance);
	}

	registerFileInputFactory(factory: IFileInputFactory): void {
		this.fileInputFactory = factory;
	}

	getFileInputFactory(): IFileInputFactory {
		return this.fileInputFactory;
	}

	registerEditorInputFactory(editorInputId: string, ctor: IConstructorSignature0<IEditorInputFactory>): void {
		if (!this.instantiationService) {
			this.editorInputFactoryConstructors.set(editorInputId, ctor);
		} else {
			this.createEditorInputFactory(editorInputId, ctor);
		}
	}

	getEditorInputFactory(editorInputId: string): IEditorInputFactory | undefined {
		return this.editorInputFactoryInstances.get(editorInputId);
	}
}

export const Extensions = {
	EditorInputFactories: 'workbench.contributions.editor.inputFactories'
};

Registry.add(Extensions.EditorInputFactories, new EditorInputFactoryRegistry());

export async function pathsToEditors(paths: IPathData[] | undefined, fileService: IFileService): Promise<(IResourceInput | IUntitledResourceInput)[]> {
	if (!paths || !paths.length) {
		return [];
	}

	const editors = await Promise.all(paths.map(async path => {
		const resource = URI.revive(path.fileUri);
		if (!resource || !fileService.canHandleResource(resource)) {
			return;
		}

		const exists = (typeof path.exists === 'boolean') ? path.exists : await fileService.exists(resource);

		const options: ITextEditorOptions = { pinned: true };
		if (exists && typeof path.lineNumber === 'number') {
			options.selection = {
				startLineNumber: path.lineNumber,
				startColumn: path.columnNumber || 1
			};
		}

		let input: IResourceInput | IUntitledResourceInput;
		if (!exists) {
			input = { resource, options, forceUntitled: true };
		} else {
			input = { resource, options, forceFile: true };
		}

		return input;
	}));

	return coalesce(editors);
}
