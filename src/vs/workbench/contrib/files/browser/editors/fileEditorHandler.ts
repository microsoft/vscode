/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { ITextEditorService } from '../../../../services/textfile/common/textEditorService.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IWorkingCopyIdentifier, NO_TYPE_ID } from '../../../../services/workingCopy/common/workingCopy.js';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from '../../../../services/workingCopy/common/workingCopyEditorService.js';
import { FileEditorInput } from './fileEditorInput.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

interface ISerializedFileEditorInput {
	resourceJSON: UriComponents;
	preferredResourceJSON?: UriComponents;
	name?: string;
	description?: string;
	encoding?: string;
	modeId?: string; // should be `languageId` but is kept for backwards compatibility
}

export class FileEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(editorInput: EditorInput): string {
		const fileEditorInput = editorInput as FileEditorInput;
		const resource = fileEditorInput.resource;
		const preferredResource = fileEditorInput.preferredResource;
		const serializedFileEditorInput: ISerializedFileEditorInput = {
			resourceJSON: resource.toJSON(),
			preferredResourceJSON: isEqual(resource, preferredResource) ? undefined : preferredResource, // only storing preferredResource if it differs from the resource
			name: fileEditorInput.getPreferredName(),
			description: fileEditorInput.getPreferredDescription(),
			encoding: fileEditorInput.getEncoding(),
			modeId: fileEditorInput.getPreferredLanguageId() // only using the preferred user associated language here if available to not store redundant data
		};

		return JSON.stringify(serializedFileEditorInput);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): FileEditorInput {
		return instantiationService.invokeFunction(accessor => {
			const serializedFileEditorInput: ISerializedFileEditorInput = JSON.parse(serializedEditorInput);
			const resource = URI.revive(serializedFileEditorInput.resourceJSON);
			const preferredResource = URI.revive(serializedFileEditorInput.preferredResourceJSON);
			const name = serializedFileEditorInput.name;
			const description = serializedFileEditorInput.description;
			const encoding = serializedFileEditorInput.encoding;
			const languageId = serializedFileEditorInput.modeId;

			const fileEditorInput = accessor.get(ITextEditorService).createTextEditor({ resource, label: name, description, encoding, languageId, forceFile: true }) as FileEditorInput;
			if (preferredResource) {
				fileEditorInput.setPreferredResource(preferredResource);
			}

			return fileEditorInput;
		});
	}
}

export class FileEditorWorkingCopyEditorHandler extends Disposable implements IWorkbenchContribution, IWorkingCopyEditorHandler {

	static readonly ID = 'workbench.contrib.fileEditorWorkingCopyEditorHandler';

	constructor(
		@IWorkingCopyEditorService workingCopyEditorService: IWorkingCopyEditorService,
		@ITextEditorService private readonly textEditorService: ITextEditorService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		this._register(workingCopyEditorService.registerHandler(this));
	}

	handles(workingCopy: IWorkingCopyIdentifier): boolean | Promise<boolean> {
		return workingCopy.typeId === NO_TYPE_ID && this.fileService.canHandleResource(workingCopy.resource);
	}

	private handlesSync(workingCopy: IWorkingCopyIdentifier): boolean {
		return workingCopy.typeId === NO_TYPE_ID && this.fileService.hasProvider(workingCopy.resource);
	}

	isOpen(workingCopy: IWorkingCopyIdentifier, editor: EditorInput): boolean {
		if (!this.handlesSync(workingCopy)) {
			return false;
		}

		// Naturally it would make sense here to check for `instanceof FileEditorInput`
		// but because some custom editors also leverage text file based working copies
		// we need to do a weaker check by only comparing for the resource

		return isEqual(workingCopy.resource, editor.resource);
	}

	createEditor(workingCopy: IWorkingCopyIdentifier): EditorInput {
		return this.textEditorService.createTextEditor({ resource: workingCopy.resource, forceFile: true });
	}
}
