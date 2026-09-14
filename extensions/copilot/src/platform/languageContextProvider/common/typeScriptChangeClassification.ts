/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';

import { createServiceIdentifier } from '../../../util/common/services';
import type { LineRange } from './regionContextProvider';

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

export const ITypeScriptChangeClassificationService = createServiceIdentifier<ITypeScriptChangeClassificationService>('ITypeScriptChangeClassificationService');

export interface ITypeScriptChangeClassificationService extends vscode.Disposable {
	readonly _serviceBrand: undefined;

	/**
	 * Classifies added, changed, and deleted line buckets using the TypeScript language-service
	 * snapshot, or `content` when provided. Added and changed ranges are zero-based, start
	 * inclusive, and end exclusive. Deleted lines use the current-snapshot deletion anchor.
	 */
	classifyChanges(filePath: string, changes: TypeScriptChangeClassificationInput, content?: string): Promise<TypeScriptChangeClassificationResult | undefined>;
}

export class NullTypeScriptChangeClassificationService implements ITypeScriptChangeClassificationService {
	readonly _serviceBrand: undefined;

	async classifyChanges(): Promise<undefined> {
		return undefined;
	}

	dispose(): void {
		// No resources to dispose for the null implementation.
	}
}
