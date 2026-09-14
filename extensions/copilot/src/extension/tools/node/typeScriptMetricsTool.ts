/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';

import { ITypeScriptMetricsService } from '../../../platform/languageContextProvider/common/typeScriptMetrics';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { checkCancellation } from './toolUtils';

export interface ITypeScriptMetricsToolInput {
	readonly filePath: string;
	readonly content?: string;
}

export class TypeScriptMetricsTool implements vscode.LanguageModelTool<ITypeScriptMetricsToolInput> {
	static readonly toolName = ToolName.TypeScriptMetrics;

	constructor(
		@ITypeScriptMetricsService private readonly typeScriptMetricsService: ITypeScriptMetricsService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ITypeScriptMetricsToolInput>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		checkCancellation(token);
		const filePath = options.input?.filePath;
		if (typeof filePath !== 'string' || filePath.length === 0 || !isAbsolute(filePath)) {
			throw new Error('filePath must be a non-empty absolute file path');
		}
		const content = options.input.content;
		if (content !== undefined && typeof content !== 'string') {
			throw new Error('content must be a string when provided');
		}

		const result = await this.typeScriptMetricsService.computeMetrics(filePath, content);
		checkCancellation(token);
		if (result === undefined) {
			throw new Error('TypeScript metrics are unavailable for the requested file');
		}

		return new LanguageModelToolResult([
			new LanguageModelTextPart(JSON.stringify({
				entities: result.entities.map(entity => ({
					kind: entity.kind,
					path: entity.path.slice(),
					range: {
						start: { line: entity.range.start.line, character: entity.range.start.character },
						end: { line: entity.range.end.line, character: entity.range.end.character },
					},
					metrics: { ...entity.metrics },
				})),
			})),
		]);
	}

	prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: l10n.t`Computing TypeScript metrics`,
			pastTenseMessage: l10n.t`Computed TypeScript metrics`,
		};
	}
}

ToolRegistry.registerTool(TypeScriptMetricsTool);
