/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ISaveService } from 'vs/workbench/services/save/common/save';
import { ISaveOptions, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export class SaveService implements ISaveService {
	_serviceBrand: undefined;

	public constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@ITextFileService private readonly _textFileService: ITextFileService,
	) { }

	public save(resource: URI, options?: ISaveOptions): Promise<boolean> {
		// Pin the active editor if we are saving it
		const activeControl = this._editorService.activeControl;
		if (activeControl && activeControl.input) {
			const activeEditorResource = activeControl.input.getResource();
			if (activeEditorResource && isEqual(activeEditorResource, resource)) {
				activeControl.group.pinEditor(activeControl.input);
			}
		}

		// Just save (force a change to the file to trigger external watchers if any)
		options = ensureForcedSave(options);

		return this._textFileService.save(resource, options);
	}
}

function ensureForcedSave(options?: ISaveOptions): ISaveOptions {
	if (!options) {
		options = { force: true };
	} else {
		options.force = true;
	}

	return options;
}

registerSingleton(ISaveService, SaveService);
