/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdown } from '../../../../../../../base/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { ILanguageModelChatMetadata } from '../../../../common/languageModels.js';

/** One cost metric, with the value for each context tier. */
export interface IModelCostMetric {
	readonly label: string;
	readonly standard: number | null | undefined;
	readonly extended: number | null | undefined;
}

/** The cost metrics a model reports, in the order they are shown. */
export function getModelCostMetrics(metadata: ILanguageModelChatMetadata): IModelCostMetric[] {
	return [
		{ label: localize('models.inputCostLabel', "Input"), standard: metadata.inputCost, extended: metadata.longContextInputCost },
		{ label: localize('models.outputCostLabel', "Output"), standard: metadata.outputCost, extended: metadata.longContextOutputCost },
		{ label: localize('models.cacheCostLabel', "Cache Read"), standard: metadata.cacheCost, extended: metadata.longContextCacheCost },
		{ label: localize('models.cacheWriteCostLabel', "Cache Write"), standard: metadata.cacheWriteCost, extended: metadata.longContextCacheWriteCost },
	].filter(metric => metric.standard !== undefined || metric.extended !== undefined);
}

export function formatModelCost(cost: number | null | undefined): string {
	return typeof cost === 'number' ? String(cost) : localize('models.cost.unknown', "Unknown");
}

/** The unit the cost numbers are given in, stated once above them. */
export function getCreditsPerMillionTokensLabel(): string {
	return localize('models.creditsPerMillionTokens', "Credits per 1M tokens");
}

/** The context window a model offers, or 0 when it reports none. */
export function getModelContextWindowTotal(metadata: ILanguageModelChatMetadata): number {
	return (metadata.maxInputTokens ?? 0) + (metadata.maxOutputTokens ?? 0);
}

export function getMaxContextLabel(): string {
	return localize('models.contextSize', "Max context");
}

/** Renders a model's description markdown. The caller places and classes the element. */
export function renderModelDescription(tooltip: string, openerService: IOpenerService, store: DisposableStore): HTMLElement {
	const rendered = store.add(renderMarkdown(new MarkdownString(tooltip, { supportThemeIcons: true }), {
		actionHandler: link => { void openerService.open(link, { allowCommands: false, fromUserGesture: true }); },
	}));
	return rendered.element;
}
