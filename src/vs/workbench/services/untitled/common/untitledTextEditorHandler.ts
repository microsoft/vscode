/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IEditorInput, IEditorSerializer } from 'vs/workbench/common/editor';
import { ITextEditorService } from 'vs/workbench/services/textfile/common/textEditorService';
import { isEqual, toLocalResource } from 'vs/base/common/resources';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { UntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { NO_TYPE_ID } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';

interface ISerializedUntitledTextEditorInput {
	resourceJSON: UriComponents;
	modeId: string | undefined;
	encoding: string | undefined;
}

export class UntitledTextEditorInputSerializer implements IEditorSerializer {

	constructor(
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IPathService private readonly pathService: IPathService
	) { }

	canSerialize(editorInput: IEditorInput): boolean {
		return this.filesConfigurationService.isHotExitEnabled && !editorInput.isDisposed();
	}

	serialize(editorInput: IEditorInput): string | undefined {
		if (!this.filesConfigurationService.isHotExitEnabled || editorInput.isDisposed()) {
			return undefined;
		}

		const untitledTextEditorInput = editorInput as UntitledTextEditorInput;

		let resource = untitledTextEditorInput.resource;
		if (untitledTextEditorInput.model.hasAssociatedFilePath) {
			resource = toLocalResource(resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme); // untitled with associated file path use the local schema
		}

		// Mode: only remember mode if it is either specific (not text)
		// or if the mode was explicitly set by the user. We want to preserve
		// this information across restarts and not set the mode unless
		// this is the case.
		let modeId: string | undefined;
		const modeIdCandidate = untitledTextEditorInput.getMode();
		if (modeIdCandidate !== PLAINTEXT_MODE_ID) {
			modeId = modeIdCandidate;
		} else if (untitledTextEditorInput.model.hasModeSetExplicitly) {
			modeId = modeIdCandidate;
		}

		const serialized: ISerializedUntitledTextEditorInput = {
			resourceJSON: resource.toJSON(),
			modeId,
			encoding: untitledTextEditorInput.getEncoding()
		};

		return JSON.stringify(serialized);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): UntitledTextEditorInput {
		return instantiationService.invokeFunction(accessor => {
			const deserialized: ISerializedUntitledTextEditorInput = JSON.parse(serializedEditorInput);
			const resource = URI.revive(deserialized.resourceJSON);
			const mode = deserialized.modeId;
			const encoding = deserialized.encoding;

			return accessor.get(ITextEditorService).createTextEditor({ resource, mode, encoding, forceUntitled: true }) as UntitledTextEditorInput;
		});
	}
}

export class UntitledTextEditorWorkingCopyEditorHandler extends Disposable implements IWorkbenchContribution {

	private static readonly UNTITLED_REGEX = /Untitled-\d+/;

	constructor(
		@IWorkingCopyEditorService private readonly workingCopyEditorService: IWorkingCopyEditorService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IPathService private readonly pathService: IPathService,
		@ITextEditorService private readonly textEditorService: ITextEditorService
	) {
		super();

		this.installHandler();
	}

	private installHandler(): void {
		this._register(this.workingCopyEditorService.registerHandler({
			handles: workingCopy => workingCopy.resource.scheme === Schemas.untitled && workingCopy.typeId === NO_TYPE_ID,
			isOpen: (workingCopy, editor) => editor instanceof UntitledTextEditorInput && isEqual(workingCopy.resource, editor.resource),
			createEditor: workingCopy => {
				let editorInputResource: URI;

				// This is a (weak) strategy to find out if the untitled input had
				// an associated file path or not by just looking at the path. and
				// if so, we must ensure to restore the local resource it had.
				if (!UntitledTextEditorWorkingCopyEditorHandler.UNTITLED_REGEX.test(workingCopy.resource.path)) {
					editorInputResource = toLocalResource(workingCopy.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
				} else {
					editorInputResource = workingCopy.resource;
				}

				return this.textEditorService.createTextEditor({ resource: editorInputResource, forceUntitled: true });
			}
		}));
	}
}
