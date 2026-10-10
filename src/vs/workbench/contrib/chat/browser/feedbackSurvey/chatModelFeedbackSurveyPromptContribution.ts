/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { IChatModelFeedbackSurveyService } from './chatModelFeedbackSurveyService.js';

/**
 * Watches the model picker of every chat widget and reports switches to the survey service.
 *
 * It sits outside the picker so model selection knows nothing about surveys, and outside the
 * service so the service stays free of widget lifecycle and easy to test.
 */
export class ChatModelFeedbackSurveyPromptContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.modelFeedbackSurveyPrompt';

	private readonly widgetListeners = this._register(new DisposableMap<IChatWidget>());

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatModelFeedbackSurveyService private readonly surveyService: IChatModelFeedbackSurveyService,
	) {
		super();

		for (const widget of this.chatWidgetService.getAllWidgets()) {
			this.trackWidget(widget);
		}
		this._register(this.chatWidgetService.onDidAddWidget(widget => this.trackWidget(widget)));
		this._register(this.chatWidgetService.onDidRemoveWidget(widget => this.widgetListeners.deleteAndDispose(widget)));
	}

	private trackWidget(widget: IChatWidget): void {
		const listener = widget.input.onDidChangeUserSelectedModel(({ fromModelId, toModelId }) => {
			const sessionResource = widget.viewModel?.sessionResource;
			if (!sessionResource) {
				return;
			}

			this.surveyService.notifyModelSwitchedAway(sessionResource, fromModelId, toModelId);
		});

		this.widgetListeners.set(widget, listener);
	}
}
