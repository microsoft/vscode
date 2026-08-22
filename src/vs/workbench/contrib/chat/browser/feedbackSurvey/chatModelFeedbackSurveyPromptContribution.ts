/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../../base/common/observable.js';
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
		const listeners = new DisposableStore();

		// The widget loads its session after it registers, and the model resolves around the same
		// time. Re-running on that event keeps the pairing below anchored to the right session.
		const viewModelChanged = observableSignalFromEvent('chatFeedbackSurveyViewModel', widget.onDidChangeViewModel);
		let previous: { readonly modelId: string; readonly session: string } | undefined;

		listeners.add(autorun(reader => {
			viewModelChanged.read(reader);
			const modelId = widget.input.selectedLanguageModel.read(reader)?.identifier;
			const sessionResource = widget.viewModel?.sessionResource;
			const session = sessionResource?.toString();

			const last = previous;
			previous = modelId && session ? { modelId, session } : undefined;

			// Loading a different session restores that session's own model, so the next change is
			// measured from there rather than from whatever the previous session was using.
			if (last && last.session !== session) {
				previous = undefined;
				return;
			}

			// Only a move between two known models counts. The first resolution and any gap while
			// models load are not the user rejecting anything.
			if (!last || !modelId || !sessionResource || last.modelId === modelId) {
				return;
			}

			this.surveyService.notifyModelSwitchedAway(sessionResource, last.modelId, modelId);
		}));

		this.widgetListeners.set(widget, listeners);
	}
}
