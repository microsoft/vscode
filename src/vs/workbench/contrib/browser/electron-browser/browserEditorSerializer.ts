/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorSerializer } from '../../../common/editor.js';
import { BrowserEditorInput } from './browserEditorInput.js';
// import { IEditorService } from '../../../services/editor/common/editorService.js';

interface ISerializedBrowserEditorInput {
	readonly id: string;
	readonly url: string;
}

export class BrowserEditorSerializer implements IEditorSerializer {

	constructor(
		// @IEditorService private readonly editorService: IEditorService
	) { }

	canSerialize(editorInput: BrowserEditorInput): boolean {
		return true;
	}

	serialize(editorInput: BrowserEditorInput): string | undefined {
		const serialized: ISerializedBrowserEditorInput = {
			id: editorInput.id,
			url: editorInput.url
		};

		return JSON.stringify(serialized);
	}

	deserialize(instantiationService: IInstantiationService, serialized: string): BrowserEditorInput | undefined {
		try {
			const data: ISerializedBrowserEditorInput = JSON.parse(serialized);

			return instantiationService.createInstance(BrowserEditorInput, {
				id: data.id,
				url: data.url
			});
		} catch {
			return undefined;
		}
	}
}
