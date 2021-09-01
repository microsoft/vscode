/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorInput, EditorInputCapabilities, GroupIdentifier, ISaveOptions, IRevertOptions, EditorExtensions, IEditorFactoryRegistry, IEditorSerializer, ISideBySideEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
/**
 * Side by side editor inputs that have a primary and secondary side.
 */
export class SideBySideEditorInput extends EditorInput implements ISideBySideEditorInput {

	static readonly ID: string = 'workbench.editorinputs.sidebysideEditorInput';

	override get typeId(): string {
		return SideBySideEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {

		// Use primary capabilities as main capabilities...
		let capabilities = this._primary.capabilities;

		// ...with the exception of `CanSplitInGroup` which
		// is only relevant to single editors.
		capabilities &= ~EditorInputCapabilities.CanSplitInGroup;

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

		// Re-emit some events from the primary side to the outside
		this._register(this.primary.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this._register(this.primary.onDidChangeLabel(() => this._onDidChangeLabel.fire()));

		// Re-emit some events from both sides to the outside
		this._register(this.primary.onDidChangeCapabilities(() => this._onDidChangeCapabilities.fire()));
		this._register(this.secondary.onDidChangeCapabilities(() => this._onDidChangeCapabilities.fire()));
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

		return { ...descriptor, ...super.getTelemetryDescriptor() };
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

	override matches(otherInput: IEditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}

		if (otherInput instanceof SideBySideEditorInput) {
			return this.primary.matches(otherInput.primary) && this.secondary.matches(otherInput.secondary);
		}

		return false;
	}
}

// Register SideBySide/DiffEditor Input Serializer
interface ISerializedSideBySideEditorInput {
	name: string;
	description: string | undefined;

	primarySerialized: string;
	secondarySerialized: string;

	primaryTypeId: string;
	secondaryTypeId: string;
}

export abstract class AbstractSideBySideEditorInputSerializer implements IEditorSerializer {

	private getSerializers(secondaryEditorInputTypeId: string, primaryEditorInputTypeId: string): [IEditorSerializer | undefined, IEditorSerializer | undefined] {
		const registry = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);

		return [registry.getEditorSerializer(secondaryEditorInputTypeId), registry.getEditorSerializer(primaryEditorInputTypeId)];
	}

	canSerialize(editorInput: EditorInput): boolean {
		const input = editorInput as SideBySideEditorInput | DiffEditorInput;

		if (input.primary && input.secondary) {
			const [secondaryInputSerializer, primaryInputSerializer] = this.getSerializers(input.secondary.typeId, input.primary.typeId);

			return !!(secondaryInputSerializer?.canSerialize(input.secondary) && primaryInputSerializer?.canSerialize(input.primary));
		}

		return false;
	}

	serialize(editorInput: EditorInput): string | undefined {
		const input = editorInput as SideBySideEditorInput;

		if (input.primary && input.secondary) {
			const [secondaryInputSerializer, primaryInputSerializer] = this.getSerializers(input.secondary.typeId, input.primary.typeId);
			if (primaryInputSerializer && secondaryInputSerializer) {
				const primarySerialized = primaryInputSerializer.serialize(input.primary);
				const secondarySerialized = secondaryInputSerializer.serialize(input.secondary);

				if (primarySerialized && secondarySerialized) {
					const serializedEditorInput: ISerializedSideBySideEditorInput = {
						name: input.getName(),
						description: input.getDescription(),
						primarySerialized: primarySerialized,
						secondarySerialized: secondarySerialized,
						primaryTypeId: input.primary.typeId,
						secondaryTypeId: input.secondary.typeId
					};

					return JSON.stringify(serializedEditorInput);
				}
			}
		}

		return undefined;
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput | undefined {
		const deserialized: ISerializedSideBySideEditorInput = JSON.parse(serializedEditorInput);

		const [secondaryInputSerializer, primaryInputSerializer] = this.getSerializers(deserialized.secondaryTypeId, deserialized.primaryTypeId);
		if (primaryInputSerializer && secondaryInputSerializer) {
			const primaryInput = primaryInputSerializer.deserialize(instantiationService, deserialized.primarySerialized);
			const secondaryInput = secondaryInputSerializer.deserialize(instantiationService, deserialized.secondarySerialized);

			if (primaryInput instanceof EditorInput && secondaryInput instanceof EditorInput) {
				return this.createEditorInput(instantiationService, deserialized.name, deserialized.description, secondaryInput, primaryInput);
			}
		}

		return undefined;
	}

	protected abstract createEditorInput(instantiationService: IInstantiationService, name: string, description: string | undefined, secondaryInput: EditorInput, primaryInput: EditorInput): EditorInput;
}

export class SideBySideEditorInputSerializer extends AbstractSideBySideEditorInputSerializer {

	protected createEditorInput(instantiationService: IInstantiationService, name: string, description: string | undefined, secondaryInput: EditorInput, primaryInput: EditorInput): EditorInput {
		return new SideBySideEditorInput(name, description, secondaryInput, primaryInput);
	}
}
