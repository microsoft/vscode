/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';

export interface ISimilarFilesContextService {
	readonly _serviceBrand: undefined;

	/**
	 * Computes GhostText-style similar files context (neighbor code snippets via Jaccard similarity).
	 * @returns JSON-serialized telemetry payload, or `undefined` on any error. Never throws.
	 */
	compute(uri: string, languageId: string, source: string, cursorOffset: number): Promise<string | undefined>;
}

export const ISimilarFilesContextService = createServiceIdentifier<ISimilarFilesContextService>('ISimilarFilesContextService');
