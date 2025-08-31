/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorSerializer } from '../../../../common/editor.js';
import { DataExplorerEditorInput } from './dataExplorerEditorInput.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../base/common/uri.js';

interface ISerializedDataExplorerEditorInput {
	resource: string;
}

/**
 * DataExplorerEditorSerializer for handling editor persistence
 */
export class DataExplorerEditorSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return editorInput instanceof DataExplorerEditorInput;
	}

	serialize(editorInput: DataExplorerEditorInput): string {
		const serialized: ISerializedDataExplorerEditorInput = {
			resource: editorInput.resource.toString()
		};

		return JSON.stringify(serialized);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): DataExplorerEditorInput {
		try {
			const parsed: ISerializedDataExplorerEditorInput = JSON.parse(serializedEditorInput);
			const resource = URI.parse(parsed.resource);

			return instantiationService.createInstance(DataExplorerEditorInput, resource);
		} catch (error) {
			throw new Error(`Failed to deserialize DataExplorerEditorInput: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}




