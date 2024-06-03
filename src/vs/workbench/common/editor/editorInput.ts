/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { firstOrDefault } from 'vs/base/common/arrays';
import { EditorInputCapabilities, Verbosity, GroupIdentifier, ISaveOptions, IRevertOptions, IMoveResult, IEditorDescriptor, IEditorPane, IUntypedEditorInput, EditorResourceAccessor, AbstractEditorInput, isEditorInput, IEditorIdentifier } from 'vs/workbench/common/editor';
import { isEqual } from 'vs/base/common/resources';
import { ConfirmResult } from 'vs/platform/dialogs/common/dialogs';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';

export interface IEditorCloseHandler {

	/**
	 * If `true`, will call into the `confirm` method to ask for confirmation
	 * before closing the editor.
	 */
	showConfirm(): boolean;

	/**
	 * Allows an editor to control what should happen when the editor
	 * (or a list of editor of the same kind) is being closed.
	 *
	 * By default a file specific dialog will open if the editor is
	 * dirty and not in the process of saving.
	 *
	 * If the editor is not dealing with files or another condition
	 * should be used besides dirty state, this method should be
	 * implemented to show a different dialog.
	 *
	 * @param editors All editors of the same kind that are being closed. Should be used
	 * to show a combined dialog.
	 */
	confirm(editors: ReadonlyArray<IEditorIdentifier>): Promise<ConfirmResult>;
}

export interface IUntypedEditorOptions {

	/**
	 * Implementations should try to preserve as much
	 * view state as possible from the typed input based
	 * on the group the editor is opened.
	 */
	readonly preserveViewState?: GroupIdentifier;

	/**
	 * Implementations should preserve the original
	 * resource of the typed input and not alter
	 * it.
	 */
	readonly preserveResource?: boolean;
}

/**
 * Editor inputs are lightweight objects that can be passed to the workbench API to open inside the editor part.
 * Each editor input is mapped to an editor that is capable of opening it through the Platform facade.
 */
export abstract class EditorInput extends AbstractEditorInput {

	protected readonly _onDidChangeDirty = this._register(new Emitter<void>());
	protected readonly _onDidChangeLabel = this._register(new Emitter<void>());
	protected readonly _onDidChangeCapabilities = this._register(new Emitter<void>());

	private readonly _onWillDispose = this._register(new Emitter<void>());

	/**
	 * Triggered when this input changes its dirty state.
	 */
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	/**
	 * Triggered when this input changes its label
	 */
	readonly onDidChangeLabel = this._onDidChangeLabel.event;

	/**
	 * Triggered when this input changes its capabilities.
	 */
	readonly onDidChangeCapabilities = this._onDidChangeCapabilities.event;

	/**
	 * Triggered when this input is about to be disposed.
	 */
	readonly onWillDispose = this._onWillDispose.event;

	/**
	 * Optional: subclasses can override to implement
	 * custom confirmation on close behavior.
	 */
	readonly closeHandler?: IEditorCloseHandler;

	/**
	 * Unique type identifier for this input. Every editor input of the
	 * same class should share the same type identifier. The type identifier
	 * is used for example for serialising/deserialising editor inputs
	 * via the serialisers of the `EditorInputFactoryRegistry`.
	 */
	abstract get typeId(): string;

	/**
	 * Returns the optional associated resource of this input.
	 *
	 * This resource should be unique for all editors of the same
	 * kind and input and is often used to identify the editor input among
	 * others.
	 *
	 * **Note:** DO NOT use this property for anything but identity
	 * checks. DO NOT use this property to present as label to the user.
	 * Please refer to `EditorResourceAccessor` documentation in that case.
	 */
	abstract get resource(): URI | undefined;

	/**
	 * Identifies the type of editor this input represents
	 * This ID is registered with the {@link EditorResolverService} to allow
	 * for resolving an untyped input to a typed one
	 */
	get editorId(): string | undefined {
		return undefined;
	}

	/**
	 * The capabilities of the input.
	 */
	get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly;
	}

	/**
	 * Figure out if the input has the provided capability.
	 */
	hasCapability(capability: EditorInputCapabilities): boolean {
		if (capability === EditorInputCapabilities.None) {
			return this.capabilities === EditorInputCapabilities.None;
		}

		return (this.capabilities & capability) !== 0;
	}

	isReadonly(): boolean | IMarkdownString {
		return this.hasCapability(EditorInputCapabilities.Readonly);
	}

	/**
	 * Returns the display name of this input.
	 */
	getName(): string {
		return `Editor ${this.typeId}`;
	}

	/**
	 * Returns the display description of this input.
	 */
	getDescription(verbosity?: Verbosity): string | undefined {
		return undefined;
	}

	/**
	 * Returns the display title of this input.
	 */
	getTitle(verbosity?: Verbosity): string {
		return this.getName();
	}

	/**
	 * Returns the extra classes to apply to the label of this input.
	 */
	getLabelExtraClasses(): string[] {
		return [];
	}

	/**
	 * Returns the aria label to be read out by a screen reader.
	 */
	getAriaLabel(): string {
		return this.getTitle(Verbosity.SHORT);
	}

	/**
	 * Returns the icon which represents this editor input.
	 * If undefined, the default icon will be used.
	 */
	getIcon(): ThemeIcon | undefined {
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
		return { typeId: this.typeId };
	}

	/**
	 * Returns if this input is dirty or not.
	 */
	isDirty(): boolean {
		return false;
	}

	/**
	 * Returns if the input has unsaved changes.
	 */
	isModified(): boolean {
		return this.isDirty();
	}

	/**
	 * Returns if this input is currently being saved or soon to be
	 * saved. Based on this assumption the editor may for example
	 * decide to not signal the dirty state to the user assuming that
	 * the save is scheduled to happen anyway.
	 */
	isSaving(): boolean {
		return false;
	}

	/**
	 * Returns a type of `IDisposable` that represents the resolved input.
	 * Subclasses should override to provide a meaningful model or return
	 * `null` if the editor does not require a model.
	 *
	 * The `options` parameter are passed down from the editor when the
	 * input is resolved as part of it.
	 */
	async resolve(): Promise<IDisposable | null> {
		return null;
	}

	/**
	 * Saves the editor. The provided groupId helps implementors
	 * to e.g. preserve view state of the editor and re-open it
	 * in the correct group after saving.
	 *
	 * @returns the resulting editor input (typically the same) of
	 * this operation or `undefined` to indicate that the operation
	 * failed or was canceled.
	 */
	async save(group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		return this;
	}

	/**
	 * Saves the editor to a different location. The provided `group`
	 * helps implementors to e.g. preserve view state of the editor
	 * and re-open it in the correct group after saving.
	 *
	 * @returns the resulting editor input (typically a different one)
	 * of this operation or `undefined` to indicate that the operation
	 * failed or was canceled.
	 */
	async saveAs(group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		return this;
	}

	/**
	 * Reverts this input from the provided group.
	 */
	async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> { }

	/**
	 * Called to determine how to handle a resource that is renamed that matches
	 * the editors resource (or is a child of).
	 *
	 * Implementors are free to not implement this method to signal no intent
	 * to participate. If an editor is returned though, it will replace the
	 * current one with that editor and optional options.
	 */
	async rename(group: GroupIdentifier, target: URI): Promise<IMoveResult | undefined> {
		return undefined;
	}

	/**
	 * Returns a copy of the current editor input. Used when we can't just reuse the input
	 */
	copy(): EditorInput {
		return this;
	}

	/**
	 * Indicates if this editor can be moved to another group. By default
	 * editors can freely be moved around groups. If an editor cannot be
	 * moved, a message should be returned to show to the user.
	 *
	 * @returns `true` if the editor can be moved to the target group, or
	 * a string with a message to show to the user if the editor cannot be
	 * moved.
	 */
	canMove(sourceGroup: GroupIdentifier, targetGroup: GroupIdentifier): true | string {
		return true;
	}

	/**
	 * Returns if the other object matches this input.
	 */
	matches(otherInput: EditorInput | IUntypedEditorInput): boolean {

		// Typed inputs: via  === check
		if (isEditorInput(otherInput)) {
			return this === otherInput;
		}

		// Untyped inputs: go into properties
		const otherInputEditorId = otherInput.options?.override;

		// If the overrides are both defined and don't match that means they're separate inputs
		if (this.editorId !== otherInputEditorId && otherInputEditorId !== undefined && this.editorId !== undefined) {
			return false;
		}

		return isEqual(this.resource, EditorResourceAccessor.getCanonicalUri(otherInput));
	}

	/**
	 * If a editor was registered onto multiple editor panes, this method
	 * will be asked to return the preferred one to use.
	 *
	 * @param editorPanes a list of editor pane descriptors that are candidates
	 * for the editor to open in.
	 */
	prefersEditorPane<T extends IEditorDescriptor<IEditorPane>>(editorPanes: T[]): T | undefined {
		return firstOrDefault(editorPanes);
	}

	/**
	 * Returns a representation of this typed editor input as untyped
	 * resource editor input that e.g. can be used to serialize the
	 * editor input into a form that it can be restored.
	 *
	 * May return `undefined` if an untyped representation is not supported.
	 */
	toUntyped(options?: IUntypedEditorOptions): IUntypedEditorInput | undefined {
		return undefined;
	}

	/**
	 * Returns if this editor is disposed.
	 */
	isDisposed(): boolean {
		return this._store.isDisposed;
	}

	override dispose(): void {
		if (!this.isDisposed()) {
			this._onWillDispose.fire();
		}

		super.dispose();
	}
}
