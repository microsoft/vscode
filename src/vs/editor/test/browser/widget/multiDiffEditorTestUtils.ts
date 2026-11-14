/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IDocumentDiffItem } from '../../../browser/widget/multiDiffEditor/model.js';
import { IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { ITextModel } from '../../../common/model.js';

/**
 * Creates an item whose text models already exist and are owned by the caller.
 */
export function createTextDocumentDiffItem(original: ITextModel | undefined, modified: ITextModel | undefined, options?: IDiffEditorOptions): IDocumentDiffItem {
	return {
		originalUri: original?.uri,
		modifiedUri: modified?.uri,
		resolve: async () => ({ object: { kind: 'text', original, modified, options }, dispose: () => { } }),
	};
}

/**
 * Creates an item whose contents cannot be shown as text.
 */
export function createBinaryDocumentDiffItem(originalUri: URI | undefined, modifiedUri: URI | undefined): IDocumentDiffItem {
	return {
		originalUri,
		modifiedUri,
		resolve: async () => ({ object: { kind: 'binary' }, dispose: () => { } }),
	};
}
