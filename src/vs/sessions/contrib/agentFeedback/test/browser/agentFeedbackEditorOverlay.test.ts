/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { EditorGroupView } from '../../../../../workbench/browser/parts/editor/editorGroupView.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { createEditorPart, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ICodeReviewService } from '../../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackEditorOverlay } from '../../browser/agentFeedbackEditorOverlay.js';
import { IAgentFeedbackService } from '../../browser/agentFeedbackService.js';

suite('AgentFeedbackEditorOverlay', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('anchors the overlay host to the editor pane container', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const editorPart = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, editorPart);
		instantiationService.stub(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly onDidChangeNavigation = Event.None;
			override readonly onDidChangeFeedbackScope = Event.None;
		});
		instantiationService.stub(ICodeReviewService, new class extends mock<ICodeReviewService>() { });

		const group = editorPart.activeGroup;
		assert.ok(group instanceof EditorGroupView);
		const fullEditorWidth = Number.parseInt(group.editorPaneContainer.style.width, 10);
		group.setContentRightInset(300);

		const contribution = instantiationService.createInstance(AgentFeedbackEditorOverlay);
		assert.deepStrictEqual({
			editorPaneWidthReduction: fullEditorWidth - Number.parseInt(group.editorPaneContainer.style.width, 10),
			editorPaneIsHost: group.editorPaneContainer.classList.contains('agent-feedback-editor-overlay-host'),
			editorGroupIsHost: group.element.classList.contains('agent-feedback-editor-overlay-host'),
		}, {
			editorPaneWidthReduction: 300,
			editorPaneIsHost: true,
			editorGroupIsHost: false,
		});

		contribution.dispose();
		assert.strictEqual(group.editorPaneContainer.classList.contains('agent-feedback-editor-overlay-host'), false);
	});
});
