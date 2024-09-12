/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookCellMetadata, NotebookDocumentMetadata, TransientDocumentMetadata } from '../notebookCommon.js';
import { toFormattedString } from '../../../../../base/common/jsonFormatter.js';

export function getFormattedNotebookMetadataJSON(transientMetadata: TransientDocumentMetadata | undefined, metadata: NotebookDocumentMetadata) {
	let filteredMetadata: { [key: string]: any } = {};

	if (transientMetadata) {
		const keys = new Set([...Object.keys(metadata)]);
		for (const key of keys) {
			if (!(transientMetadata[key as keyof NotebookCellMetadata])
			) {
				filteredMetadata[key] = metadata[key as keyof NotebookCellMetadata];
			}
		}
	} else {
		filteredMetadata = metadata;
	}

	const metadataSource = toFormattedString(filteredMetadata, {});

	return metadataSource;
}
