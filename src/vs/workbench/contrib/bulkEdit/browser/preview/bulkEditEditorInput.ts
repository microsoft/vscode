/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputWithOptions, IEditorSerializer, IResourceBulkEditEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { URI } from 'vs/base/common/uri';
import { BugIndicatingError } from 'vs/base/common/errors';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { ResourceEdit } from 'vs/editor/browser/services/bulkEditService';
import { MultiDiffEditorInput } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput';

// TODO: What is common with multi diff editor input, should be combined
export class BulkEditEditorInput extends MultiDiffEditorInput {

	// TODO: Do we need the functions below, we never serialize no?
	public static fromResourceBulkEditEditorInput(input: IResourceBulkEditEditorInput, instantiationService: IInstantiationService): BulkEditEditorInput {
		if (!input.refactorPreviewSource && !input.diffResources && !input.edits) {
			throw new BugIndicatingError('BulkEditEditorInput requires either refactorPreviewSource or diffResources or edits to be set');
		}
		const refactorPreviewSource = input.refactorPreviewSource ?? URI.parse(`bulk-edit-editor:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
		return instantiationService.createInstance(
			BulkEditEditorInput,
			refactorPreviewSource,
			input.label,
			input.diffResources?.map(resource => {
				return new MultiDiffEditorItem(
					resource.original.resource,
					resource.modified.resource,
				);
			}),
			input.edits,
		);
	}

	static override readonly ID: string = 'workbench.input.bulkEditEditor';

	override get resource(): URI | undefined { return this.refactorPreviewSource; }
	override get typeId(): string { return BulkEditEditorInput.ID; }

	constructor(
		public readonly refactorPreviewSource: URI,
		label: string | undefined,
		initialResources: readonly MultiDiffEditorItem[] | undefined,
		private readonly edits: ResourceEdit[],
		@ITextModelService textModelService: ITextModelService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextFileService textFileService: ITextFileService,
	) {
		super(
			refactorPreviewSource,
			label,
			initialResources,
			textModelService,
			textResourceConfigurationService,
			instantiationService,
			multiDiffSourceResolverService,
			textFileService
		);
	}

	public get inputEdits(): ResourceEdit[] {
		return this.edits;
	}

	protected override getLabel(): string {
		return localize('name', "Bulk Edit Editor");
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof BulkEditEditorInput) {
			return this.refactorPreviewSource.toString() === otherInput.refactorPreviewSource.toString();
		}
		return false;
	}
}

export class BulkEditEditorResolverContribution extends Disposable {

	static readonly ID = 'workbench.contrib.bulkEditEditorResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`*`,
			{
				id: DEFAULT_EDITOR_ASSOCIATION.id,
				label: DEFAULT_EDITOR_ASSOCIATION.displayName,
				detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
				priority: RegisteredEditorPriority.builtin
			},
			{},
			{
				createBulkEditorInput: (bulkEditEditorInput: IResourceBulkEditEditorInput): EditorInputWithOptions => {
					return {
						editor: BulkEditEditorInput.fromResourceBulkEditEditorInput(bulkEditEditorInput, instantiationService),
					};
				},
			}
		));
	}
}

export class BulkEditEditorSerializer implements IEditorSerializer {
	canSerialize(editor: EditorInput): boolean {
		return false;
	}

	serialize(editor: BulkEditEditorInput): string | undefined {
		return undefined;
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		return undefined;
	}
}

