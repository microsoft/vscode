/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../../nls.js';
import { IChatAutoModelRoutingPart } from '../../../common/chatService/chatService.js';
import './media/chatAutoModelRoutingContentPart.css';

/**
 * Build a small inline chip showing the routed-to model name.
 * Intended for placement in the response footer.
 */
export function createAutoModelRoutingChip(part: IChatAutoModelRoutingPart): HTMLElement {
	const chip = $('span.chat-auto-model-routing-chip');
	chip.tabIndex = 0;
	chip.setAttribute('role', 'button');
	const ariaLabel = localize('autoModelRouting.chip.aria', "Auto routed to {0}. Show details.", part.selectedModel);
	chip.setAttribute('aria-label', ariaLabel);
	chip.appendChild($('span.chat-auto-model-routing-chip-label', undefined, part.selectedModel));
	return chip;
}

/**
 * Build the markdown hover content for the routing chip.
 */
export function getAutoModelRoutingHoverMarkdown(part: IChatAutoModelRoutingPart): MarkdownString {
	const md = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
	md.appendMarkdown(`**${localize('autoModelRouting.hover.title', "Routed to {0}", part.selectedModel)}**`);

	const caps = part.capabilities;
	let capSentence: string | undefined;
	if (caps && caps.length >= 2) {
		const top = [...caps].sort((a, b) => b.score - a.score).slice(0, 2).map(c => c.name.toLowerCase());
		capSentence = localize('autoModelRouting.hover.capSentence', "{0} is selected for high {1} and {2} capability.", part.selectedModel, top[0], top[1]);
	} else if (caps && caps.length === 1) {
		capSentence = localize('autoModelRouting.hover.capSentenceSingle', "{0} is selected for high {1} capability.", part.selectedModel, caps[0].name.toLowerCase());
	}

	md.appendMarkdown(`\n\n`);
	if (capSentence) {
		md.appendMarkdown(`${capSentence} `);
	}
	md.appendMarkdown(localize('autoModelRouting.hover.footer', "Auto routes based on your task and real-time system health and model performance."));
	md.appendMarkdown(` [${localize('autoModelRouting.hover.learnMore', "Learn more")}](https://aka.ms/copilot-auto-model)`);

	if (caps && caps.length > 0) {
		md.appendMarkdown(`\n\n`);
		const lines = caps.map(c => `${c.name} \`${scoreToLabel(c.score)}\``);
		md.appendMarkdown(lines.join(' &nbsp;·&nbsp; '));
	}

	return md;
}

function scoreToLabel(score: number): string {
	if (score >= 0.67) {
		return localize('autoModelRouting.score.high', "High");
	}
	if (score >= 0.34) {
		return localize('autoModelRouting.score.medium', "Medium");
	}
	return localize('autoModelRouting.score.low', "Low");
}
