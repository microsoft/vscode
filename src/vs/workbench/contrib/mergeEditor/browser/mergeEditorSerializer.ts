/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { parse } from '../../../../base/common/marshalling.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorSerializer } from '../../../common/editor.js';
import { MergeEditorInput, MergeEditorInputData } from './mergeEditorInput.js';

export class MergeEditorSerializer implements IEditorSerializer {
	canSerialize(): boolean {
		return true;
	}

	serialize(editor: MergeEditorInput): string {
		return JSON.stringify(this.toJSON(editor));
	}

	toJSON(editor: MergeEditorInput): MergeEditorInputJSON {
		return {
			base: editor.base,
			input1: editor.input1,
			input2: editor.input2,
			result: editor.result,
		};
	}

	deserialize(instantiationService: IInstantiationService, raw: string): MergeEditorInput | undefined {
		try {
			const data = <MergeEditorInputJSON>parse(raw);
			return instantiationService.createInstance(
				MergeEditorInput,
				data.base,
				new MergeEditorInputData(data.input1.uri, data.input1.title, data.input1.detail, data.input1.description),
				new MergeEditorInputData(data.input2.uri, data.input2.title, data.input2.detail, data.input2.description),
				data.result
			);
		} catch (err) {
			onUnexpectedError(err);
			return undefined;
		}
	}
}

interface MergeEditorInputJSON {
	base: URI;
	input1: { uri: URI; title?: string; detail?: string; description?: string };
	input2: { uri: URI; title?: string; detail?: string; description?: string };
	result: URI;
}
