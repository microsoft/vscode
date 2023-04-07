/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IEditorSerializer } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ITextEditorService } from 'vs/workbench/services/textfile/common/textEditorService';
import { isEqual, relativePath } from 'vs/base/common/resources';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { NO_TYPE_ID } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { FileEditorInput } from 'vs/workbench/contrib/files/browser/editors/fileEditorInput';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

interface ISerializedFileEditorInput {
	resourceJSON: UriComponents;
	preferredResourceJSON?: UriComponents;
	relativeFilePath?: string;
	name?: string;
	description?: string;
	encoding?: string;
	modeId?: string; // should be `languageId` but is kept for backwards compatibility
}

export class FileEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(editorInput: EditorInput, relativePaths?: boolean, instantiationService?: IInstantiationService): string {
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

		if (!relativePaths || !instantiationService) {
			return JSON.stringify(serializedFileEditorInput);
		}

		return instantiationService.invokeFunction(accessor => {
			const workspaceFolder = accessor.get(IWorkspaceContextService).getWorkspaceFolder(resource)?.uri;
			if (workspaceFolder) {
				serializedFileEditorInput.relativeFilePath = relativePath(workspaceFolder, resource);
			}
			return JSON.stringify(serializedFileEditorInput);
		});
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): FileEditorInput {
		return instantiationService.invokeFunction(accessor => {
			const serializedFileEditorInput: ISerializedFileEditorInput = JSON.parse(serializedEditorInput);
			let resource = URI.revive(serializedFileEditorInput.resourceJSON);
			if (serializedFileEditorInput.relativeFilePath) {
				const workspaceFolders = accessor.get(IWorkspaceContextService).getWorkspace().folders[0];
				resource = workspaceFolders.toResource(serializedFileEditorInput.relativeFilePath);
			}
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

export class FileEditorWorkingCopyEditorHandler extends Disposable implements IWorkbenchContribution {

	constructor(
		@IWorkingCopyEditorService private readonly workingCopyEditorService: IWorkingCopyEditorService,
		@ITextEditorService private readonly textEditorService: ITextEditorService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		this.installHandler();
	}

	private installHandler(): void {
		this._register(this.workingCopyEditorService.registerHandler({
			handles: workingCopy => workingCopy.typeId === NO_TYPE_ID && this.fileService.hasProvider(workingCopy.resource),
			// Naturally it would make sense here to check for `instanceof FileEditorInput`
			// but because some custom editors also leverage text file based working copies
			// we need to do a weaker check by only comparing for the resource
			isOpen: (workingCopy, editor) => isEqual(workingCopy.resource, editor.resource),
			createEditor: workingCopy => this.textEditorService.createTextEditor({ resource: workingCopy.resource, forceFile: true })
		}));
	}
}
