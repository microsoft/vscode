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

export enum TypeScriptChangeClassification {
	Declaration = 'declaration',
	Signature = 'signature',
	Statement = 'statement',
	Import = 'import',
	Other = 'other',
}
export type TypeScriptChangeTag = 'test';

export interface TypeScriptChangeClassificationCoverage {
	readonly classification: TypeScriptChangeClassification;
	/**
	 * Portions of the enclosing change range covered by this classification.
	 */
	readonly ranges: readonly LineRange[];
	readonly tags: readonly TypeScriptChangeTag[];
}

export interface TypeScriptModifiedChangeInput {
	/**
	 * When absent, the current TypeScript language-service snapshot is used.
	 */
	readonly content?: string;
	readonly added: readonly LineRange[];
	readonly changed: readonly LineRange[];
}

export interface TypeScriptOriginalChangeInput {
	readonly content: string;
	readonly deleted: readonly LineRange[];
}

export interface TypeScriptChangeClassificationInput {
	readonly filePath: string;
	readonly modified: TypeScriptModifiedChangeInput;
	readonly original: TypeScriptOriginalChangeInput;
}

interface TypeScriptClassifiedChangeBase {
	readonly classifications: readonly TypeScriptChangeClassificationCoverage[];
}

export interface TypeScriptClassifiedModifiedLines extends TypeScriptClassifiedChangeBase {
	readonly changeType: 'added' | 'changed';
	readonly range: LineRange;
}

export interface TypeScriptClassifiedOriginalLines extends TypeScriptClassifiedChangeBase {
	readonly changeType: 'deleted';
	readonly range: LineRange;
}

interface TypeScriptChangeBucketBase {
	readonly kind: string;
	/**
	 * Unique named structural-entity path for all changes in this bucket.
	 */
	readonly path: readonly string[];
	/**
	 * Structural entity kinds corresponding positionally to {@link path}.
	 */
	readonly pathKinds: readonly string[];
	/**
	 * Zero-based, end-exclusive line range of the structural entity in the current snapshot.
	 */
	readonly range: LineRange;
	/**
	 * Opens the original and modified snapshots in a diff editor focused on this entity.
	 */
	readonly entityLink?: vscode.Uri;
}

export interface TypeScriptModifiedChangeBucket extends TypeScriptChangeBucketBase {
	readonly changes: readonly TypeScriptClassifiedModifiedLines[];
}

export interface TypeScriptOriginalChangeBucket extends TypeScriptChangeBucketBase {
	readonly changes: readonly TypeScriptClassifiedOriginalLines[];
}

export type TypeScriptChangeBucket = TypeScriptModifiedChangeBucket | TypeScriptOriginalChangeBucket;

export interface TypeScriptChangeClassificationResult {
	readonly modified: readonly TypeScriptModifiedChangeBucket[];
	readonly original: readonly TypeScriptOriginalChangeBucket[];
}

export interface TypeScriptChangeToExplain {
	readonly id: string;
	readonly kind: string;
	readonly path: readonly string[];
	readonly changeType: 'added' | 'changed' | 'deleted';
	readonly classifications: readonly TypeScriptChangeClassificationCoverage[];
	readonly original?: string;
	readonly modified?: string;
}

export interface TypeScriptChangeExplanationInput {
	readonly filePath: string;
	readonly changes: readonly TypeScriptChangeToExplain[];
}

export interface TypeScriptChangeExplanation {
	readonly id: string;
	readonly explanation: string;
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
	 * Classifies added and changed ranges against the modified snapshot and deleted ranges
	 * against the original snapshot. All ranges are zero-based, start inclusive, and end exclusive.
	 */
	classifyChanges(input: TypeScriptChangeClassificationInput): Promise<TypeScriptChangeClassificationResult | undefined>;

	/**
	 * Generates one concise explanation for each classified change using the configured small utility model.
	 */
	explainChanges(input: TypeScriptChangeExplanationInput, token: vscode.CancellationToken): Promise<readonly TypeScriptChangeExplanation[] | undefined>;

	/**
	 * Opens a code-review entity link created by {@link classifyChanges}.
	 */
	openDiff(uri: vscode.Uri): Promise<void>;
}

export class NullCodeReviewService implements ICodeReviewService {
	readonly _serviceBrand: undefined;

	async computeMetrics(): Promise<undefined> {
		return undefined;
	}

	async classifyChanges(): Promise<undefined> {
		return undefined;
	}

	async explainChanges(): Promise<undefined> {
		return undefined;
	}

	async openDiff(): Promise<void> { }

	dispose(): void {
		// No resources to dispose for the null implementation.
	}
}
