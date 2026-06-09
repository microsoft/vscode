/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolRiskAssessmentService, ToolRiskPromptKind } from '../../../tools/chatToolRiskAssessmentService.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { ToolRiskBadgeWidget } from './toolRiskBadgeWidget.js';

/**
 * Creates a {@link ToolRiskBadgeWidget} for a tool confirmation surface, or `undefined` when the
 * feature is disabled or the tool is unknown. A cached assessment renders synchronously; otherwise
 * the badge shows a loading state and assesses asynchronously, hiding itself on failure.
 *
 * The widget and its assessment token are registered on `store`, so disposing the store cancels
 * any in-flight assessment. The widget is returned so terminal confirmations can attach
 * `setDetails` / `onDidHide`; most callers only need its `domNode` as a `footerBanner`.
 *
 * `kind` selects the rubric (terminal vs. generic); when omitted it is auto-detected from the tool id.
 */
export function createToolRiskBadge(
	store: DisposableStore,
	instantiationService: IInstantiationService,
	riskAssessmentService: IChatToolRiskAssessmentService,
	languageModelToolsService: ILanguageModelToolsService,
	toolId: string,
	parameters: unknown,
	kind?: ToolRiskPromptKind,
): ToolRiskBadgeWidget | undefined {
	// Check the feature flag before the tool lookup so it is skipped when disabled.
	if (!riskAssessmentService.isEnabled()) {
		return undefined;
	}

	const tool = languageModelToolsService.getTool(toolId);
	if (!tool) {
		return undefined;
	}

	const widget = store.add(instantiationService.createInstance(ToolRiskBadgeWidget));
	const cached = riskAssessmentService.getCached(tool, parameters, kind);
	if (cached) {
		widget.setAssessment(cached);
		return widget;
	}

	widget.setLoading();
	const cts = new CancellationTokenSource();
	store.add(toDisposable(() => cts.dispose(true)));
	(async () => {
		try {
			const result = await riskAssessmentService.assess(tool, parameters, cts.token, kind);
			if (cts.token.isCancellationRequested || widget.isDisposed) {
				return;
			}
			if (!result) {
				widget.setHidden();
				return;
			}
			widget.setAssessment(result);
		} catch {
			if (!widget.isDisposed) {
				widget.setHidden();
			}
		}
	})();
	return widget;
}
