/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { ISelection, Selection } from '../../../../../../editor/common/core/selection.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IVisibleEditorPane } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CustomEditorInput } from '../../../../customEditor/browser/customEditorInput.js';
import { ICustomEditorService } from '../../../../customEditor/common/customEditor.js';
import { ICustomTextEditorNavigation } from '../../../../customEditor/common/customTextEditorNavigation.js';
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
			get activeEditorPane() { return activeEditorPane; },
			get activeEditor() { return activeEditorPane?.input; },
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

	test('selection changes, collapsed carets and cleared selections update context without webview messages', async () => {
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
	});

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

	test('an older async selection update cannot replace a newer selection or editor', async () => {
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
	});

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
