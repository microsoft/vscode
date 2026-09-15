/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import type { TypeScriptChangeClassificationResult, TypeScriptMetricsResult, TypeScriptModifiedChangeBucket, TypeScriptOriginalChangeBucket } from '../../../platform/languageContextProvider/common/codeReviewService';
import type * as protocol from '../common/serverProtocol';

export function toTypeScriptMetricsResult(result: protocol.TypeScriptMetricsResult): TypeScriptMetricsResult {
	return {
		entities: result.entities.map(entity => ({
			...entity,
			range: new vscode.Range(
				entity.range.start.line,
				entity.range.start.character,
				entity.range.end.line,
				entity.range.end.character,
			),
		})),
	};
}

export function toTypeScriptChangeClassificationResult(result: protocol.TypeScriptChangeClassificationResult): TypeScriptChangeClassificationResult {
	return {
		modified: result.modified.map(toModifiedChangeBucket),
		original: result.original.map(toOriginalChangeBucket),
	};
}

function toModifiedChangeBucket(bucket: protocol.TypeScriptModifiedChangeBucket): TypeScriptModifiedChangeBucket {
	return {
		...bucket,
		path: bucket.path.slice(),
		changes: bucket.changes.map(change => ({
			...change,
			classifications: change.classifications.slice(),
		})),
	};
}

function toOriginalChangeBucket(bucket: protocol.TypeScriptOriginalChangeBucket): TypeScriptOriginalChangeBucket {
	return {
		...bucket,
		path: bucket.path.slice(),
		changes: bucket.changes.map(change => ({
			...change,
			classifications: change.classifications.slice(),
		})),
	};
}
