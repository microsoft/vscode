/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IEditorSerializer } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ITextEditorService } from 'vs/workbench/services/textfile/common/textEditorService';
import { isEqual } from 'vs/base/common/resources';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkingCopyIdentifier, NO_TYPE_ID } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { FileEditorInput } from 'vs/workbench/contrib/files/browser/editors/fileEditorInput';
import { IFileService } from 'vs/platform/files/common/files';

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
