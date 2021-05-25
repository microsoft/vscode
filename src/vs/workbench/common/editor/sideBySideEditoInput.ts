/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IEditorInput, EditorInputCapabilities, GroupIdentifier, ISaveOptions, IRevertOptions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';

/**
 * Side by side editor inputs that have a primary and secondary side.
 */
export class SideBySideEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.editorinputs.sidebysideEditorInput';

	override get typeId(): string {
		return SideBySideEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {

		// Use primary capabilities as main capabilities
		let capabilities = this._primary.capabilities;

		// Trust: should be considered for both sides
		if (this._secondary.hasCapability(EditorInputCapabilities.RequiresTrust)) {
			capabilities |= EditorInputCapabilities.RequiresTrust;
		}

		// Singleton: should be considered for both sides
		if (this._secondary.hasCapability(EditorInputCapabilities.Singleton)) {
			capabilities |= EditorInputCapabilities.Singleton;
		}

		return capabilities;
	}

	get resource(): URI | undefined {
		return undefined; // use `EditorResourceAccessor` to obtain one side's resource
	}

	get primary(): EditorInput {
		return this._primary;
	}

	get secondary(): EditorInput {
		return this._secondary;
	}

	constructor(
		protected readonly name: string | undefined,
		protected readonly description: string | undefined,
		private readonly _secondary: EditorInput,
		private readonly _primary: EditorInput
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// When the primary or secondary input gets disposed, dispose this diff editor input
		const onceSecondaryDisposed = Event.once(this.secondary.onWillDispose);
		this._register(onceSecondaryDisposed(() => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		const oncePrimaryDisposed = Event.once(this.primary.onWillDispose);
		this._register(oncePrimaryDisposed(() => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		// Reemit some events from the primary side to the outside
		this._register(this.primary.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this._register(this.primary.onDidChangeLabel(() => this._onDidChangeLabel.fire()));
	}

	override getName(): string {
		if (!this.name) {
			return localize('sideBySideLabels', "{0} - {1}", this._secondary.getName(), this._primary.getName());
		}

		return this.name;
	}

	override getDescription(): string | undefined {
		return this.description;
	}

	override getTelemetryDescriptor(): { [key: string]: unknown } {
		const descriptor = this.primary.getTelemetryDescriptor();

		return Object.assign(descriptor, super.getTelemetryDescriptor());
	}

	override isDirty(): boolean {
		return this.primary.isDirty();
	}

	override isSaving(): boolean {
		return this.primary.isSaving();
	}

	override save(group: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		return this.primary.save(group, options);
	}

	override saveAs(group: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		return this.primary.saveAs(group, options);
	}

	override revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		return this.primary.revert(group, options);
	}

	override matches(otherInput: unknown): boolean {
		if (otherInput === this) {
			return true;
		}

		if (otherInput instanceof SideBySideEditorInput) {
			return this.primary.matches(otherInput.primary) && this.secondary.matches(otherInput.secondary);
		}

		return false;
	}
}
