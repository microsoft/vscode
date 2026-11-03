/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ResourceMap, ResourceSet } from '../../../util/vs/base/common/map';
import { count } from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';
import { MarkdownString } from '../../../vscodeTypes';
import { CellOrNotebookEdit } from '../../prompts/node/codeMapper/codeMapper';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { formatUriForFileWidget } from '../common/toolUtils';
import { AbstractReplaceStringTool, IAbstractReplaceStringInput } from './abstractReplaceStringTool';

export interface IMultiReplaceStringToolParams {
	explanation: string;
	replacements: IAbstractReplaceStringInput[];
}

export const multiReplaceStringPrimaryDescription = 'This is the primary tool for making multiple edits to one or more files. Use this instead of calling replace_string_in_file repeatedly. It takes an array of replacement operations and applies them sequentially. Each replacement operation has the same parameters as replace_string_in_file: filePath, oldString, newString, and explanation. This tool is ideal when you need to make multiple edits across different files or multiple edits in the same file. The tool will provide a summary of successful and failed operations.';

export class MultiReplaceStringTool extends AbstractReplaceStringTool<IMultiReplaceStringToolParams> {
	public static toolName = ToolName.MultiReplaceString;
	public static readonly nonDeferred = true;

	protected extractReplaceInputs(input: IMultiReplaceStringToolParams): IAbstractReplaceStringInput[] {
		return input.replacements.map(r => ({
			filePath: r.filePath,
			oldString: r.oldString,
			newString: r.newString,
		}));
	}

	async handleToolStream(options: vscode.LanguageModelToolInvocationStreamOptions<IMultiReplaceStringToolParams>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolStreamResult> {
		const partialInput = options.rawInput as Partial<IMultiReplaceStringToolParams> | undefined;

		let invocationMessage: MarkdownString;
		if (partialInput && typeof partialInput === 'object' && Array.isArray(partialInput.replacements)) {
			// Filter to valid replacements that have at least oldString
			const validReplacements = partialInput.replacements.filter(
				r => r && typeof r === 'object' && r.oldString !== undefined
			);

			if (validReplacements.length > 0) {
				let totalOldLines = 0;
				let totalNewLines = 0;
				let hasNewString = false;
				const fileNames = new ResourceSet();

				for (const r of validReplacements) {
					totalOldLines += count(r.oldString, '\n') + 1;
					if (r.newString !== undefined) {
						hasNewString = true;
						totalNewLines += count(r.newString, '\n') + 1;
					}
					const uri = r.filePath && this.promptPathRepresentationService.resolveFilePath(r.filePath);
					if (uri) {
						fileNames.add(uri);
					}
				}

				const fileList = fileNames.size > 0 ? Array.from(fileNames, n => formatUriForFileWidget(n)).join(', ') : undefined;

				if (hasNewString && fileList) {
					invocationMessage = new MarkdownString(l10n.t`Replacing ${totalOldLines} lines with ${totalNewLines} lines in ${fileList}`);
				} else if (hasNewString) {
					invocationMessage = new MarkdownString(l10n.t`Replacing ${totalOldLines} lines with ${totalNewLines} lines`);
				} else if (fileList) {
					invocationMessage = new MarkdownString(l10n.t`Replacing ${totalOldLines} lines in ${fileList}`);
				} else {
					invocationMessage = new MarkdownString(l10n.t`Replacing ${totalOldLines} lines`);
				}
			} else {
				invocationMessage = new MarkdownString(l10n.t`Editing files`);
			}
		} else {
			invocationMessage = new MarkdownString(l10n.t`Editing files`);
		}

		return { invocationMessage };
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IMultiReplaceStringToolParams>, token: vscode.CancellationToken) {
		if (!options.input.replacements || !Array.isArray(options.input.replacements)) {
			throw new Error('Invalid input, no replacements array');
		}

		const prepared = await this.prepareEdits(options, token);

		let successes = 0;
		let failures = 0;
		let individualEdits = 0;
		const uniqueUris = new ResourceSet();
		for (const edit of prepared) {
			uniqueUris.add(edit.uri);
			if (edit.generatedEdit.success) {
				successes++;
				individualEdits += edit.generatedEdit.textEdits.length;
			} else {
				failures++;
			}
		}

		/* __GDPR__
			"multiStringReplaceCall" : {
				"owner": "connor4312",
				"comment": "Tracks how much percent of the AI edits survived after 5 minutes of accepting",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model used for the request." },
				"successes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The number of successful edits.", "isMeasurement": true },
				"failures": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The number of failed edits.", "isMeasurement": true },
				"uniqueUris": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The number of unique URIs edited.", "isMeasurement": true },
				"individualEdits": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The number of individual text edits made.", "isMeasurement": true }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('multiStringReplaceCall', {
			requestId: this._promptContext?.requestId,
			model: await this.modelForTelemetry(options),
		}, {
			successes,
			failures,
			individualEdits,
			uniqueUris: uniqueUris.size,
		});


		for (let i = 0; i < prepared.length; i++) {
			const e1 = prepared[i];
			uniqueUris.add(e1.uri);

			if (!e1.generatedEdit.success) {
				failures++;
				continue;
			}
			successes++;

			for (let k = i + 1; k < prepared.length; k++) {
				const e2 = prepared[k];
				// Merge successful edits of the same type and URI so that edits come in
				// a single correct batch and positions aren't later clobbered.
				if (!e2.generatedEdit.success || e2.uri.toString() !== e1.uri.toString() || (!!e2.generatedEdit.notebookEdits !== !!e1.generatedEdit.notebookEdits)) {
					continue;
				}

				prepared.splice(k, 1);
				k--;

				if (e2.generatedEdit.notebookEdits) {
					e1.generatedEdit.notebookEdits = mergeNotebookAndTextEdits(e1.generatedEdit.notebookEdits!, e2.generatedEdit.notebookEdits);
				} else {
					e1.generatedEdit.textEdits = e1.generatedEdit.textEdits.concat(e2.generatedEdit.textEdits);
					e1.generatedEdit.textEdits.sort(textEditSorter);
				}
			}
		}

		return this.applyAllEdits(options, prepared, token);
	}

	protected override toolName(): ToolName {
		return MultiReplaceStringTool.toolName;
	}
}

ToolRegistry.registerTool(MultiReplaceStringTool);

function textEditSorter(a: vscode.TextEdit, b: vscode.TextEdit) {
	return b.range.end.compareTo(a.range.end) || b.range.start.compareTo(a.range.start);
}

/**
 * Merge two arrays of notebook edits or text edits grouped by URI.
 * Text edits for the same URI are concatenated and sorted in reverse file order (descending by start position).
 */
function mergeNotebookAndTextEdits(left: CellOrNotebookEdit[], right: CellOrNotebookEdit[]): CellOrNotebookEdit[] {
	const notebookEdits: vscode.NotebookEdit[] = [];
	const textEditsByUri = new ResourceMap<vscode.TextEdit[]>();

	const add = (item: vscode.NotebookEdit | [URI, vscode.TextEdit[]]) => {
		if (Array.isArray(item)) {
			const [uri, edits] = item;
			let bucket = textEditsByUri.get(uri);
			if (!bucket) {
				bucket = [];
				textEditsByUri.set(uri, bucket);
			}
			bucket.push(...edits);
		} else {
			notebookEdits.push(item);
		}
	};

	left.forEach(add);
	right.forEach(add);

	const mergedTextEditTuples: [URI, vscode.TextEdit[]][] = [];
	for (const [uri, edits] of textEditsByUri.entries()) {
		edits.sort(textEditSorter);
		mergedTextEditTuples.push([uri, edits]);
	}

	return [...notebookEdits, ...mergedTextEditTuples];
}
