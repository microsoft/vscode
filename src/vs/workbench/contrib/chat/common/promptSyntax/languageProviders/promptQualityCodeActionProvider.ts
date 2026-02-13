/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CodeAction, CodeActionContext, CodeActionList, CodeActionProvider } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { localize } from '../../../../../../nls.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { CodeActionKind } from '../../../../../../editor/contrib/codeAction/common/types.js';
import { QUALITY_MARKERS_OWNER_ID } from './promptQualityContribution.js';

/**
 * Extract the suggestion embedded in a structured marker code.
 * Marker codes use the format `code:suggestion` (e.g., `prompt-quality-weak-instruction:Must`).
 */
function extractSuggestionFromCode(marker: { code?: string | { value: string; target: import('../../../../../../base/common/uri.js').URI } }): { code: string; suggestion: string | undefined } {
	const raw = typeof marker.code === 'string' ? marker.code : marker.code?.value;
	if (!raw) {
		return { code: '', suggestion: undefined };
	}
	const separatorIndex = raw.indexOf(':suggestion:');
	if (separatorIndex >= 0) {
		return { code: raw.substring(0, separatorIndex), suggestion: raw.substring(separatorIndex + ':suggestion:'.length) };
	}
	return { code: raw, suggestion: undefined };
}

/**
 * Provides quick-fix code actions for prompt quality diagnostics.
 * Handles suggestion-based replacements for weak instructions and
 * ambiguous quantifiers, plus empty-variable removal.
 */
export class PromptQualityCodeActionProvider implements CodeActionProvider {

	constructor(
		@IMarkerService private readonly markerService: IMarkerService,
	) { }

	async provideCodeActions(model: ITextModel, range: Range | Selection, context: CodeActionContext, _token: CancellationToken): Promise<CodeActionList | undefined> {
		const markers = this.markerService.read({
			resource: model.uri,
			owner: QUALITY_MARKERS_OWNER_ID,
		});

		const result: CodeAction[] = [];

		for (const marker of markers) {
			const markerRange = new Range(
				marker.startLineNumber,
				marker.startColumn,
				marker.endLineNumber,
				marker.endColumn,
			);

			if (!Range.areIntersectingOrTouching(markerRange, range)) {
				continue;
			}

			const { code, suggestion } = extractSuggestionFromCode(marker);

			switch (code) {
				case 'prompt-quality-weak-instruction': {
					if (suggestion) {
						result.push({
							title: localize('promptQualityAction.strengthen', "Strengthen to \"{0}\"", suggestion),
							kind: CodeActionKind.QuickFix.value,
							edit: {
								edits: [{
									resource: model.uri,
									textEdit: { range: markerRange, text: suggestion },
									versionId: model.getVersionId(),
								}],
							},
						});
					}
					break;
				}

				case 'prompt-quality-ambiguous-quantifier': {
					if (suggestion) {
						result.push({
							title: localize('promptQualityAction.specify', "Replace with \"{0}\"", suggestion),
							kind: CodeActionKind.QuickFix.value,
							edit: {
								edits: [{
									resource: model.uri,
									textEdit: { range: markerRange, text: suggestion },
									versionId: model.getVersionId(),
								}],
							},
						});
					}
					break;
				}

				case 'prompt-quality-empty-variable': {
					result.push({
						title: localize('promptQualityAction.removeEmpty', "Remove empty placeholder"),
						kind: CodeActionKind.QuickFix.value,
						edit: {
							edits: [{
								resource: model.uri,
								textEdit: { range: markerRange, text: '' },
								versionId: model.getVersionId(),
							}],
						},
					});
					break;
				}
			}
		}

		if (result.length === 0) {
			return undefined;
		}

		return { actions: result, dispose: () => { } };
	}
}
