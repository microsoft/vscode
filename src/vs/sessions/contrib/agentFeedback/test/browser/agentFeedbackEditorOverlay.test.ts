/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { EditorGroupView } from '../../../../../workbench/browser/parts/editor/editorGroupView.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { createEditorPart, TestFileEditorInput, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ICodeReviewService } from '../../../codeReview/browser/codeReviewService.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { AgentFeedbackEditorOverlay, getAgentFeedbackOverlayResourceCandidates } from '../../browser/agentFeedbackEditorOverlay.js';
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
			override readonly onDidChangeFeedbackVisibility = Event.None;
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

	test('hides the overlay for the empty Files editor', () => {
		const disposables = store.add(new DisposableStore());
		const workspaceFolder = URI.file('workspace');

		const fileInput = disposables.add(new TestFileEditorInput(workspaceFolder, 'test.file'));
		const emptyFileInput = disposables.add(new EmptyFileEditorInput({
			uri: workspaceFolder,
			label: 'workspace',
			icon: Codicon.folder,
			folders: [{
				root: workspaceFolder,
				workingDirectory: workspaceFolder,
				name: 'workspace',
				description: undefined,
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}, new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible() { return true; }
		}));

		assert.deepStrictEqual({
			file: getAgentFeedbackOverlayResourceCandidates(fileInput),
			emptyFiles: getAgentFeedbackOverlayResourceCandidates(emptyFileInput),
		}, {
			file: [workspaceFolder],
			emptyFiles: [],
		});
	});
});
