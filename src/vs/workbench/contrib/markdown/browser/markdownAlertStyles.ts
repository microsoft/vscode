/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';

/**
 * Registers global alert styles for markdown rendering across the workbench.
 * These styles apply to all markdown content rendered via IMarkdownRendererService.
 */
registerThemingParticipant((theme, collector) => {
	// Alert color mappings using theme variables
	collector.addRule(`
		blockquote[data-severity="note"] {
			--vscode-textBlockQuote-border: var(--vscode-editorInfo-foreground);
		}
	`);

	collector.addRule(`
		blockquote[data-severity="tip"] {
			--vscode-textBlockQuote-border: var(--vscode-charts-green);
		}
	`);

	collector.addRule(`
		blockquote[data-severity="important"] {
			--vscode-textBlockQuote-border: var(--vscode-charts-purple);
		}
	`);

	collector.addRule(`
		blockquote[data-severity="warning"] {
			--vscode-textBlockQuote-border: var(--vscode-editorWarning-foreground);
		}
	`);

	collector.addRule(`
		blockquote[data-severity="caution"] {
			--vscode-textBlockQuote-border: var(--vscode-editorError-foreground);
		}
	`);

	// Alert title styling
	collector.addRule(`
		blockquote[data-severity] > p > span[title]:first-child {
			display: inline-flex;
			align-items: center;
			color: var(--vscode-textBlockQuote-border);
			font-weight: bolder;
		}
	`);

	collector.addRule(`
		blockquote[data-severity] > p > span[title]:first-child .codicon {
			color: var(--vscode-textBlockQuote-border);
			padding-right: 6px;
		}
	`);
});
