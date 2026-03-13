/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IEditorContribution, IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { overviewRulerInfo } from '../../../../editor/common/core/editorColorRegistry.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { getSessionForResource } from './agentFeedbackEditorUtils.js';

const overviewRulerAgentFeedbackForeground = registerColor(
	'editorOverviewRuler.agentFeedbackForeground',
	overviewRulerInfo,
	localize('editorOverviewRuler.agentFeedbackForeground', 'Editor overview ruler decoration color for agent feedback. This color should be opaque.')
);

export class AgentFeedbackOverviewRulerContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'agentFeedback.overviewRulerContribution';

	private readonly _decorations: IEditorDecorationsCollection;
	private _sessionResource: URI | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
	) {
		super();

		this._decorations = this._editor.createDecorationsCollection();

		this._store.add(this._agentFeedbackService.onDidChangeFeedback(() => this._updateDecorations()));
		this._store.add(this._editor.onDidChangeModel(() => {
			this._resolveSession();
			this._updateDecorations();
		}));

		this._resolveSession();
		this._updateDecorations();
	}

	private _resolveSession(): void {
		const model = this._editor.getModel();
		if (!model) {
			this._sessionResource = undefined;
			return;
		}
		this._sessionResource = getSessionForResource(model.uri, this._chatEditingService, this._agentSessionsService);
	}

	private _updateDecorations(): void {
		if (!this._sessionResource) {
			this._decorations.clear();
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			this._decorations.clear();
			return;
		}

		const feedbackItems = this._agentFeedbackService.getFeedback(this._sessionResource);
		const modelUri = model.uri.toString();

		this._decorations.set(
			feedbackItems
				.filter(item => item.resourceUri.toString() === modelUri)
				.map(item => ({
					range: item.range,
					options: {
						description: 'agent-feedback-overview-ruler',
						overviewRuler: {
							color: themeColorFromId(overviewRulerAgentFeedbackForeground),
							position: OverviewRulerLane.Center,
						}
					}
				}))
		);
	}

	override dispose(): void {
		this._decorations.clear();
		super.dispose();
	}
}

registerEditorContribution(AgentFeedbackOverviewRulerContribution.ID, AgentFeedbackOverviewRulerContribution, EditorContributionInstantiation.Eventually);
