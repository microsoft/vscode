/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActiveCodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { IBulkEditService } from '../../../../../../editor/browser/services/bulkEditService.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { EditorType } from '../../../../../../editor/common/editorCommon.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { CopyAction } from '../../../../../../editor/contrib/clipboard/browser/clipboard.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITextDiffEditorPane, IVisibleEditorPane } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { IAiEditTelemetryService, IEditTelemetryCodeAcceptedData } from '../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IActiveNotebookEditor, INotebookEditor } from '../../../../notebook/browser/notebookBrowser.js';
import { CellKind, NOTEBOOK_EDITOR_ID } from '../../../../notebook/common/notebookCommon.js';
import { withTestNotebook } from '../../../../notebook/test/browser/testNotebookEditor.js';
import { registerChatCodeBlockActions } from '../../../browser/actions/chatCodeblockActions.js';
import { InsertCodeBlockOperation } from '../../../browser/actions/codeBlockOperations.js';
import { IChatCodeBlockContextProviderService, IChatWidgetService } from '../../../browser/chat.js';
import { ICodeBlockActionContext } from '../../../browser/widget/chatContentParts/codeBlockPart.js';
import { IChatService, IChatUserActionEvent } from '../../../common/chatService/chatService.js';
import { IChatResponseModel } from '../../../common/model/chatModel.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatResponseViewModel, IChatViewModel } from '../../../common/model/chatViewModel.js';

suite('Chat code-block action telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let accepted: IEditTelemetryCodeAcceptedData[];
	let userActions: IChatUserActionEvent[];
	let clipboardWrites: string[];
	let selection: Selection;
	let context: ICodeBlockActionContext;
	let editor: IActiveCodeEditor;

	suiteSetup(() => registerChatCodeBlockActions());

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		accepted = [];
		userActions = [];
		clipboardWrites = [];
		selection = new Selection(1, 1, 1, 1);
		context = createContext(URI.parse('agent-host-copilotcli:/session#chat'));
		const model = store.add(createTextModel('const value = 1;'));
		editor = new class extends mock<IActiveCodeEditor>() {
			override getEditorType() { return EditorType.ICodeEditor; }
			override hasModel(): this is IActiveCodeEditor { return true; }
			override getModel() { return model; }
			override getSelection() { return selection; }
			override getSelections() { return [selection]; }
			override focus() { }
		};

		instantiationService.stub(IAiEditTelemetryService, {
			handleCodeAccepted: data => accepted.push(data),
		});
		instantiationService.stub(IChatService, {
			notifyUserAction: event => userActions.push(event),
		});
		instantiationService.stub(IClipboardService, {
			writeText: async text => { clipboardWrites.push(text); },
		});
		instantiationService.stub(ICodeEditorService, {
			getFocusedCodeEditor: () => editor,
			listCodeEditors: () => [editor],
		});
		instantiationService.stub(IChatWidgetService, { lastFocusedWidget: undefined });
		instantiationService.stub(IChatCodeBlockContextProviderService, {
			providers: [{ getCodeBlockContext: () => context }],
		});
		instantiationService.stub(IEditorService, {
			activeTextEditorControl: editor,
			visibleTextEditorControls: [],
			openEditor: async () => upcastPartial<ITextDiffEditorPane>({}),
		});
		instantiationService.stub(ITextFileService, {
			files: upcastPartial<ITextFileService['files']>({ get: () => undefined }),
			untitled: upcastPartial<ITextFileService['untitled']>({ get: () => undefined }),
		});
		instantiationService.stub(IBulkEditService, {
			apply: async () => ({ isApplied: true, ariaSummary: '' }),
		});
		instantiationService.stub(ILanguageService, {});
		instantiationService.stub(IDialogService, { info: async () => { } });
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, {});
	});

	function createContext(sessionResource: URI): ICodeBlockActionContext {
		return {
			code: 'const value = 1;',
			codeBlockIndex: 0,
			languageId: 'typescript',
			chatSessionResource: sessionResource,
			element: upcastPartial<IChatResponseViewModel>({
				sessionResource,
				requestId: 'request-origin',
				setVote: () => { },
				session: upcastPartial<IChatViewModel>({ getItems: () => [] }),
				model: upcastPartial<IChatResponseModel>({}),
			}),
		};
	}

	async function runCommand(id: string): Promise<void> {
		const command = CommandsRegistry.getCommand(id);
		assert.ok(command);
		await command.handler(instantiationService, context);
	}

	for (const [name, resource, sessionId, isAgentHostSession] of [
		['local', LocalChatSessionUri.forSession('local-session'), 'local-session', false],
		['Copilot', URI.parse('agent-host-copilotcli:/session#chat'), 'agent-host-copilotcli:/session#chat', true],
		['Claude', URI.parse('agent-host-claude:/session#chat'), 'agent-host-claude:/session#chat', true],
		['Codex', URI.parse('agent-host-codex:/session#chat'), 'agent-host-codex:/session#chat', true],
		['remote', URI.parse('remote-test-copilotcli:/session#chat'), 'remote-test-copilotcli:/session#chat', true],
	] as const) {
		test(`correlates all four code-block actions for ${name}`, async () => {
			context = createContext(resource);
			await runCommand('workbench.action.chat.copyCodeBlock');
			assert.ok(CopyAction);
			await CopyAction.runCommand(instantiationService, undefined);
			await runCommand('workbench.action.chat.insertIntoNewFile');
			await instantiationService.createInstance(InsertCodeBlockOperation).run(context);

			assert.deepStrictEqual(accepted.map(data => ({
				method: data.acceptanceMethod,
				requestId: data.sourceRequestId,
				sessionId: data.chatSessionId,
				isAgentHostSession: data.isAgentHostSession,
				feature: data.feature,
				presentation: data.presentation,
			})), ['copyButton', 'copyManual', 'insertInNewFile', 'insertAtCursor'].map(method => ({
				method,
				requestId: 'request-origin',
				sessionId,
				isAgentHostSession,
				feature: 'sideBarChat',
				presentation: 'codeBlock',
			})));
		});
	}

	test('preserves native selected-copy handling and correlates the action', async () => {
		assert.ok(CopyAction);
		selection = new Selection(1, 1, 1, 6);
		let nativeCopyCalled = false;
		store.add(CopyAction.addImplementation(49000, 'test-native-copy', () => {
			nativeCopyCalled = true;
			return true;
		}));
		await CopyAction.runCommand(instantiationService, undefined);

		assert.deepStrictEqual({
			nativeCopyCalled,
			clipboardWrites,
			copiedCharacters: accepted[0]?.editDeltaInfo?.charsAdded,
			requestId: accepted[0]?.sourceRequestId,
			sessionId: accepted[0]?.chatSessionId,
		}, {
			nativeCopyCalled: true,
			clipboardWrites: [],
			copiedCharacters: 5,
			requestId: 'request-origin',
			sessionId: 'agent-host-copilotcli:/session#chat',
		});
	});

	for (const method of ['toolbar', 'whole-block keyboard'] as const) {
		test(`does not report ${method} copy before the clipboard write completes`, async () => {
			const write = new DeferredPromise<void>();
			instantiationService.stub(IClipboardService, { writeText: () => write.p });
			assert.ok(CopyAction);
			const copying = method === 'toolbar'
				? runCommand('workbench.action.chat.copyCodeBlock')
				: CopyAction.runCommand(instantiationService, undefined);
			assert.deepStrictEqual({ accepted, userActions }, { accepted: [], userActions: [] });
			await write.complete();
			await copying;
			assert.strictEqual(accepted.length, 1);
		});

		test(`does not report a failed ${method} clipboard write`, async () => {
			instantiationService.stub(IClipboardService, { writeText: async () => { throw new Error('clipboard failure'); } });
			await assert.rejects(async () => {
				if (method === 'toolbar') {
					await runCommand('workbench.action.chat.copyCodeBlock');
				} else {
					assert.ok(CopyAction);
					await CopyAction.runCommand(instantiationService, undefined);
				}
			}, /clipboard failure/);
			assert.deepStrictEqual({ accepted, userActions }, { accepted: [], userActions: [] });
		});
	}

	test('does not report insertion without an editor', async () => {
		instantiationService.stub(IEditorService, { activeTextEditorControl: undefined, visibleTextEditorControls: [] });
		let notified = false;
		instantiationService.stub(IDialogService, { info: async () => { notified = true; } });
		await instantiationService.createInstance(InsertCodeBlockOperation).run(context);
		assert.deepStrictEqual({ accepted, userActions, notified }, { accepted: [], userActions: [], notified: true });
	});

	test('does not report insertion into a read-only text file', async () => {
		instantiationService.stub(ITextFileService, {
			files: upcastPartial<ITextFileService['files']>({
				get: () => upcastPartial<NonNullable<ReturnType<ITextFileService['files']['get']>>>({ isReadonly: () => true }),
			}),
		});
		let notified = false;
		instantiationService.stub(IDialogService, { info: async () => { notified = true; } });
		await instantiationService.createInstance(InsertCodeBlockOperation).run(context);
		assert.deepStrictEqual({ accepted, userActions, notified }, { accepted: [], userActions: [], notified: true });
	});

	test('does not report an unapplied bulk edit', async () => {
		instantiationService.stub(IBulkEditService, { apply: async () => ({ isApplied: false, ariaSummary: '' }) });
		await instantiationService.createInstance(InsertCodeBlockOperation).run(context);
		assert.deepStrictEqual({ accepted, userActions }, { accepted: [], userActions: [] });
	});

	for (const isReadOnly of [false, true]) {
		test(`reports notebook insertion only when the cell is created (read-only model: ${isReadOnly})`, async () => {
			await withTestNotebook([['before', 'typescript', CellKind.Code]], async (notebookEditor, viewModel, _disposables, accessor) => {
				viewModel.updateOptions({ isReadOnly });
				instantiationService.stub(IEditorService, {
					activeEditorPane: upcastPartial<IVisibleEditorPane>({
						getId: () => NOTEBOOK_EDITOR_ID,
						getControl: () => notebookEditor,
					}),
					visibleTextEditorControls: [],
				});
				instantiationService.stub(ILanguageService, accessor.get(ILanguageService));
				await instantiationService.createInstance(InsertCodeBlockOperation).run(context);
				assert.deepStrictEqual({
					cells: viewModel.viewCells.map(cell => cell.getText()),
					methods: accepted.map(data => data.acceptanceMethod),
					userActionCount: userActions.length,
				}, isReadOnly
					? { cells: ['before'], methods: [], userActionCount: 0 }
					: { cells: ['before', context.code], methods: ['insertAtCursor'], userActionCount: 1 });
			});
		});
	}

	test('does not report insertion into a read-only notebook', async () => {
		instantiationService.stub(IEditorService, {
			activeEditorPane: upcastPartial<IVisibleEditorPane>({
				getId: () => NOTEBOOK_EDITOR_ID,
				getControl: () => upcastPartial<INotebookEditor>({
					hasModel(): this is IActiveNotebookEditor { return true; },
					isReadOnly: true,
				}),
			}),
			visibleTextEditorControls: [],
		});
		let notified = false;
		instantiationService.stub(IDialogService, { info: async () => { notified = true; } });
		await instantiationService.createInstance(InsertCodeBlockOperation).run(context);
		assert.deepStrictEqual({ accepted, userActions, notified }, { accepted: [], userActions: [], notified: true });
	});

	test('propagates failed bulk edits without reporting acceptance', async () => {
		instantiationService.stub(IBulkEditService, { apply: async () => { throw new Error('edit failure'); } });
		await assert.rejects(() => instantiationService.createInstance(InsertCodeBlockOperation).run(context), /edit failure/);
		assert.deepStrictEqual({ accepted, userActions }, { accepted: [], userActions: [] });
	});

	test('does not report a cancelled new-file editor', async () => {
		instantiationService.stub(IEditorService, { openEditor: async () => undefined });
		await runCommand('workbench.action.chat.insertIntoNewFile');
		assert.deepStrictEqual({ accepted, userActions }, { accepted: [], userActions: [] });
	});

	test('propagates new-file failures without reporting acceptance', async () => {
		instantiationService.stub(IEditorService, { openEditor: async () => { throw new Error('open failure'); } });
		await assert.rejects(() => runCommand('workbench.action.chat.insertIntoNewFile'), /open failure/);
		assert.deepStrictEqual({ accepted, userActions }, { accepted: [], userActions: [] });
	});
});
