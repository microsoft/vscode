/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Hover, HoverProvider } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { localize } from '../../../../../../nls.js';
import { STRENGTH_PATTERNS } from './promptQualityConstants.js';

/**
 * Provides hovers showing instruction-strength classification when the
 * cursor is over a strength keyword (strong/medium/weak) in prompt body text.
 */
export class PromptQualityHoverProvider implements HoverProvider {

	public provideHover(model: ITextModel, position: Position, _token: CancellationToken): Hover | undefined {
		const lineText = model.getLineContent(position.lineNumber);

		// Check for variable hover: {{variable}}
		const variablePattern = /\{\{(\w+)\}\}/g;
		let match: RegExpExecArray | null;
		while ((match = variablePattern.exec(lineText)) !== null) {
			const start = match.index + 1;
			const end = start + match[0].length;
			if (position.column >= start && position.column <= end) {
				const content = new MarkdownString();
				content.appendText(localize(
					'promptQualityHover.variableLabel',
					"Variable: {0}",
					match[1],
				));
				content.appendMarkdown(localize(
					'promptQualityHover.variableHelp',
					"\n\nThis variable will be interpolated at runtime. Ensure it is defined in your context.",
				));
				return {
					contents: [content],
					range: new Range(position.lineNumber, start, position.lineNumber, end),
				};
			}
		}

		// Check for instruction-strength keywords
		for (const [strength, patterns] of Object.entries(STRENGTH_PATTERNS)) {
			for (const pattern of patterns) {
				const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
				let strengthMatch: RegExpExecArray | null;
				while ((strengthMatch = regex.exec(lineText)) !== null) {
					const start = strengthMatch.index + 1;
					const end = start + strengthMatch[0].length;
					if (position.column >= start && position.column <= end) {
						const content = new MarkdownString();
						content.appendMarkdown(`**${localize('promptQualityHover.instructionStrength', "Instruction Strength")}:** ${strength}\n\n${getStrengthDescription(strength)}`);
						return {
							contents: [content],
							range: new Range(position.lineNumber, start, position.lineNumber, end),
						};
					}
				}
			}
		}

		return undefined;
	}
}

function getStrengthDescription(strength: string): string {
	switch (strength) {
		case 'strong':
			return localize('promptQualityHover.strong', "This is a **strong** instruction. The model will prioritize following this constraint.");
		case 'medium':
			return localize('promptQualityHover.medium', "This is a **medium** strength instruction. Consider using stronger language for critical constraints.");
		case 'weak':
			return localize('promptQualityHover.weak', "This is a **weak** instruction. The model may not reliably follow this. Consider using stronger language like \"Never\", \"Must\", or \"Always\".");
		default:
			return '';
	}
}
