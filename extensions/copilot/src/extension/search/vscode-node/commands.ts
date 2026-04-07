/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IFeedbackReporter } from '../../prompt/node/feedbackReporter';
import { SearchFeedbackKind, SemanticSearchTextSearchProvider } from '../../workspaceSemanticSearch/node/semanticSearchTextSearchProvider';

export class SearchPanelCommands extends Disposable {
	constructor(
		@ITelemetryService readonly telemetryService: ITelemetryService,
		@IFeedbackReporter private readonly feedbackReporter: IFeedbackReporter,
	) {
		super();
		this._register(vscode.commands.registerCommand('github.copilot.search.markHelpful', () => {
			this.sendFeedback(SearchFeedbackKind.Helpful);
		}));
		this._register(vscode.commands.registerCommand('github.copilot.search.markUnhelpful', () => {
			this.sendFeedback(SearchFeedbackKind.Unhelpful);
		}));
		this._register(vscode.commands.registerCommand('github.copilot.search.feedback', () => {
			this.sendFeedback(SearchFeedbackKind.Feedback);
			vscode.commands.executeCommand('github.copilot.report', `Copilot search feedback: "${SemanticSearchTextSearchProvider.latestQuery}"`);
		}));
	}

	private sendFeedback(kind: SearchFeedbackKind) {
		this.feedbackReporter.reportSearch(kind);
		vscode.commands.executeCommand('setContext', SemanticSearchTextSearchProvider.feedBackSentKey, true);
	}
}
