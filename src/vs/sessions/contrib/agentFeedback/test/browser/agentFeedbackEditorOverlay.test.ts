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
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../../workbench/common/editor.js';
import { ICodeReviewService } from '../../../codeReview/browser/codeReviewService.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { AgentFeedbackEditorOverlay, getAgentFeedbackOverlayResourceCandidates } from '../../browser/agentFeedbackEditorOverlay.js';
import { IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionScope } from '../../../../services/sessions/browser/sessionScope.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../services/sessions/common/session.js';

suite('AgentFeedbackEditorOverlay', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** The main window's session, the main window's session scope (its default), and the session active in any window. */
	function stubSessions(instantiationService: TestInstantiationService, main: IActiveSession | undefined, active: IActiveSession | undefined): void {
		const mainWindowActiveSession = observableValue<IActiveSession | undefined>('mainWindowActiveSession', main);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly mainWindowActiveSession = mainWindowActiveSession;
			override readonly activeSession = observableValue<IActiveSession | undefined>('activeSession', active);
		}());
		instantiationService.stub(ISessionScope, { _serviceBrand: undefined, session: mainWindowActiveSession });
	}

	function session(id: string): IActiveSession {
		return new class extends mock<IActiveSession>() {
			override readonly sessionId = id;
			override readonly resource = URI.parse(`local-agent-host:/${id}`);
		}();
	}

	test('anchors the overlay host to the editor pane container', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const editorParts = await createEditorParts(instantiationService, disposables);
		const editorPart = editorParts.testMainPart;
		instantiationService.stub(IEditorGroupsService, editorParts);
		instantiationService.stub(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly onDidChangeFeedbackVisibility = Event.None;
			override readonly onDidChangeNavigation = Event.None;
			override readonly onDidChangeFeedbackScope = Event.None;
		});
		instantiationService.stub(ICodeReviewService, new class extends mock<ICodeReviewService>() { });
		stubSessions(instantiationService, undefined, undefined);

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

	test('resolves the feedback of a file in a window that shows a session of its own, such as a chat window, in that session, whichever session is active, and in the main window as before', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		disposables.add(registerTestEditor('agentFeedbackOverlayEditor', [new SyncDescriptor(TestFileEditorInput)], 'agentFeedbackOverlayInput'));
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const editorParts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, editorParts);
		const lookups: { group: string; hostSession: string | undefined }[] = [];
		const groupNames = new Map<unknown, string>();
		instantiationService.stub(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly onDidChangeFeedbackVisibility = Event.None;
			override readonly onDidChangeNavigation = Event.None;
			override readonly onDidChangeFeedbackScope = Event.None;
			override getFeedbackSessionResource(resourceUri: URI, hostSession?: ISession): URI | undefined {
				lookups.push({ group: groupNames.get(resourceUri.path) ?? resourceUri.path, hostSession: hostSession?.sessionId });
				return undefined;
			}
		});
		instantiationService.stub(ICodeReviewService, new class extends mock<ICodeReviewService>() { });
		// The chat window of session B has focus, so B is active; the main window shows session A.
		const windowSession = session('b');
		stubSessions(instantiationService, session('a'), windowSession);

		const windowScope: ISessionScope = { _serviceBrand: undefined, session: constObservable<IActiveSession | undefined>(windowSession) as IObservable<IActiveSession | undefined> };
		const windowPart = editorParts.createEditorPart({ container: document.createElement('div'), services: new ServiceCollection([ISessionScope, windowScope]) });
		disposables.add({ dispose: () => windowPart.close() });
		windowPart.layout(800, 600, 0, 0);

		const contribution = instantiationService.createInstance(AgentFeedbackEditorOverlay);
		disposables.add({ dispose: () => contribution.dispose() });
		const mainFile = disposables.add(new TestFileEditorInput(URI.file('/main.ts'), 'agentFeedbackOverlayInput'));
		const windowFile = disposables.add(new TestFileEditorInput(URI.file('/window.ts'), 'agentFeedbackOverlayInput'));
		groupNames.set('/main.ts', 'main window').set('/window.ts', 'chat window');
		await editorParts.testMainPart.activeGroup.openEditor(mainFile, { pinned: true });
		await windowPart.activeGroup.openEditor(windowFile, { pinned: true });

		const seen = (name: string) => [...new Set(lookups.filter(lookup => lookup.group === name).map(lookup => lookup.hostSession ?? 'none'))];
		assert.deepStrictEqual({ mainWindow: seen('main window'), chatWindow: seen('chat window') }, { mainWindow: ['none'], chatWindow: ['b'] });
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
