/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import { TypeScriptChangeClassification, type TypeScriptChangeClassificationResult, type TypeScriptMetricsResult, type TypeScriptModifiedChangeBucket, type TypeScriptOriginalChangeBucket } from '../../../platform/languageContextProvider/common/codeReviewService';
import * as protocol from '../common/serverProtocol';

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
		pathKinds: bucket.pathKinds.slice(),
		changes: bucket.changes.map(change => ({
			...change,
			classifications: change.classifications.map(classification => ({
				...classification,
				classification: toTypeScriptChangeClassification(classification.classification),
				ranges: classification.ranges.map(range => ({ ...range })),
				tags: classification.tags.slice(),
			})),
		})),
	};
}

function toOriginalChangeBucket(bucket: protocol.TypeScriptOriginalChangeBucket): TypeScriptOriginalChangeBucket {
	return {
		...bucket,
		path: bucket.path.slice(),
		pathKinds: bucket.pathKinds.slice(),
		changes: bucket.changes.map(change => ({
			...change,
			classifications: change.classifications.map(classification => ({
				...classification,
				classification: toTypeScriptChangeClassification(classification.classification),
				ranges: classification.ranges.map(range => ({ ...range })),
				tags: classification.tags.slice(),
			})),
		})),
	};
}

function toTypeScriptChangeClassification(classification: protocol.TypeScriptChangeClassification): TypeScriptChangeClassification {
	switch (classification) {
		case protocol.TypeScriptChangeClassification.Declaration:
			return TypeScriptChangeClassification.Declaration;
		case protocol.TypeScriptChangeClassification.Signature:
			return TypeScriptChangeClassification.Signature;
		case protocol.TypeScriptChangeClassification.Statement:
			return TypeScriptChangeClassification.Statement;
		case protocol.TypeScriptChangeClassification.Import:
			return TypeScriptChangeClassification.Import;
		case protocol.TypeScriptChangeClassification.Other:
			return TypeScriptChangeClassification.Other;
	}
}
