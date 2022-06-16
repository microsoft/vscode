/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { parse } from 'vs/base/common/marshalling';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorSerializer } from 'vs/workbench/common/editor';
import { MergeEditorInput, MergeEditorInputJSON, MergeEditorInputData } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';

export class MergeEditorSerializer implements IEditorSerializer {

	canSerialize(): boolean {
		return true;
	}

	serialize(editor: MergeEditorInput): string {
		return JSON.stringify(editor.toJSON());
	}

	deserialize(instantiationService: IInstantiationService, raw: string): MergeEditorInput | undefined {
		try {
			const data = <MergeEditorInputJSON>parse(raw);
			return instantiationService.createInstance(
				MergeEditorInput,
				data.anchestor,
				new MergeEditorInputData(data.inputOne.uri, data.inputOne.detail, data.inputOne.description),
				new MergeEditorInputData(data.inputTwo.uri, data.inputTwo.detail, data.inputTwo.description),
				data.result
			);
		} catch (err) {
			onUnexpectedError(err);
			return undefined;
		}
	}
}
