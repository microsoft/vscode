/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';

import { createServiceIdentifier } from '../../../util/common/services';
import type { LineRange } from './regionContextProvider';

export type TypeScriptMetricValue = number | string;

export interface TypeScriptMetrics extends Readonly<Record<string, TypeScriptMetricValue>> {
	readonly cognitiveComplexity: number;
	readonly cyclomaticComplexity: number;
	/**
	 * A local syntactic estimate. Unknown calls are treated as constant time.
	 */
	readonly runtimeComplexity: string;
}

export interface TypeScriptMetricEntity {
	readonly kind: string;
	/**
	 * Named containers from outermost to innermost. The source-file entity uses an empty path.
	 */
	readonly path: readonly string[];
	readonly range: vscode.Range;
	readonly metrics: TypeScriptMetrics;
}

export interface TypeScriptMetricsResult {
	readonly entities: readonly TypeScriptMetricEntity[];
}

export type TypeScriptChangeClassification = 'algorithmic' | 'structural';

export interface TypeScriptDeletedLines {
	readonly line: number;
	readonly deletedLineCount: number;
}

export interface TypeScriptChangeClassificationInput {
	readonly added: readonly LineRange[];
	readonly changed: readonly LineRange[];
	readonly deleted: readonly TypeScriptDeletedLines[];
}

interface TypeScriptClassifiedChangeBase {
	readonly classifications: readonly TypeScriptChangeClassification[];
}

export type TypeScriptClassifiedChange = TypeScriptClassifiedAddedOrChangedLines | TypeScriptClassifiedDeletedLines;

export interface TypeScriptClassifiedAddedOrChangedLines extends TypeScriptClassifiedChangeBase, LineRange {
	readonly changeType: 'added' | 'changed';
}

export interface TypeScriptClassifiedDeletedLines extends TypeScriptClassifiedChangeBase, TypeScriptDeletedLines {
	readonly changeType: 'deleted';
}

export interface TypeScriptChangeBucket {
	readonly kind: string;
	/**
	 * Unique named structural-entity path for all changes in this bucket.
	 */
	readonly path: readonly string[];
	/**
	 * Zero-based, end-exclusive line range of the structural entity in the current snapshot.
	 */
	readonly range: LineRange;
	readonly changes: readonly TypeScriptClassifiedChange[];
}

export interface TypeScriptChangeClassificationResult {
	readonly buckets: readonly TypeScriptChangeBucket[];
}

export const ICodeReviewService = createServiceIdentifier<ICodeReviewService>('ICodeReviewService');

export interface ICodeReviewService extends vscode.Disposable {
	readonly _serviceBrand: undefined;

	/**
	 * Computes metrics for executable entities in the file. Unnamed entities are aggregated
	 * into their nearest named container. When provided, `content` is analyzed instead of the
	 * file contents known to the TypeScript language service.
	 */
	computeMetrics(filePath: string, content?: string): Promise<TypeScriptMetricsResult | undefined>;

	/**
	 * Classifies added, changed, and deleted line buckets using the TypeScript language-service
	 * snapshot, or `content` when provided. Added and changed ranges are zero-based, start
	 * inclusive, and end exclusive. Deleted lines use the current-snapshot deletion anchor.
	 */
	classifyChanges(filePath: string, changes: TypeScriptChangeClassificationInput, content?: string): Promise<TypeScriptChangeClassificationResult | undefined>;
}

export class NullCodeReviewService implements ICodeReviewService {
	readonly _serviceBrand: undefined;

	async computeMetrics(): Promise<undefined> {
		return undefined;
	}

	async classifyChanges(): Promise<undefined> {
		return undefined;
	}

	dispose(): void {
		// No resources to dispose for the null implementation.
	}
}
