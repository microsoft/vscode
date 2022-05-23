/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorInputCapabilities, GroupIdentifier, ISaveOptions, IRevertOptions, EditorExtensions, IEditorFactoryRegistry, IEditorSerializer, isResourceSideBySideEditorInput, isResourceDiffEditorInput, IThreeColumnEditorInput, IUntypedEditorInput, isMergeEditorInput, isResourceMergeEditorInput, IResourceThreeColumnEditorInput, isResourceThreeColumnEditorInput, findViewStateForEditor, IMoveResult, isEditorInput, isResourceEditorInput, Verbosity } from 'vs/workbench/common/editor';
import { MergeEditorInput } from './mergeEditorInput';
import { EditorInput } from './editorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

/**
 * Three column editor inputs that have left, center, and right inputs.
 */
export class ThreeColumnEditorInput extends EditorInput implements IThreeColumnEditorInput {

	static readonly ID: string = 'workbench.editorinputs.threeColumnEditorInput';

	override get typeId(): string {
		return ThreeColumnEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {

		// Use center capabilities as main capabilities...
		let capabilities = this.center.capabilities;

		// ...with the exception of `CanSplitInGroup` which
		// is only relevant to single editors.
		capabilities &= ~EditorInputCapabilities.CanSplitInGroup;

		// Trust: should be considered for all sides
		if (this.left.hasCapability(EditorInputCapabilities.RequiresTrust), this.right.hasCapability(EditorInputCapabilities.RequiresTrust)) {
			capabilities |= EditorInputCapabilities.RequiresTrust;
		}

		// Singleton: should be considered for all sides
		if (this.left.hasCapability(EditorInputCapabilities.Singleton) && this.right.hasCapability(EditorInputCapabilities.Singleton)) {
			capabilities |= EditorInputCapabilities.Singleton;
		}

		return capabilities;
	}

	get resource(): URI | undefined {
		if (this.hasIdenticalColumns) {
			// pretend to be just primary side when being asked for a resource
			// in case both sides are the same. this can help when components
			// want to identify this input among others (e.g. in history).
			return this.center.resource;
		}

		return undefined;
	}

	private hasIdenticalColumns = this.center.matches(this.left) && this.center.matches(this.right);

	constructor(
		protected readonly preferredName: string | undefined,
		protected readonly preferredDescription: string | undefined,
		readonly left: EditorInput,
		readonly center: EditorInput,
		readonly right: EditorInput,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// When any input gets disposed, dispose this diff editor input
		this._register(Event.once(Event.any(this.left.onWillDispose, this.center.onWillDispose, this.right.onWillDispose))(() => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		// Re-emit some events from the center to the outside
		this._register(this.center.onDidChangeDirty(() => this._onDidChangeDirty.fire()));

		// Re-emit some events from all sides to the outside
		this._register(this.left.onDidChangeCapabilities(() => this._onDidChangeCapabilities.fire()));
		this._register(this.center.onDidChangeCapabilities(() => this._onDidChangeCapabilities.fire()));
		this._register(this.right.onDidChangeCapabilities(() => this._onDidChangeCapabilities.fire()));
		this._register(this.left.onDidChangeLabel(() => this._onDidChangeLabel.fire()));
		this._register(this.center.onDidChangeLabel(() => this._onDidChangeLabel.fire()));
		this._register(this.right.onDidChangeLabel(() => this._onDidChangeLabel.fire()));
	}

	override getName(): string {
		const preferredName = this.getPreferredName();
		if (preferredName) {
			return preferredName;
		}

		if (this.hasIdenticalColumns) {
			return this.center.getName(); // keep name concise when same editor is opened side by side
		}

		return localize('threeColumnLabels', "{0} - {1} - {2}", this.left.getName(), this.center.getName(), this.right.getName());
	}

	getPreferredName(): string | undefined {
		return this.preferredName;
	}

	override getDescription(verbosity?: Verbosity): string | undefined {
		const preferredDescription = this.getPreferredDescription();
		if (preferredDescription) {
			return preferredDescription;
		}

		if (this.hasIdenticalColumns) {
			return this.center.getDescription(verbosity);
		}

		return super.getDescription(verbosity);
	}

	getPreferredDescription(): string | undefined {
		return this.preferredDescription;
	}

	override getTitle(verbosity?: Verbosity): string {
		if (this.hasIdenticalColumns) {
			return this.center.getTitle(verbosity) ?? this.getName();
		}

		return super.getTitle(verbosity);
	}

	override getLabelExtraClasses(): string[] {
		if (this.hasIdenticalColumns) {
			return this.center.getLabelExtraClasses();
		}

		return super.getLabelExtraClasses();
	}

	override getAriaLabel(): string {
		if (this.hasIdenticalColumns) {
			return this.center.getAriaLabel();
		}

		return super.getAriaLabel();
	}

	override getTelemetryDescriptor(): { [key: string]: unknown } {
		const descriptor = this.center.getTelemetryDescriptor();

		return { ...descriptor, ...super.getTelemetryDescriptor() };
	}

	override isDirty(): boolean {
		return this.center.isDirty();
	}

	override isSaving(): boolean {
		return this.center.isSaving();
	}

	override async save(group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		const editor = await this.center.save(group, options) as EditorInput;
		if (!editor || !this.hasIdenticalColumns) {
			return editor;
		}

		return new ThreeColumnEditorInput(this.preferredName, this.preferredDescription, editor, editor, editor, this.editorService);
	}

	override async saveAs(group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		const editor = await this.center.saveAs(group, options) as EditorInput;
		if (!editor || !this.hasIdenticalColumns) {
			return editor;
		}

		return new ThreeColumnEditorInput(this.preferredName, this.preferredDescription, editor, editor, editor, this.editorService);
	}

	override revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		return this.center.revert(group, options);
	}

	override async rename(group: GroupIdentifier, target: URI): Promise<IMoveResult | undefined> {
		if (!this.hasIdenticalColumns) {
			return; // currently only enabled when all sides are identical
		}

		// Forward rename to primary side
		const renameResult = await this.center.rename(group, target);
		if (!renameResult) {
			return undefined;
		}

		// Build a side-by-side result from the rename result

		if (isEditorInput(renameResult.editor)) {
			return {
				editor: new ThreeColumnEditorInput(this.preferredName, this.preferredDescription, renameResult.editor, renameResult.editor, renameResult.editor, this.editorService),
				options: {
					...renameResult.options,
					viewState: findViewStateForEditor(this, group, this.editorService)
				}
			};
		}

		if (isResourceEditorInput(renameResult.editor)) {
			return {
				editor: {
					label: this.preferredName,
					description: this.preferredDescription,
					left: renameResult.editor,
					center: renameResult.editor,
					right: renameResult.editor,
					options: {
						...renameResult.options,
						viewState: findViewStateForEditor(this, group, this.editorService)
					}
				}
			};
		}

		return undefined;
	}

	override toUntyped(options?: { preserveViewState: GroupIdentifier }): IResourceThreeColumnEditorInput | undefined {
		const leftResourceEditorInput = this.left.toUntyped(options);
		const centerResourceEditorInput = this.center.toUntyped(options);
		const rightResourceEditorInput = this.right.toUntyped(options);

		// TODO: should prevent nested with diff editors, side-by-side editors, merge editors, three-column editors, here and also in sideBySideEditorInput.ts => a shared function is probably the best way
		// Prevent nested side by side editors which are unsupported
		if (
			leftResourceEditorInput && centerResourceEditorInput && rightResourceEditorInput &&
			!isResourceDiffEditorInput(leftResourceEditorInput) && !isResourceDiffEditorInput(centerResourceEditorInput) && !isResourceDiffEditorInput(rightResourceEditorInput) &&
			!isResourceSideBySideEditorInput(leftResourceEditorInput) && !isResourceSideBySideEditorInput(centerResourceEditorInput) && !isResourceSideBySideEditorInput(rightResourceEditorInput) &&
			!isResourceMergeEditorInput(leftResourceEditorInput) && !isResourceMergeEditorInput(centerResourceEditorInput) && !isResourceMergeEditorInput(rightResourceEditorInput) &&
			!isResourceThreeColumnEditorInput(leftResourceEditorInput) && !isResourceThreeColumnEditorInput(centerResourceEditorInput) && !isResourceThreeColumnEditorInput(rightResourceEditorInput)
		) {
			const untypedInput: IResourceThreeColumnEditorInput = {
				label: this.preferredName,
				description: this.preferredDescription,
				left: leftResourceEditorInput,
				center: centerResourceEditorInput,
				right: rightResourceEditorInput,
			};

			if (typeof options?.preserveViewState === 'number') {
				untypedInput.options = {
					viewState: findViewStateForEditor(this, options.preserveViewState, this.editorService)
				};
			}

			return untypedInput;
		}

		return undefined;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}

		if (isMergeEditorInput(otherInput) || isResourceMergeEditorInput(otherInput)) {
			return false; // prevent subclass from matching
		}

		if (otherInput instanceof ThreeColumnEditorInput) {
			return this.left.matches(otherInput.left) && this.center.matches(otherInput.center) && this.right.matches(otherInput.right);
		}

		if (isResourceThreeColumnEditorInput(otherInput)) {
			return this.left.matches(otherInput.left) && this.center.matches(otherInput.center) && this.right.matches(otherInput.right);
		}

		return false;
	}
}

// Register SideBySide/DiffEditor Input Serializer
interface ISerializedThreeColumnEditorInput {
	name: string | undefined;
	description: string | undefined;

	leftSerialized: string;
	centerSerialized: string;
	rightSerialized: string;

	leftTypeId: string;
	centerTypeId: string;
	rightTypeId: string;
}

export abstract class AbstractThreeColumnEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		const input = editorInput as ThreeColumnEditorInput | MergeEditorInput;

		if (input.left && input.center && input.right) {
			const [leftInputSerializer, centerInputSerializer, rightInputSerializer] = this.getSerializers(input.left.typeId, input.center.typeId, input.right.typeId);

			return !!(leftInputSerializer?.canSerialize(input.left) && centerInputSerializer?.canSerialize(input.center) && rightInputSerializer?.canSerialize(input.right));
		}

		return false;
	}

	serialize(editorInput: EditorInput): string | undefined {
		const input = editorInput as ThreeColumnEditorInput;

		if (input.center && input.left && input.right) {
			const [leftInputSerializer, centerInputSerializer, rightInputSerializer] = this.getSerializers(input.left.typeId, input.center.typeId, input.right.typeId);
			if (centerInputSerializer && leftInputSerializer && rightInputSerializer) {
				const leftSerialized = leftInputSerializer.serialize(input.left);
				const centerSerialized = centerInputSerializer.serialize(input.center);
				const rightSerialized = rightInputSerializer.serialize(input.right);

				if (centerSerialized && leftSerialized && rightSerialized) {
					const serializedEditorInput: ISerializedThreeColumnEditorInput = {
						name: input.getPreferredName(),
						description: input.getPreferredDescription(),
						leftSerialized: leftSerialized,
						centerSerialized: centerSerialized,
						rightSerialized: rightSerialized,
						leftTypeId: input.left.typeId,
						centerTypeId: input.center.typeId,
						rightTypeId: input.right.typeId
					};

					return JSON.stringify(serializedEditorInput);
				}
			}
		}

		return undefined;
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput | undefined {
		const deserialized = JSON.parse(serializedEditorInput) as ISerializedThreeColumnEditorInput;

		const [leftInputSerializer, centerInputSerializer, rightInputSerializer] = this.getSerializers(deserialized.leftTypeId, deserialized.centerTypeId, deserialized.rightTypeId);
		if (leftInputSerializer && centerInputSerializer && rightInputSerializer) {
			const leftInput = leftInputSerializer.deserialize(instantiationService, deserialized.leftSerialized);
			const centerInput = centerInputSerializer.deserialize(instantiationService, deserialized.centerSerialized);
			const rightInput = rightInputSerializer.deserialize(instantiationService, deserialized.rightSerialized);

			if (leftInput instanceof EditorInput && centerInput instanceof EditorInput && rightInput instanceof EditorInput) {
				return this.createEditorInput(instantiationService, deserialized.name, deserialized.description, leftInput, centerInput, rightInput);
			}
		}

		return undefined;
	}

	private getSerializers(leftEditorInputTypeId: string, centerEditorInputTypeId: string, rightEditorInputTypeId: string): [IEditorSerializer | undefined, IEditorSerializer | undefined, IEditorSerializer | undefined] {
		const registry = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);

		return [registry.getEditorSerializer(leftEditorInputTypeId), registry.getEditorSerializer(centerEditorInputTypeId), registry.getEditorSerializer(rightEditorInputTypeId)];
	}

	protected abstract createEditorInput(instantiationService: IInstantiationService, name: string | undefined, description: string | undefined, leftInput: EditorInput, centerInput: EditorInput, rightInput: EditorInput): EditorInput;
}

export class ThreeColumnEditorInputSerializer extends AbstractThreeColumnEditorInputSerializer {

	protected createEditorInput(instantiationService: IInstantiationService, name: string | undefined, description: string | undefined, leftInput: EditorInput, centerInput: EditorInput, rightInput: EditorInput): EditorInput {
		return instantiationService.createInstance(ThreeColumnEditorInput, name, description, leftInput, centerInput, rightInput);
	}
}
