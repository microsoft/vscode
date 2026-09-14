/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';

import { createServiceIdentifier } from '../../../util/common/services';

export type TypeScriptMetricValue = number | string;

export interface TypeScriptMetrics extends Readonly<Record<string, TypeScriptMetricValue>> {
	readonly cognitiveComplexity: number;
	readonly cyclomaticComplexity: number;
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

export const ITypeScriptMetricsService = createServiceIdentifier<ITypeScriptMetricsService>('ITypeScriptMetricsService');

export interface ITypeScriptMetricsService extends vscode.Disposable {
	readonly _serviceBrand: undefined;

	/**
	 * Computes metrics for executable entities in the file. Unnamed entities are aggregated
	 * into their nearest named container. When provided, `content` is analyzed instead of the
	 * file contents known to the TypeScript language service.
	 */
	computeMetrics(filePath: string, content?: string): Promise<TypeScriptMetricsResult | undefined>;
}

export class NullTypeScriptMetricsService implements ITypeScriptMetricsService {
	readonly _serviceBrand: undefined;

	async computeMetrics(): Promise<undefined> {
		return undefined;
	}

	dispose(): void {
		// No resources to dispose for the null implementation.
	}
}
