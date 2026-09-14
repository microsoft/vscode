/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { TypeScriptChangeClassificationResult } from '../../../platform/languageContextProvider/common/typeScriptChangeClassification';
import type * as protocol from '../common/serverProtocol';

export function toTypeScriptChangeClassificationResult(result: protocol.TypeScriptChangeClassificationResult): TypeScriptChangeClassificationResult {
	return {
		buckets: result.buckets.map(bucket => ({
			...bucket,
			path: bucket.path.slice(),
			changes: bucket.changes.map(change => ({
				...change,
				classifications: change.classifications.slice(),
			})),
		})),
	};
}
