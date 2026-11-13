/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { EditorGroupView } from '../../../../../workbench/browser/parts/editor/editorGroupView.js';
import { ViewEditorInput } from '../../../../../workbench/browser/parts/editor/viewEditorInput.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../../workbench/common/editor.js';
import { ICodeReviewService } from '../../../../../workbench/contrib/sessions/browser/codeReviewService.js';
import { EmptyFileEditorInput } from '../../../../../workbench/contrib/sessions/browser/emptyFileEditorInput.js';
import { AgentFeedbackEditorOverlay, getAgentFeedbackOverlayResourceCandidates, getDiffEditorResource, getNavigationAnchorForResource } from '../../browser/agentFeedbackEditorOverlay.js';
import { ISessionEditorComment } from '../../browser/sessionEditorComments.js';
import { IAgentFeedbackService } from '../../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionHostService, SessionHost, SessionHostKind } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { IChat, ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ITestSessionWithChat } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';

suite('AgentFeedbackEditorOverlay', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * The host of the main window, showing `main`, and that of a chat window, showing `inWindow`, which the groups of
	 * `windowParts` are in.
	 */
	function stubHosts(instantiationService: TestInstantiationService, main: ITestSessionWithChat | undefined, inWindow?: ITestSessionWithChat, windowParts: readonly IEditorPart[] = []): void {
		const contextKeyService = upcastPartial<IContextKeyService>({});
		const mainHost = new SessionHost({ kind: SessionHostKind.MainWindow, parent: undefined, session: constObservable(main), chat: constObservable(main?.activeChat?.get()), contextKeyService });
		const chatWindowHost = new SessionHost({ kind: SessionHostKind.ChatWindow, parent: undefined, session: constObservable(inWindow), chat: constObservable(inWindow?.activeChat?.get()), contextKeyService });
		instantiationService.stub(ISessionHostService, upcastPartial<ISessionHostService>({
			getHostOfGroup: group => windowParts.some(part => part.groups.includes(group as IEditorGroup)) ? chatWindowHost : mainHost,
		}));
	}

	function session(id: string): ITestSessionWithChat {
		return new class extends mock<ITestSessionWithChat>() {
			override readonly sessionId = id;
			override readonly resource = URI.parse(`local-agent-host:/${id}`);
			override readonly isCreated = constObservable(true);
			override readonly status = this.isCreated.map(created => created ? SessionStatus.Completed : SessionStatus.Untitled);
			override readonly activeChat = constObservable(upcastPartial<IChat>({ resource: URI.parse(`local-agent-host:/${id}/chat`) }));
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
		stubHosts(instantiationService, undefined);

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
		// A chat window shows session B; the main window shows session A.
		const windowParts: IEditorPart[] = [];
		stubHosts(instantiationService, session('a'), session('b'), windowParts);

		const windowPart = editorParts.createEditorPart({ container: document.createElement('div') });
		windowParts.push(windowPart);
		disposables.add({ dispose: () => windowPart.close() });
		windowPart.layout(800, 600, 0, 0);

		const contribution = instantiationService.createInstance(AgentFeedbackEditorOverlay);
		disposables.add({ dispose: () => contribution.dispose() });
		const mainFile = disposables.add(new TestFileEditorInput(URI.file('/main.ts'), 'agentFeedbackOverlayInput'));
		const windowFile = disposables.add(new TestFileEditorInput(URI.file('/window.ts'), 'agentFeedbackOverlayInput'));
		groupNames.set('/main.ts', 'main window').set('/window.ts', 'chat window');
		// The chat of the window, a view shown as an editor, in a part of its own: its resource is the chat's, not a file.
		const chatPart = editorParts.createEditorPart({ container: document.createElement('div') });
		windowParts.push(chatPart);
		disposables.add({ dispose: () => chatPart.close() });
		chatPart.layout(400, 600, 0, 0);
		const chatView = disposables.add(new ViewEditorInput('sessions.chat', URI.parse('test-chat:/b')));
		groupNames.set('/b', 'chat view');
		await editorParts.testMainPart.activeGroup.openEditor(mainFile, { pinned: true });
		await windowPart.activeGroup.openEditor(windowFile, { pinned: true });
		await chatPart.activeGroup.openEditor(chatView, { pinned: true });

		const seen = (name: string) => [...new Set(lookups.filter(lookup => lookup.group === name).map(lookup => lookup.hostSession ?? 'none'))];
		assert.deepStrictEqual({ mainWindow: seen('main window'), chatWindow: seen('chat window'), chatView: seen('chat view'), chatViewCandidates: getAgentFeedbackOverlayResourceCandidates(chatView) }, { mainWindow: ['none'], chatWindow: ['b'], chatView: [], chatViewCandidates: [] });
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
		}, upcastPartial<IEditorGroupsService>({ parts: [] })));

		assert.deepStrictEqual({
			file: getAgentFeedbackOverlayResourceCandidates(fileInput),
			emptyFiles: getAgentFeedbackOverlayResourceCandidates(emptyFileInput),
		}, {
			file: [workspaceFolder],
			emptyFiles: [],
		});
	});

	test('anchors the navigation at the first comment of a file that is shown, unless it already is at one of its comments', () => {
		const a = URI.file('/repo/a.ts');
		const b = URI.file('/repo/b.ts');
		const c = URI.file('/repo/c.ts');
		const comments = [
			upcastPartial<ISessionEditorComment>({ id: 'a1', resourceUri: a }),
			upcastPartial<ISessionEditorComment>({ id: 'b1', resourceUri: b }),
			upcastPartial<ISessionEditorComment>({ id: 'b2', resourceUri: b }),
		];

		assert.deepStrictEqual({
			anchorInOtherFile: getNavigationAnchorForResource(comments, 'a1', b),
			noAnchor: getNavigationAnchorForResource(comments, undefined, b),
			anchorInFile: getNavigationAnchorForResource(comments, 'b2', b),
			fileWithoutComments: getNavigationAnchorForResource(comments, 'a1', c),
		}, {
			anchorInOtherFile: 'b1',
			noAnchor: 'b1',
			anchorInFile: undefined,
			fileWithoutComments: undefined,
		});
	});

	test('uses the original file of a diff whose modified side is the empty document of a deleted file', () => {
		const file = URI.file('/repo/a.ts');
		const synthetic = (id: string) => URI.from({ scheme: Schemas.inMemory, path: `/synthetic/${id}` });
		const diff = (original: URI, modified: URI) => getDiffEditorResource({ original: { uri: original }, modified: { uri: modified } }).toString();

		assert.deepStrictEqual({
			modified: diff(URI.file('/repo/.git/a.ts'), file),
			added: diff(synthetic('1'), file),
			deleted: diff(file, synthetic('2')),
		}, {
			modified: file.toString(),
			added: file.toString(),
			deleted: file.toString(),
		});
	});
});
