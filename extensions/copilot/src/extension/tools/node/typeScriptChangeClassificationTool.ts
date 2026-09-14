/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';

import { ICodeReviewService } from '../../../platform/languageContextProvider/common/codeReviewService';
import type { LineRange } from '../../../platform/languageContextProvider/common/regionContextProvider';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { checkCancellation } from './toolUtils';

export interface ITypeScriptChangeClassificationToolInput {
	readonly filePath: string;
	readonly addedLineRanges: readonly LineRange[];
	readonly changedLineRanges: readonly LineRange[];
	readonly deletedLines: readonly { line: number; deletedLineCount: number }[];
	readonly content?: string;
}

export class TypeScriptChangeClassificationTool implements vscode.LanguageModelTool<ITypeScriptChangeClassificationToolInput> {
	static readonly toolName = ToolName.TypeScriptChangeClassification;

	constructor(
		@ICodeReviewService private readonly codeReviewService: ICodeReviewService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ITypeScriptChangeClassificationToolInput>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		checkCancellation(token);
		const filePath = options.input?.filePath;
		if (typeof filePath !== 'string' || filePath.length === 0 || !isAbsolute(filePath)) {
			throw new Error('filePath must be a non-empty absolute file path');
		}
		const addedLineRanges = options.input.addedLineRanges;
		const changedLineRanges = options.input.changedLineRanges;
		const deletedLines = options.input.deletedLines;
		if (!this.areValidLineRanges(addedLineRanges) || !this.areValidLineRanges(changedLineRanges)
			|| !Array.isArray(deletedLines)
			|| !deletedLines.every(deleted => Number.isInteger(deleted.line) && deleted.line >= 0
				&& Number.isInteger(deleted.deletedLineCount) && deleted.deletedLineCount > 0)) {
			throw new Error('TypeScript change buckets contain invalid line information');
		}
		const content = options.input.content;
		if (content !== undefined && typeof content !== 'string') {
			throw new Error('content must be a string when provided');
		}

		const result = await this.codeReviewService.classifyChanges(filePath, {
			added: addedLineRanges,
			changed: changedLineRanges,
			deleted: deletedLines,
		}, content);
		checkCancellation(token);
		if (result === undefined) {
			throw new Error('TypeScript change classification is unavailable for the requested file');
		}

		return new LanguageModelToolResult([
			new LanguageModelTextPart(JSON.stringify({
				buckets: result.buckets.map(bucket => ({
					...bucket,
					path: bucket.path.slice(),
					changes: bucket.changes.map(change => ({
						...change,
						classifications: change.classifications.slice(),
					})),
				})),
			})),
		]);
	}

	private areValidLineRanges(ranges: readonly LineRange[]): boolean {
		return Array.isArray(ranges) && ranges.every(range =>
			Number.isInteger(range.start) && range.start >= 0
			&& Number.isInteger(range.end) && range.end > range.start);
	}

	prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: l10n.t`Classifying TypeScript changes`,
			pastTenseMessage: l10n.t`Classified TypeScript changes`,
		};
	}
}

ToolRegistry.registerTool(TypeScriptChangeClassificationTool);
