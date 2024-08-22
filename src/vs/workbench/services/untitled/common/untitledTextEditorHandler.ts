/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network';
import { Disposable } from '../../../../base/common/lifecycle';
import { URI, UriComponents } from '../../../../base/common/uri';
import { IEditorSerializer } from '../../../common/editor';
import { EditorInput } from '../../../common/editor/editorInput';
import { ITextEditorService } from '../../textfile/common/textEditorService';
import { isEqual, toLocalResource } from '../../../../base/common/resources';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService';
import { IPathService } from '../../path/common/pathService';
import { UntitledTextEditorInput } from './untitledTextEditorInput';
import { IWorkbenchContribution } from '../../../common/contributions';
import { IWorkingCopyIdentifier, NO_TYPE_ID } from '../../workingCopy/common/workingCopy';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from '../../workingCopy/common/workingCopyEditorService';
import { IUntitledTextEditorService } from './untitledTextEditorService';

interface ISerializedUntitledTextEditorInput {
	readonly resourceJSON: UriComponents;
	readonly modeId: string | undefined; // should be `languageId` but is kept for backwards compatibility
	readonly encoding: string | undefined;
}

export class UntitledTextEditorInputSerializer implements IEditorSerializer {

	constructor(
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IPathService private readonly pathService: IPathService
	) { }

	canSerialize(editorInput: EditorInput): boolean {
		return this.filesConfigurationService.isHotExitEnabled && !editorInput.isDisposed();
	}

	serialize(editorInput: EditorInput): string | undefined {
		if (!this.canSerialize(editorInput)) {
			return undefined;
		}

		const untitledTextEditorInput = editorInput as UntitledTextEditorInput;

		let resource = untitledTextEditorInput.resource;
		if (untitledTextEditorInput.hasAssociatedFilePath) {
			resource = toLocalResource(resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme); // untitled with associated file path use the local schema
		}

		// Language: only remember language if it is either specific (not text)
		// or if the language was explicitly set by the user. We want to preserve
		// this information across restarts and not set the language unless
		// this is the case.
		let languageId: string | undefined;
		const languageIdCandidate = untitledTextEditorInput.getLanguageId();
		if (languageIdCandidate !== PLAINTEXT_LANGUAGE_ID) {
			languageId = languageIdCandidate;
		} else if (untitledTextEditorInput.hasLanguageSetExplicitly) {
			languageId = languageIdCandidate;
		}

		const serialized: ISerializedUntitledTextEditorInput = {
			resourceJSON: resource.toJSON(),
			modeId: languageId,
			encoding: untitledTextEditorInput.getEncoding()
		};

		return JSON.stringify(serialized);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): UntitledTextEditorInput {
		return instantiationService.invokeFunction(accessor => {
			const deserialized: ISerializedUntitledTextEditorInput = JSON.parse(serializedEditorInput);
			const resource = URI.revive(deserialized.resourceJSON);
			const languageId = deserialized.modeId;
			const encoding = deserialized.encoding;

			return accessor.get(ITextEditorService).createTextEditor({ resource, languageId, encoding, forceUntitled: true }) as UntitledTextEditorInput;
		});
	}
}

export class UntitledTextEditorWorkingCopyEditorHandler extends Disposable implements IWorkbenchContribution, IWorkingCopyEditorHandler {

	static readonly ID = 'workbench.contrib.untitledTextEditorWorkingCopyEditorHandler';

	constructor(
		@IWorkingCopyEditorService workingCopyEditorService: IWorkingCopyEditorService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IPathService private readonly pathService: IPathService,
		@ITextEditorService private readonly textEditorService: ITextEditorService,
		@IUntitledTextEditorService private readonly untitledTextEditorService: IUntitledTextEditorService
	) {
		super();

		this._register(workingCopyEditorService.registerHandler(this));
	}

	handles(workingCopy: IWorkingCopyIdentifier): boolean {
		return workingCopy.resource.scheme === Schemas.untitled && workingCopy.typeId === NO_TYPE_ID;
	}

	isOpen(workingCopy: IWorkingCopyIdentifier, editor: EditorInput): boolean {
		if (!this.handles(workingCopy)) {
			return false;
		}

		return editor instanceof UntitledTextEditorInput && isEqual(workingCopy.resource, editor.resource);
	}

	createEditor(workingCopy: IWorkingCopyIdentifier): EditorInput {
		let editorInputResource: URI;

		// If the untitled has an associated resource,
		// ensure to restore the local resource it had
		if (this.untitledTextEditorService.isUntitledWithAssociatedResource(workingCopy.resource)) {
			editorInputResource = toLocalResource(workingCopy.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
		} else {
			editorInputResource = workingCopy.resource;
		}

		return this.textEditorService.createTextEditor({ resource: editorInputResource, forceUntitled: true });
	}
}
