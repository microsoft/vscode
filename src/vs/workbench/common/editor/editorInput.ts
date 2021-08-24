/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { firstOrDefault } from 'vs/base/common/arrays';
import { IEditorInput, EditorInputCapabilities, Verbosity, GroupIdentifier, ISaveOptions, IRevertOptions, IMoveResult, IEditorDescriptor, IEditorPane, IUntypedEditorInput, EditorResourceAccessor, AbstractEditorInput, isEditorInput, IEditorIdentifier } from 'vs/workbench/common/editor';
import { isEqual } from 'vs/base/common/resources';
import { ConfirmResult } from 'vs/platform/dialogs/common/dialogs';

/**
 * Editor inputs are lightweight objects that can be passed to the workbench API to open inside the editor part.
 * Each editor input is mapped to an editor that is capable of opening it through the Platform facade.
 */
export abstract class EditorInput extends AbstractEditorInput implements IEditorInput {

	protected readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	protected readonly _onDidChangeLabel = this._register(new Emitter<void>());
	readonly onDidChangeLabel = this._onDidChangeLabel.event;

	protected readonly _onDidChangeCapabilities = this._register(new Emitter<void>());
	readonly onDidChangeCapabilities = this._onDidChangeCapabilities.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	private disposed: boolean = false;

	abstract get typeId(): string;

	abstract get resource(): URI | undefined;

	get editorId(): string | undefined {
		return undefined;
	}

	get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly;
	}

	hasCapability(capability: EditorInputCapabilities): boolean {
		if (capability === EditorInputCapabilities.None) {
			return this.capabilities === EditorInputCapabilities.None;
		}

		return (this.capabilities & capability) !== 0;
	}

	getName(): string {
		return `Editor ${this.typeId}`;
	}

	getLabelExtraClasses(): string[] {
		return [];
	}

	getDescription(verbosity?: Verbosity): string | undefined {
		return undefined;
	}

	getTitle(verbosity?: Verbosity): string {
		return this.getName();
	}

	getAriaLabel(): string {
		return this.getTitle(Verbosity.SHORT);
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

	isDirty(): boolean {
		return false;
	}

	isSaving(): boolean {
		return false;
	}

	async resolve(): Promise<IEditorModel | null> {
		return null;
	}

	confirm?(editors?: ReadonlyArray<IEditorIdentifier>): Promise<ConfirmResult>;

	async save(group: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		return this;
	}

	async saveAs(group: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		return this;
	}

	async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> { }

	rename(group: GroupIdentifier, target: URI): IMoveResult | undefined {
		return undefined;
	}

	copy(): IEditorInput {
		return this;
	}

	matches(otherInput: IEditorInput | IUntypedEditorInput): boolean {

		// Typed inputs: via  === check
		if (isEditorInput(otherInput)) {
			return this === otherInput;
		}

		// Untyped inputs: go into properties
		const otherInputEditorId = otherInput.options?.override;

		if (this.editorId === undefined) {
			return false; // untyped inputs can only match for editors that have adopted `editorId`
		}

		if (this.editorId !== otherInputEditorId) {
			return false; // untyped input uses another `editorId`
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

	toUntyped(options?: { preserveViewState: GroupIdentifier }): IUntypedEditorInput | undefined {
		return undefined;
	}

	isDisposed(): boolean {
		return this.disposed;
	}

	override dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this._onWillDispose.fire();
		}

		super.dispose();
	}
}
