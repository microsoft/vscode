/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';

import { ICodeReviewService, type TypeScriptChangeBucket, type TypeScriptChangeClassificationInput } from '../../../platform/languageContextProvider/common/codeReviewService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { checkCancellation } from './toolUtils';

export type ITypeScriptChangeClassificationToolInput = TypeScriptChangeClassificationInput;

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
		const modified = options.input.modified;
		const original = options.input.original;
		if (modified === undefined
			|| !this.areValidLineRanges(modified.added)
			|| !this.areValidLineRanges(modified.changed)
			|| (modified.content !== undefined && typeof modified.content !== 'string')
			|| original === undefined
			|| typeof original.content !== 'string'
			|| !this.areValidLineRanges(original.deleted)) {
			throw new Error('TypeScript change buckets contain invalid line information');
		}

		const result = await this.codeReviewService.classifyChanges(options.input);
		checkCancellation(token);
		if (result === undefined) {
			throw new Error('TypeScript change classification is unavailable for the requested file');
		}

		return new LanguageModelToolResult([
			new LanguageModelTextPart(JSON.stringify({
				modified: result.modified.map(bucket => this.serializeBucket(bucket)),
				original: result.original.map(bucket => this.serializeBucket(bucket)),
			})),
		]);
	}

	private areValidLineRanges(ranges: readonly { start: number; end: number }[]): boolean {
		return Array.isArray(ranges) && ranges.every(range =>
			Number.isInteger(range.start) && range.start >= 0
			&& Number.isInteger(range.end) && range.end > range.start);
	}

	private serializeBucket(bucket: TypeScriptChangeBucket): object {
		return {
			...bucket,
			path: bucket.path.slice(),
			pathKinds: bucket.pathKinds.slice(),
			entityLink: bucket.entityLink?.toString(true),
			changes: bucket.changes.map(change => ({
				...change,
				classifications: change.classifications.map(classification => ({
					...classification,
					ranges: classification.ranges.map(range => ({ ...range })),
					tags: classification.tags.slice(),
				})),
			})),
		};
	}

	prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: l10n.t`Classifying TypeScript changes`,
			pastTenseMessage: l10n.t`Classified TypeScript changes`,
		};
	}
}

ToolRegistry.registerTool(TypeScriptChangeClassificationTool);
