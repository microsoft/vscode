/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { AbstractThreeColumnEditorInputSerializer, ThreeColumnEditorInput } from './threeColumnEditorInput';
import { EditorInput } from './editorInput';
import { EditorModel } from './editorModel';
import { TEXT_MERGE_EDITOR_ID, BINARY_DIFF_EDITOR_ID, Verbosity, IEditorDescriptor, IEditorPane, GroupIdentifier, IResourceMergeEditorInput, IUntypedEditorInput, DEFAULT_EDITOR_ASSOCIATION, isResourceMergeEditorInput, IMergeEditorInput, IResourceThreeColumnEditorInput, EditorInputCapabilities } from 'vs/workbench/common/editor';
import { BaseTextEditorModel } from './textEditorModel';
import { TextMergeEditorModel } from './textMergeEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { shorten } from 'vs/base/common/labels';
import { URI } from 'vs/base/common/uri';

interface IMergeEditorInputLabels {
	name: string;

	shortDescription: string | undefined;
	mediumDescription: string | undefined;
	longDescription: string | undefined;

	forceDescription: boolean;

	shortTitle: string;
	mediumTitle: string;
	longTitle: string;
}

/**
 * The base editor input for the merge editor. It is made up of three editor
 * inputs, the current version, the incoming version, and the output version.
 */
export class MergeEditorInput extends ThreeColumnEditorInput implements IMergeEditorInput {

	static override readonly ID: string = 'workbench.editors.mergeEditorInput';

	override get typeId(): string {
		return MergeEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return DEFAULT_EDITOR_ASSOCIATION.id;
	}

	override get capabilities(): EditorInputCapabilities {
		let capabilities = super.capabilities;

		// Force description capability depends on labels
		if (this.labels.forceDescription) {
			capabilities |= EditorInputCapabilities.ForceDescription;
		}

		return capabilities;
	}

	private cachedModel: TextMergeEditorModel | undefined = undefined;

	private readonly labels = this.computeLabels();

	constructor(
		preferredName: string | undefined,
		preferredDescription: string | undefined,
		readonly commonAncestor: EditorInput,
		readonly current: EditorInput,
		readonly output: EditorInput,
		readonly incoming: EditorInput,
		private readonly forceOpenAsBinary: boolean | undefined,
		@IEditorService editorService: IEditorService
	) {
		super(preferredName, preferredDescription, current, output, incoming, editorService);
	}

	private computeLabels(): IMergeEditorInputLabels {

		// Name
		let name: string;
		let forceDescription = false;
		if (this.preferredName) {
			name = this.preferredName;
		} else {
			const currentName = this.current.getName();
			const incomingName = this.incoming.getName();
			const outputName = this.output.getName();

			name = localize('threeColumnLabels', "{0} ↔ {1} ↔ {2}", currentName, outputName, incomingName);

			// Enforce description when the names are identical
			forceDescription = (currentName === outputName) && (outputName === incomingName);
		}

		// Description
		let shortDescription: string | undefined;
		let mediumDescription: string | undefined;
		let longDescription: string | undefined;
		if (this.preferredDescription) {
			shortDescription = this.preferredDescription;
			mediumDescription = this.preferredDescription;
			longDescription = this.preferredDescription;
		} else {
			shortDescription = this.computeLabel(this.current.getDescription(Verbosity.SHORT), this.output.getDescription(Verbosity.SHORT), this.incoming.getDescription(Verbosity.SHORT));
			longDescription = this.computeLabel(this.current.getDescription(Verbosity.LONG), this.output.getDescription(Verbosity.LONG), this.incoming.getDescription(Verbosity.LONG));

			// Medium Description: try to be verbose by computing
			// a label that resembles the difference between the two
			const outputMediumDescription = this.output.getDescription(Verbosity.MEDIUM);
			const currentMediumDescription = this.current.getDescription(Verbosity.MEDIUM);
			const incomingMediumDescription = this.incoming.getDescription(Verbosity.MEDIUM);
			if (typeof currentMediumDescription === 'string' && typeof outputMediumDescription === 'string' && typeof incomingMediumDescription === 'string') {
				const [shortenedCurrentMediumDescription, shortenedOutputMediumDescription, shortenedIncomingMediumDescription] = shorten([currentMediumDescription, outputMediumDescription, incomingMediumDescription]);
				mediumDescription = this.computeLabel(shortenedCurrentMediumDescription, shortenedOutputMediumDescription, shortenedIncomingMediumDescription);
			}
		}

		// Title
		const shortTitle = this.computeLabel(this.current.getTitle(Verbosity.SHORT) ?? this.current.getName(), this.output.getTitle(Verbosity.SHORT) ?? this.output.getName(), this.incoming.getTitle(Verbosity.SHORT) ?? this.incoming.getName(), ' ↔ ');
		const mediumTitle = this.computeLabel(this.current.getTitle(Verbosity.MEDIUM) ?? this.current.getName(), this.output.getTitle(Verbosity.MEDIUM) ?? this.output.getName(), this.incoming.getTitle(Verbosity.MEDIUM) ?? this.incoming.getName(), ' ↔ ');
		const longTitle = this.computeLabel(this.current.getTitle(Verbosity.LONG) ?? this.current.getName(), this.output.getTitle(Verbosity.LONG) ?? this.output.getName(), this.incoming.getTitle(Verbosity.LONG) ?? this.incoming.getName(), ' ↔ ');

		return { name, shortDescription, mediumDescription, longDescription, forceDescription, shortTitle, mediumTitle, longTitle };
	}

	private computeLabel(currentLabel: string, outputLabel: string, incomingLabel: string, separator?: string): string;
	private computeLabel(currentLabel: string | undefined, outputLabel: string | undefined, incomingLabel: string | undefined, separator?: string): string | undefined;
	private computeLabel(currentLabel: string | undefined, outputLabel: string | undefined, incomingLabel: string | undefined, separator = ' - '): string | undefined {
		if (!currentLabel || !outputLabel || !incomingLabel) {
			return undefined;
		}

		if (currentLabel === outputLabel && outputLabel === incomingLabel) {
			return outputLabel;
		}

		return `${currentLabel}${separator}${outputLabel}${separator}${incomingLabel}`;
	}

	override get resource(): URI | undefined {
		return this.output.resource;
	}

	override getName(): string {
		return this.labels.name;
	}

	override getDescription(verbosity = Verbosity.MEDIUM): string | undefined {
		switch (verbosity) {
			case Verbosity.SHORT:
				return this.labels.shortDescription;
			case Verbosity.LONG:
				return this.labels.longDescription;
			case Verbosity.MEDIUM:
			default:
				return this.labels.mediumDescription;
		}
	}

	override getTitle(verbosity?: Verbosity): string {
		switch (verbosity) {
			case Verbosity.SHORT:
				return this.labels.shortTitle;
			case Verbosity.LONG:
				return this.labels.longTitle;
			default:
			case Verbosity.MEDIUM:
				return this.labels.mediumTitle;
		}
	}

	override async resolve(): Promise<EditorModel> {

		// Create Model - we never reuse our cached model if refresh is true because we cannot
		// decide for the inputs within if the cached model can be reused or not. There may be
		// inputs that need to be loaded again and thus we always recreate the model and dispose
		// the previous one - if any.
		const resolvedModel = await this.createModel();
		if (this.cachedModel) {
			this.cachedModel.dispose();
		}

		this.cachedModel = resolvedModel;

		return this.cachedModel;
	}

	override prefersEditorPane<T extends IEditorDescriptor<IEditorPane>>(editorPanes: T[]): T | undefined {
		if (this.forceOpenAsBinary) {
			return editorPanes.find(editorPane => editorPane.typeId === BINARY_DIFF_EDITOR_ID);
		}

		return editorPanes.find(editorPane => editorPane.typeId === TEXT_MERGE_EDITOR_ID);
	}

	private async createModel(): Promise<TextMergeEditorModel> {

		// Join resolve call over two inputs and build diff editor model
		const [commonAncestorModel, currentEditorModel, outputEditorModel, incomingEditorModel] = await Promise.all([
			this.commonAncestor.resolve(),
			this.current.resolve(),
			this.output.resolve(),
			this.incoming.resolve(),
		]);

		// If all are text models, return textmergeeditor model
		if (commonAncestorModel instanceof BaseTextEditorModel && currentEditorModel instanceof BaseTextEditorModel && outputEditorModel instanceof BaseTextEditorModel && incomingEditorModel instanceof BaseTextEditorModel) {
			return new TextMergeEditorModel(commonAncestorModel, currentEditorModel, outputEditorModel, incomingEditorModel, this.cachedModel?.state ?? undefined);
		}

		// Otherwise throws
		throw new Error('Only text based merge editor is supported now.');
	}

	override toUntyped(options?: { preserveViewState: GroupIdentifier }): (IResourceMergeEditorInput & IResourceThreeColumnEditorInput) | undefined {
		const untyped = super.toUntyped(options);
		if (untyped) {
			return {
				...untyped,
				commonAncestor: untyped.center,
				current: untyped.left,
				output: untyped.center,
				incoming: untyped.right,
			};
		}

		return undefined;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}

		if (otherInput instanceof MergeEditorInput) {
			return this.current.matches(otherInput.current) && this.output.matches(otherInput.output) && this.incoming.matches(otherInput.incoming) && otherInput.forceOpenAsBinary === this.forceOpenAsBinary;
		}

		if (isResourceMergeEditorInput(otherInput)) {
			return this.current.matches(otherInput.current) && this.output.matches(otherInput.output) && this.incoming.matches(otherInput.incoming);
		}

		return false;
	}

	override dispose(): void {

		// Free the diff editor model but do not propagate the dispose() call to the two inputs
		// We never created the two inputs (original and modified) so we can not dispose
		// them without sideeffects.
		if (this.cachedModel) {
			this.cachedModel.dispose();
			this.cachedModel = undefined;
		}

		super.dispose();
	}
}

export class MergeEditorInputSerializer extends AbstractThreeColumnEditorInputSerializer {

	protected createEditorInput(instantiationService: IInstantiationService, name: string | undefined, description: string | undefined, leftInput: EditorInput, centerInput: EditorInput, rightInput: EditorInput): EditorInput {
		// TODO: properly implement MergeEditorInputSerializer
		return instantiationService.createInstance(MergeEditorInput, name, description, centerInput, leftInput, centerInput, rightInput, undefined);
	}
}
