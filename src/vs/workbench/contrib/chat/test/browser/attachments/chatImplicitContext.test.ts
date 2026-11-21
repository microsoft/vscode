/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { getCodeEditor, ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { ISelection, Selection } from '../../../../../../editor/common/core/selection.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { FileOperation, FileOperationEvent } from '../../../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../../browser/editor.js';
import { EditorPane } from '../../../../../browser/parts/editor/editorPane.js';
import { EditorExtensions, IEditorIdentifier, IEditorPane, IVisibleEditorPane } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../../../common/editor/sideBySideEditorInput.js';
import { CodeEditorService } from '../../../../../services/editor/browser/codeEditorService.js';
import { EditorService } from '../../../../../services/editor/browser/editorService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { createEditorPart, registerTestEditor, registerTestFileEditor, registerTestSideBySideEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestFileService } from '../../../../../test/common/workbenchTestServices.js';
import { CustomEditorInput } from '../../../../customEditor/browser/customEditorInput.js';
import { ICustomEditorService } from '../../../../customEditor/common/customEditor.js';
import { ICustomTextEditorNavigation } from '../../../../customEditor/common/customTextEditorNavigation.js';
import { FileEditorInput } from '../../../../files/browser/editors/fileEditorInput.js';
import { ICellViewModel, INotebookEditor } from '../../../../notebook/browser/notebookBrowser.js';
import { CellUri, NOTEBOOK_EDITOR_ID } from '../../../../notebook/common/notebookCommon.js';
import { IOverlayWebview } from '../../../../webview/browser/webview.js';
import { IWebviewWorkbenchService } from '../../../../webviewPanel/browser/webviewWorkbenchService.js';
import { ChatImplicitContextContribution, ChatImplicitContexts } from '../../../browser/attachments/chatImplicitContext.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatContextService } from '../../../browser/contextContrib/chatContextService.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { StringChatContextValue } from '../../../common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { ILanguageModelIgnoredFilesService } from '../../../common/ignoredFiles.js';

suite('Chat implicit custom editor context', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupContext(options: {
		readonly enabled?: string;
		readonly ignored?: boolean;
		readonly contextForResource?: IChatContextService['contextForResource'];
	} = {}) {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(ICustomEditorService, { getCustomEditorCapabilities: () => undefined });
		instantiation.stub(IWebviewWorkbenchService, {});
		const configuration = new TestConfigurationService({
			chat: { implicitContext: { enabled: { [ChatAgentLocation.Chat]: options.enabled ?? 'always' }, suggestedContext: true } }
		});
		instantiation.stub(IConfigurationService, configuration);
		const model = store.add(createTextModel('# Heading\nSome **selected** text\nMore text', 'markdown', undefined, URI.file('/workspace/document.md')));
		const codeModel = store.add(createTextModel('other editor', 'plaintext', undefined, URI.file('/workspace/other.txt')));
		const codeSelection = new Selection(1, 1, 1, 6);
		const codeEditor = upcastPartial<ICodeEditor>({
			getModel: () => codeModel,
			getSelection: () => codeSelection,
			onDidChangeModel: Event.None,
			onDidChangeModelLanguage: Event.None,
			onDidChangeCursorSelection: Event.None,
			onDidScrollChange: Event.None,
		});
		instantiation.stub(ICodeEditorService, {
			getActiveCodeEditor: () => codeEditor,
			getFocusedCodeEditor: () => codeEditor,
		});
		const activeEditorChanged = store.add(new Emitter<void>());
		let activeEditorPane: IVisibleEditorPane | undefined;
		instantiation.stub(IEditorService, {
			onDidActiveEditorChange: activeEditorChanged.event,
			onDidCloseEditor: Event.None,
			get activeEditorPane() { return activeEditorPane; },
			get activeEditor() { return activeEditorPane?.input; },
			get visibleEditorPanes() { return activeEditorPane ? [activeEditorPane] : []; },
		});
		const implicitContext = store.add(new ChatImplicitContexts());
		const widgets: IChatWidget[] = [];
		const widgetAdded = store.add(new Emitter<IChatWidget>());
		function addWidget(context = store.add(new ChatImplicitContexts())) {
			const widget = upcastPartial<IChatWidget>({
				location: ChatAgentLocation.Chat,
				input: upcastPartial<ChatInputPart>({ implicitContext: context }),
			});
			widgets.push(widget);
			widgetAdded.fire(widget);
			return context;
		}
		addWidget(implicitContext);
		instantiation.stub(IChatWidgetService, {
			getWidgetsByLocations: location => location === ChatAgentLocation.Chat ? widgets : [],
			onDidAddWidget: widgetAdded.event,
		});
		instantiation.stub(IChatService, { onDidSubmitRequest: Event.None });
		instantiation.stub(IChatEditingService, { editingSessionsObs: constObservable([]) });
		instantiation.stub(ILanguageModelIgnoredFilesService, { fileIsIgnored: async () => options.ignored ?? false });
		instantiation.stub(IChatContextService, { contextForResource: options.contextForResource ?? (async () => undefined) });

		function createEditor() {
			const messages = store.add(new Emitter<{ message: unknown; transfer?: readonly ArrayBuffer[] }>());
			const webview = upcastPartial<IOverlayWebview>({ onMessage: messages.event, dispose: () => { } });
			const input = store.add(instantiation.createInstance(CustomEditorInput, {
				resource: model.uri, viewType: 'test.richMarkdown', webviewTitle: undefined, preferredName: 'document.md', iconPath: undefined,
			}, webview, {}));
			const navigation = store.add(new TestNavigation(model));
			return { input, navigation, messages };
		}

		function activate(input: CustomEditorInput | undefined) {
			activeEditorPane = input ? upcastPartial<IVisibleEditorPane>({ input, getControl: () => undefined, getId: () => 'test.customEditor' }) : undefined;
			activeEditorChanged.fire();
		}

		const editor = createEditor();
		activate(editor.input);
		const contribution = store.add(instantiation.createInstance(ChatImplicitContextContribution));
		const values = () => implicitContext.values.map(value => ({ value: value.value, isSelection: value.isSelection }));
		return { ...editor, createEditor, activate, addWidget, model, codeModel, codeSelection, values, implicitContext, contribution };
	}

	test('navigation becoming available supplies source selection instead of the previous code editor', async () => {
		const fixture = setupContext();
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), []);

		fixture.navigation.selection = { selectionStartLineNumber: 2, selectionStartColumn: 6, positionLineNumber: 2, positionColumn: 18 };
		fixture.input.navigation = fixture.navigation;
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), [{
			value: { uri: fixture.model.uri, range: new Selection(2, 6, 2, 18) }, isSelection: true,
		}]);
		assert.strictEqual(fixture.model.getValueInRange(fixture.implicitContext.getLocations()[0].range), '**selected**');
		fixture.implicitContext.setEnabled(true);
		assert.strictEqual(fixture.implicitContext.enabledBaseEntries(false)[0].id, 'vscode.implicit.selection');
	});

	test('selection changes, collapsed carets and cleared selections update context without webview messages', () => runWithFakedTimers({}, async () => {
		// Advance past the selection debounce in virtual time.
		const fixture = setupContext();
		fixture.input.navigation = fixture.navigation;
		fixture.navigation.updateSelection(new Selection(3, 5, 2, 1));
		await timeout(510);
		assert.deepStrictEqual(fixture.values(), [{
			value: { uri: fixture.model.uri, range: new Selection(3, 5, 2, 1) }, isSelection: true,
		}]);
		fixture.navigation.updateSelection(new Selection(2, 1, 2, 1));
		await timeout(510);
		assert.deepStrictEqual(fixture.values(), [{ value: fixture.model.uri, isSelection: false }]);
		fixture.navigation.updateSelection(undefined);
		await timeout(510);
		assert.deepStrictEqual(fixture.values(), [{ value: fixture.model.uri, isSelection: false }]);
	}));

	test('switching panels uses only the active panel and detaches the previous navigation', async () => {
		const fixture = setupContext();
		fixture.input.navigation = fixture.navigation;
		const second = fixture.createEditor();
		second.navigation.selection = new Selection(3, 1, 3, 5);
		second.input.navigation = second.navigation;
		fixture.activate(second.input);
		await timeout(0);
		fixture.navigation.updateSelection(new Selection(1, 1, 1, 4));
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), [{
			value: { uri: fixture.model.uri, range: second.navigation.selection }, isSelection: true,
		}]);
		second.input.navigation = undefined;
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), []);
		second.navigation.updateSelection(new Selection(2, 1, 2, 5));
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), []);
		second.input.navigation = fixture.navigation;
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), [{
			value: { uri: fixture.model.uri, range: fixture.navigation.selection }, isSelection: true,
		}]);
	});

	test('custom-editor context providers supplement rather than replace the selection', async () => {
		const context: StringChatContextValue = { name: 'Additional context', value: 'Context', uri: URI.file('/workspace/document.md'), handle: 1 };
		const fixture = setupContext({ contextForResource: async () => context });
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), [{ value: context, isSelection: false }]);
		fixture.navigation.selection = new Selection(2, 1, 2, 5);
		fixture.input.navigation = fixture.navigation;
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), [
			{ value: { uri: fixture.model.uri, range: fixture.navigation.selection }, isSelection: true },
			{ value: context, isSelection: false },
		]);
	});

	for (const options of [{ enabled: 'never' }, { ignored: true }]) {
		test(`respects implicit context policy ${JSON.stringify(options)}`, async () => {
			const fixture = setupContext(options);
			fixture.navigation.selection = new Selection(2, 1, 2, 5);
			fixture.input.navigation = fixture.navigation;
			await timeout(0);
			assert.deepStrictEqual(fixture.values(), []);
		});
	}

	test('an older async selection update cannot replace a newer selection or editor', () => runWithFakedTimers({}, async () => {
		// Advance past the selection debounce in virtual time.
		let pending: DeferredPromise<StringChatContextValue | undefined> | undefined;
		const fixture = setupContext({ contextForResource: () => pending?.p ?? Promise.resolve(undefined) });
		fixture.input.navigation = fixture.navigation;
		await timeout(0);
		pending = new DeferredPromise();
		fixture.navigation.updateSelection(new Selection(2, 1, 2, 5));
		await timeout(510);
		const previous = pending;
		pending = undefined;
		fixture.navigation.updateSelection(new Selection(3, 1, 3, 5));
		await timeout(510);
		await previous.complete(undefined);
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), [{
			value: { uri: fixture.model.uri, range: new Selection(3, 1, 3, 5) }, isSelection: true,
		}]);

		pending = new DeferredPromise();
		fixture.navigation.updateSelection(new Selection(2, 1, 2, 5));
		await timeout(510);
		const previousEditor = pending;
		pending = undefined;
		fixture.activate(undefined);
		await timeout(0);
		await previousEditor.complete(undefined);
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), [{
			value: { uri: fixture.codeModel.uri, range: fixture.codeSelection }, isSelection: true,
		}]);
	}));

	test('disposing the contribution cancels pending updates and removes selection listeners', async () => {
		let pending: DeferredPromise<StringChatContextValue | undefined> | undefined;
		const fixture = setupContext({ contextForResource: () => pending?.p ?? Promise.resolve(undefined) });
		fixture.input.navigation = fixture.navigation;
		await timeout(0);
		pending = new DeferredPromise();
		fixture.navigation.updateSelection(new Selection(2, 1, 2, 5));
		await timeout(510);
		fixture.contribution.dispose();
		await pending.complete(undefined);
		pending = undefined;
		fixture.navigation.updateSelection(new Selection(3, 1, 3, 5));
		await timeout(0);
		assert.deepStrictEqual(fixture.values(), [{ value: fixture.model.uri, isSelection: false }]);
	});

	test('coalesces selection, content, language and webview events into one provider request', async () => {
		let calls = 0;
		const fixture = setupContext({ contextForResource: async () => { calls++; return undefined; } });
		fixture.input.navigation = fixture.navigation;
		await timeout(0);
		calls = 0;
		for (let i = 0; i < 10; i++) {
			fixture.model.setValue(`Edit ${i}`);
			fixture.navigation.updateSelection(new Selection(1, 1, 1, 5));
			fixture.messages.fire({ message: { selectionChanged: true } });
		}
		fixture.model.setLanguage('plaintext');
		await timeout(250);
		assert.strictEqual(calls, 0);
		await timeout(260);
		assert.deepStrictEqual({ calls, values: fixture.values() }, {
			calls: 1,
			values: [{ value: { uri: fixture.model.uri, range: new Selection(1, 1, 1, 5) }, isSelection: true }],
		});
	});

	test('adding a widget during a pending full refresh updates both old and new widgets', async () => {
		let pending: DeferredPromise<StringChatContextValue | undefined> | undefined;
		const fixture = setupContext({ contextForResource: () => pending?.p ?? Promise.resolve(undefined) });
		fixture.input.navigation = fixture.navigation;
		await timeout(0);
		pending = new DeferredPromise();
		fixture.navigation.updateSelection(new Selection(2, 1, 2, 5));
		await timeout(510);
		const oldRefresh = pending;
		pending = undefined;
		const added = fixture.addWidget();
		await timeout(0);
		await oldRefresh.complete(undefined);
		await timeout(0);
		assert.deepStrictEqual({
			existing: fixture.implicitContext.getLocations(),
			added: added.getLocations(),
		}, {
			existing: [{ uri: fixture.model.uri, range: new Selection(2, 1, 2, 5) }],
			added: [{ uri: fixture.model.uri, range: new Selection(2, 1, 2, 5) }],
		});
	});
});

suite('Chat implicit context of a closed editor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const nonCodeEditorId = 'test.chatImplicitContext.nonCodeEditor';
	const documentUri = URI.file('/workspace/document.txt');
	const notebookUri = URI.file('/workspace/notebook.ipynb');

	async function setupEditors(contextForResource: IChatContextService['contextForResource'] = async () => undefined) {
		store.add(registerTestFileEditor());
		store.add(registerTestSideBySideEditor());
		store.add(registerTestEditor(nonCodeEditorId, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(CustomEditorInput)]));
		store.add(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TestNotebookEditorPane, NOTEBOOK_EDITOR_ID, 'Notebook'), [new SyncDescriptor(TestNotebookEditorInput)]));
		const fileService = store.add(new TestFileService());
		const instantiation = workbenchInstantiationService({
			fileService: () => fileService,
			configurationService: () => new TestConfigurationService({
				chat: { implicitContext: { enabled: { [ChatAgentLocation.Chat]: 'always' }, suggestedContext: true } }
			})
		}, store);
		const part = await createEditorPart(instantiation, store.add(new DisposableStore()));
		instantiation.stub(IEditorGroupsService, part);
		const editorService = store.add(instantiation.createInstance(EditorService, undefined));
		instantiation.stub(IEditorService, editorService);
		instantiation.stub(ICodeEditorService, store.add(instantiation.createInstance(CodeEditorService)));
		instantiation.stub(ICustomEditorService, { getCustomEditorCapabilities: () => undefined });
		instantiation.stub(IWebviewWorkbenchService, {});
		const implicitContext = store.add(new ChatImplicitContexts());
		const widget = upcastPartial<IChatWidget>({
			location: ChatAgentLocation.Chat,
			input: upcastPartial<ChatInputPart>({ implicitContext }),
		});
		instantiation.stub(IChatWidgetService, {
			getWidgetsByLocations: location => location === ChatAgentLocation.Chat ? [widget] : [],
			onDidAddWidget: Event.None,
		});
		instantiation.stub(IChatService, { onDidSubmitRequest: Event.None });
		instantiation.stub(IChatEditingService, { editingSessionsObs: constObservable([]) });
		instantiation.stub(ILanguageModelIgnoredFilesService, { fileIsIgnored: async () => false });
		instantiation.stub(IChatContextService, { contextForResource });

		function selectText(pane: IEditorPane | undefined): IEditorIdentifier {
			const codeEditor = getCodeEditor(pane?.getControl());
			assert.ok(pane?.input && codeEditor);
			codeEditor.setSelection(new Selection(1, 1, 1, 6));
			return { editor: pane.input, groupId: pane.group.id };
		}

		/** Opens the document in a text editor and selects some of its text. */
		async function openDocument(group?: typeof SIDE_GROUP): Promise<IEditorIdentifier> {
			return selectText(await editorService.openEditor({ resource: documentUri, options: { pinned: true } }, group));
		}

		/** Deletes the document the way the Explorer does, which closes its editor. */
		async function deleteDocument(): Promise<void> {
			const closed = Event.toPromise(editorService.onDidCloseEditor);
			fileService.fireAfterOperation(new FileOperationEvent(documentUri, FileOperation.DELETE));
			await closed;
		}

		/** Creates an editor of the file that is separate from the one of its tab. */
		function createEditor(resource: URI): EditorInput {
			return store.add(instantiation.createInstance(FileEditorInput, resource, undefined, undefined, undefined, undefined, undefined, undefined));
		}

		/** Opens an editor with two sides, like a diff editor, and selects some text in its primary side unless it is inactive. */
		async function openSecondEditor(primary: EditorInput, secondary: EditorInput, options?: IEditorOptions): Promise<IEditorIdentifier> {
			const editor = store.add(instantiation.createInstance(SideBySideEditorInput, undefined, undefined, secondary, primary));
			const pane = await editorService.openEditor(editor, { pinned: true, ...options });
			return options?.inactive ? { editor, groupId: part.activeGroup.id } : selectText(pane);
		}

		/** Opens the document in a custom editor without text navigation, which only context providers describe. */
		async function openCustomEditor(): Promise<IEditorIdentifier> {
			const webview = upcastPartial<IOverlayWebview>({ onMessage: Event.None, dispose: () => { } });
			const editor = store.add(instantiation.createInstance(TestCustomEditorInput, {
				resource: documentUri, viewType: 'test.customEditor', webviewTitle: undefined, preferredName: 'document.txt', iconPath: undefined,
			}, webview, {}));
			await editorService.openEditor(editor, { pinned: true });
			return { editor, groupId: part.activeGroup.id };
		}

		/** Opens the notebook, whose active cell is its context. The tab tells editors of the notebook apart. */
		async function openNotebook(tab: string): Promise<IEditorIdentifier> {
			const editor = store.add(new TestNotebookEditorInput(notebookUri, tab));
			await editorService.openEditor(editor, { pinned: true });
			return { editor, groupId: part.activeGroup.id };
		}

		/** Opens an editor that has no code editor, like the Welcome page. */
		async function openNonCodeEditor(group?: typeof SIDE_GROUP): Promise<void> {
			await editorService.openEditor(store.add(new TestFileEditorInput(URI.parse('test://welcome'), nonCodeEditorId)), { pinned: true }, group);
		}

		async function startImplicitContext(): Promise<void> {
			store.add(instantiation.createInstance(ChatImplicitContextContribution));
			await timeout(0);
		}

		const attached = () => implicitContext.values.map(value => ({ id: value.id, resource: value.uri?.toString() }));
		return { editorService, openDocument, deleteDocument, createEditor, openSecondEditor, openCustomEditor, openNotebook, openNonCodeEditor, startImplicitContext, attached };
	}

	const attachedSelection = [{ id: 'vscode.implicit.selection', resource: documentUri.toString() }];

	const removals: [string, (fixture: Awaited<ReturnType<typeof setupEditors>>, opened: IEditorIdentifier) => Promise<void>][] = [
		['closing', (fixture, opened) => fixture.editorService.closeEditor(opened)],
		['deleting', fixture => fixture.deleteDocument()],
	];
	for (const [name, remove] of removals) {
		test(`${name} the active document drops its selection when a non-code editor takes its place`, async () => {
			const fixture = await setupEditors();
			await fixture.openNonCodeEditor();
			const opened = await fixture.openDocument();
			await fixture.startImplicitContext();
			const whileOpen = fixture.attached();

			await remove(fixture, opened);
			await timeout(0);
			assert.deepStrictEqual({ whileOpen, afterwards: fixture.attached() }, { whileOpen: attachedSelection, afterwards: [] });
		});
	}

	test('switching to a non-code editor keeps the selection until its document is closed', async () => {
		const fixture = await setupEditors();
		const opened = await fixture.openDocument();
		await fixture.startImplicitContext();

		await fixture.openNonCodeEditor();
		await timeout(0);
		const whileOpen = fixture.attached();

		await fixture.editorService.closeEditor(opened);
		await timeout(0);
		assert.deepStrictEqual({ whileOpen, afterwards: fixture.attached() }, { whileOpen: attachedSelection, afterwards: [] });
	});

	const secondEditors: [string, (fixture: Awaited<ReturnType<typeof setupEditors>>, opened: IEditorIdentifier) => [primary: EditorInput, secondary: EditorInput]][] = [
		['shares the editor of the document', (fixture, opened) => [opened.editor, opened.editor]],
		['has its own editor of the document', fixture => [fixture.createEditor(documentUri), fixture.createEditor(URI.file('/workspace/original.txt'))]],
	];
	for (const [name, sides] of secondEditors) {
		test(`the selection is kept while a second editor that ${name} is still open`, async () => {
			const fixture = await setupEditors();
			const opened = await fixture.openDocument();
			await fixture.startImplicitContext();
			const second = await fixture.openSecondEditor(...sides(fixture, opened), { inactive: true });
			await fixture.openNonCodeEditor();

			await fixture.editorService.closeEditor(opened);
			await timeout(0);
			const whileOpen = fixture.attached();

			await fixture.editorService.closeEditor(second);
			await timeout(0);
			assert.deepStrictEqual({ whileOpen, afterwards: fixture.attached() }, { whileOpen: attachedSelection, afterwards: [] });
		});
	}

	test('a selection made in a second editor of the document is kept until the document is closed', async () => {
		const fixture = await setupEditors();
		const opened = await fixture.openDocument();
		const second = await fixture.openSecondEditor(fixture.createEditor(documentUri), fixture.createEditor(documentUri));
		await fixture.startImplicitContext();
		await fixture.openNonCodeEditor();

		await fixture.editorService.closeEditor(second);
		await timeout(0);
		const whileOpen = fixture.attached();

		await fixture.editorService.closeEditor(opened);
		await timeout(0);
		assert.deepStrictEqual({ whileOpen, afterwards: fixture.attached() }, { whileOpen: attachedSelection, afterwards: [] });
	});

	test('a refresh that finishes after its document was closed does not attach the selection', async () => {
		const pending = new DeferredPromise<undefined>();
		const fixture = await setupEditors(() => pending.p);
		const opened = await fixture.openDocument();
		await fixture.openNonCodeEditor(SIDE_GROUP);
		await fixture.startImplicitContext();

		await fixture.editorService.closeEditor(opened);
		await pending.complete(undefined);
		await timeout(0);
		assert.deepStrictEqual(fixture.attached(), []);
	});

	test('context that only a context provider supplies is kept while another editor of its document is open', async () => {
		const context: StringChatContextValue = { name: 'Provided context', value: 'Context', uri: documentUri, handle: 1 };
		const fixture = await setupEditors(async (uri, language, viewType) => viewType ? context : undefined);
		const opened = await fixture.openDocument();
		const custom = await fixture.openCustomEditor();
		await fixture.startImplicitContext();
		await fixture.openNonCodeEditor();

		await fixture.editorService.closeEditor(custom);
		await timeout(0);
		const whileOpen = fixture.attached();

		await fixture.editorService.closeEditor(opened);
		await timeout(0);
		assert.deepStrictEqual({ whileOpen, afterwards: fixture.attached() }, { whileOpen: [{ id: 'vscode.implicit.string', resource: documentUri.toString() }], afterwards: [] });
	});

	test('the cell of a closed notebook is kept until no editor of the notebook is open', async () => {
		const fixture = await setupEditors();
		const other = await fixture.openNotebook('other tab');
		await fixture.openNonCodeEditor();
		const opened = await fixture.openNotebook('tab');
		await fixture.startImplicitContext();

		await fixture.editorService.closeEditor(opened);
		await timeout(0);
		const whileOpen = fixture.attached();

		await fixture.editorService.closeEditor(other);
		await timeout(0);
		assert.deepStrictEqual({ whileOpen, afterwards: fixture.attached() }, { whileOpen: [{ id: 'vscode.implicit.file', resource: CellUri.generate(notebookUri, 0).toString() }], afterwards: [] });
	});

	test('closing the document in another group than the non-code editor drops its selection', async () => {
		const fixture = await setupEditors();
		await fixture.openNonCodeEditor();
		const opened = await fixture.openDocument(SIDE_GROUP);
		await fixture.startImplicitContext();
		const whileOpen = fixture.attached();

		await fixture.editorService.closeEditor(opened);
		await timeout(0);
		assert.deepStrictEqual({ whileOpen, afterwards: fixture.attached() }, { whileOpen: attachedSelection, afterwards: [] });
	});
});

/** Stands in for the notebook editor pane, whose control is the notebook editor. */
class TestNotebookEditorPane extends EditorPane {
	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(NOTEBOOK_EDITOR_ID, group, telemetryService, themeService, storageService);
	}

	override getControl(): INotebookEditor | undefined {
		const notebook = this.input?.resource;
		return notebook && upcastPartial<INotebookEditor>({
			isReplHistory: false,
			getActiveCell: () => upcastPartial<ICellViewModel>({ uri: CellUri.generate(notebook, 0) }),
			onDidChangeActiveCell: Event.None,
			onDidChangeModel: Event.None,
		});
	}

	protected createEditor(): void { }
	layout(): void { }
}

class TestNotebookEditorInput extends TestFileEditorInput { }

/** A custom editor that opens without resolving its webview and model. */
class TestCustomEditorInput extends CustomEditorInput {
	override async resolve(): Promise<null> {
		return null;
	}
}

class TestNavigation extends Disposable implements ICustomTextEditorNavigation {
	private readonly _onDidChangeSelection = this._register(new Emitter<void>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;
	readonly onDidDispose = Event.None;
	selection: ISelection | undefined;

	constructor(readonly model: ITextModel) {
		super();
	}

	updateSelection(selection: Selection | undefined): void {
		this.selection = selection;
		this._onDidChangeSelection.fire();
	}

	async revealRange(): Promise<void> { }
	captureViewState() { return Disposable.None; }
}
