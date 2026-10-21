/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { EditorInputCapabilities, findViewStateForEditor, GroupIdentifier, IMoveResult, ISaveOptions, IUntypedEditorInput } from '../../../common/editor.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { AbstractResourceEditorInput } from '../../../common/editor/resourceEditorInput.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IMAGE_PREVIEW_EDITOR_ID } from '../common/mediaPreview.js';
import { saveMediaFileAs } from './mediaPreviewSaveAs.js';

/**
 * Editor input for previewing an image file.
 */
export class ImagePreviewEditorInput extends AbstractResourceEditorInput {

	static readonly ID = 'workbench.input.imagePreview';

	constructor(
		resource: URI,
		preferredResource: URI | undefined,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@ICustomEditorLabelService customEditorLabelService: ICustomEditorLabelService,
		@IEditorService private readonly _editorService: IEditorService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
	) {
		super(resource, preferredResource, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
	}

	override get typeId(): string {
		return ImagePreviewEditorInput.ID;
	}

	override get editorId(): string {
		return IMAGE_PREVIEW_EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return (super.capabilities | EditorInputCapabilities.Readonly) & ~EditorInputCapabilities.CanDropIntoEditor;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}
		return otherInput instanceof ImagePreviewEditorInput && isEqual(this.resource, otherInput.resource);
	}

	override async rename(group: GroupIdentifier, target: URI): Promise<IMoveResult> {
		// Let the resolver pick the editor for the new name, which may no longer be an image
		return {
			editor: {
				resource: target,
				options: {
					viewState: findViewStateForEditor(this, group, this._editorService),
				},
			},
		};
	}

	override async saveAs(group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		const target = await saveMediaFileAs(this.resource, this.fileService, this._fileDialogService, options);
		return target ? (await this.rename(group, target)).editor : undefined;
	}

	override toUntyped(): IResourceEditorInput {
		return {
			resource: this.preferredResource,
			options: {
				override: this.editorId,
			},
		};
	}
}
