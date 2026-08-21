/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { count } from '../../../util/vs/base/common/strings';
import { MarkdownString } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { formatUriForFileWidget } from '../common/toolUtils';
import { AbstractReplaceStringTool, IAbstractReplaceStringInput } from './abstractReplaceStringTool';
import { resolveToolInputPath } from './toolUtils';

export interface IReplaceStringToolParams {
	explanation: string;
	filePath: string;
	oldString: string;
	newString: string;
}

export const replaceStringBatchDescription = 'This is a tool for making edits in an existing file in the workspace. For moving or renaming files, use run in terminal tool with the \'mv\' command instead. For larger edits, split them into smaller edits and batch them with multi_replace_string_in_file in a single call. Before editing, always ensure you have the context to understand the file\'s contents and context. To edit a file, provide: 1) filePath (absolute path), 2) oldString (MUST be the exact literal text to replace including all whitespace, indentation, newlines, and surrounding code etc), and 3) newString (MUST be the exact literal text to replace `oldString` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic.). Each use of this tool replaces exactly ONE occurrence of oldString.\n\nCRITICAL for `oldString`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail. Never use \'Lines 123-456 omitted\' from summarized documents or ...existing code... comments in the oldString or newString.';

export class ReplaceStringTool<T extends IReplaceStringToolParams = IReplaceStringToolParams> extends AbstractReplaceStringTool<T> {
	public static toolName = ToolName.ReplaceString;
	public static readonly nonDeferred = true;

	protected extractReplaceInputs(input: T): IAbstractReplaceStringInput[] {
		return [{
			filePath: input.filePath,
			oldString: input.oldString,
			newString: input.newString,
		}];
	}

	async handleToolStream(options: vscode.LanguageModelToolInvocationStreamOptions<IReplaceStringToolParams>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolStreamResult> {
		const partialInput = options.rawInput as Partial<IReplaceStringToolParams> | undefined;

		let invocationMessage: MarkdownString;
		if (partialInput && typeof partialInput === 'object') {
			const oldString = partialInput.oldString;
			const newString = partialInput.newString;
			const filePath = partialInput.filePath;

			const oldLineCount = oldString !== undefined ? count(oldString, '\n') + 1 : undefined;
			const newLineCount = newString !== undefined ? count(newString, '\n') + 1 : undefined;

			if (filePath) {
				const uri = resolveToolInputPath(filePath, this.promptPathRepresentationService);
				const fileRef = formatUriForFileWidget(uri);

				if (oldLineCount !== undefined && newLineCount !== undefined) {
					invocationMessage = new MarkdownString(l10n.t`Replacing ${oldLineCount} lines with ${newLineCount} lines in ${fileRef}`);
				} else if (oldLineCount !== undefined) {
					invocationMessage = new MarkdownString(l10n.t`Replacing ${oldLineCount} lines in ${fileRef}`);
				} else {
					invocationMessage = new MarkdownString(l10n.t`Editing ${fileRef}`);
				}
			} else {
				if (oldLineCount !== undefined && newLineCount !== undefined) {
					invocationMessage = new MarkdownString(l10n.t`Replacing ${oldLineCount} lines with ${newLineCount} lines`);
				} else if (oldLineCount !== undefined) {
					invocationMessage = new MarkdownString(l10n.t`Replacing ${oldLineCount} lines`);
				} else {
					invocationMessage = new MarkdownString(l10n.t`Editing file`);
				}
			}
		} else {
			invocationMessage = new MarkdownString(l10n.t`Editing file`);
		}

		return { invocationMessage };
	}


	async invoke(options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken) {
		const prepared = await this.prepareEdits(options, token);
		return this.applyAllEdits(options, prepared, token);
	}

	protected override toolName(): ToolName {
		return ReplaceStringTool.toolName;
	}
}

ToolRegistry.registerTool(ReplaceStringTool);
