/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActiveCodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { IBulkEditService } from '../../../../../../editor/browser/services/bulkEditService.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { EditorType } from '../../../../../../editor/common/editorCommon.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../../editor/common/languages/modesRegistry.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { CopyAction } from '../../../../../../editor/contrib/clipboard/browser/clipboard.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IResourceEditorInput } from '../../../../../../platform/editor/common/editor.js';
import { IFileService, IFileStatWithMetadata } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ITextDiffEditorPane, IVisibleEditorPane } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { IUntitledTextEditorService } from '../../../../../services/untitled/common/untitledTextEditorService.js';
import { TestServiceAccessor, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IAiEditTelemetryService, IEditTelemetryCodeAcceptedData } from '../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IActiveNotebookEditor, INotebookEditor } from '../../../../notebook/browser/notebookBrowser.js';
import { CellKind, NOTEBOOK_EDITOR_ID } from '../../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { withTestNotebook } from '../../../../notebook/test/browser/testNotebookEditor.js';
import { registerChatCodeBlockActions } from '../../../browser/actions/chatCodeblockActions.js';
import { ApplyCodeBlockOperation, InsertCodeBlockOperation } from '../../../browser/actions/codeBlockOperations.js';
import { IChatCodeBlockContextProviderService, IChatWidgetService } from '../../../browser/chat.js';
import { ICodeBlockActionContext } from '../../../browser/widget/chatContentParts/codeBlockPart.js';
import { IChatService, IChatUserActionEvent } from '../../../common/chatService/chatService.js';
import { ChatModel, ChatRequestModel, ChatResponseModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { CodeMapperService, ICodeMapperService } from '../../../common/editing/chatCodeMapperService.js';
import { IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatResponseViewModel, IChatViewModel } from '../../../common/model/chatViewModel.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { MockChatSessionsService } from '../../common/mockChatSessionsService.js';

suite('Apply chat code blocks', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let untitled: IUntitledTextEditorService;
	let modelService: IModelService;
	let activeEditor: IActiveCodeEditor | undefined;
	let selectedTarget: string | undefined;
	let resourceExists: boolean;
	let pickerCalls: number;
	let mappedResources: URI[];
	let openedResources: URI[];
	let createdResources: URI[];
	let writtenResources: URI[];
	let notifications: string[];
	let context: ICodeBlockActionContext;

	function createEditor(model: ITextModel): IActiveCodeEditor {
		return new class extends mock<IActiveCodeEditor>() {
			override getEditorType() { return EditorType.ICodeEditor; }
			override hasModel(): this is IActiveCodeEditor { return true; }
			override getModel() { return model; }
			override revealRangeInCenter() { }
		};
	}

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, store);
		untitled = instantiationService.get(IUntitledTextEditorService);
		modelService = instantiationService.get(IModelService);
		const languageService = instantiationService.get(ILanguageService);
		store.add(languageService.registerLanguage({ id: 'json', aliases: ['JSON'], extensions: ['.json'] }));
		store.add(languageService.registerLanguage({ id: 'jsonc', filenames: ['launch.json'] }));
		activeEditor = undefined;
		selectedTarget = 'newUntitledFile';
		resourceExists = false;
		pickerCalls = 0;
		mappedResources = [];
		openedResources = [];
		createdResources = [];
		writtenResources = [];
		notifications = [];
		context = {
			code: ['{', '\t"version": "0.2.0"', '}'].join(isWindows ? '\r\n' : '\n'),
			codeBlockIndex: 0,
			languageId: 'json',
			element: undefined,
			chatSessionResource: LocalChatSessionUri.forSession('apply-code-block'),
		};
		store.add(untitled.onDidCreate(model => createdResources.push(model.resource)));
		instantiationService.stub(IEditorService, {
			get activeTextEditorControl() { return activeEditor; },
			visibleTextEditorControls: [],
		});
		instantiationService.stub(IEditorService, 'openEditor', async (input: IResourceEditorInput) => {
			const model = input.resource.scheme === Schemas.untitled
				? (await untitled.resolve({ untitledResource: input.resource })).textEditorModel!
				: modelService.getModel(input.resource) ?? store.add(modelService.createModel('', null, input.resource));
			activeEditor = createEditor(model);
			openedResources.push(model.uri);
			return upcastPartial<IVisibleEditorPane>({ getControl: () => activeEditor });
		});
		instantiationService.stub(IQuickInputService, {
			pick: async picks => {
				pickerCalls++;
				return (await picks).find(pick => pick.id === selectedTarget);
			},
		});
		instantiationService.stub(IFileService, {
			exists: async () => resourceExists,
			writeFile: async resource => {
				writtenResources.push(resource);
				return upcastPartial<IFileStatWithMetadata>({ resource });
			},
		});
		instantiationService.stub(INotebookService, { hasSupportedNotebooks: () => false });
		instantiationService.stub(IDialogService, { info: async message => { notifications.push(message); } });
		const codeMapper = instantiationService.stub(ICodeMapperService, new CodeMapperService());
		store.add(codeMapper.registerCodeMapperProvider(0, {
			displayName: 'Test mapper',
			mapCode: async (request, response) => {
				for (const block of request.codeBlocks) {
					mappedResources.push(block.resource);
					response.textEdit(block.resource, [{ range: modelService.getModel(block.resource)!.getFullModelRange(), text: block.code }]);
				}
				return undefined;
			},
		}));
		const chatModel = upcastPartial<ChatModel>({
			startEditingSession: () => { },
			editingSession: upcastPartial<IChatEditingSession>({
				readEntry: () => upcastPartial<IModifiedFileEntry>({ state: constObservable(ModifiedFileEntryState.Accepted) }),
			}),
			addRequest: () => upcastPartial<ChatRequestModel>({
				response: upcastPartial<ChatResponseModel>({
					updateContent: progress => {
						if (progress.kind === 'textEdit') {
							modelService.getModel(progress.uri)!.applyEdits(progress.edits);
						}
					},
					complete: () => { },
				}),
			}),
		});
		instantiationService.stub(IChatService, {
			startNewLocalSession: () => ({ object: chatModel, dispose: () => { } }),
		});
	});

	for (const existingCount of [1, 3]) {
		for (const inferredResource of [undefined, URI.file('/workspace/launch.json')]) {
			test(`allocates a fresh untitled buffer on repeated applies with ${existingCount} dirty buffers and ${inferredResource ? 'an inferred resource' : 'no resource'}`, async () => {
				const originals = [];
				for (let i = 0; i < existingCount; i++) {
					originals.push(await untitled.resolve({ initialValue: `original ${i}\nkeep this content` }));
				}
				if (inferredResource) {
					originals.push(await untitled.resolve({ associatedResource: inferredResource, initialValue: 'existing inferred-path buffer' }));
				}
				const originalValues = originals.map(model => model.textEditorModel!.getValue());
				activeEditor = createEditor(originals[existingCount - 1].textEditorModel!);
				context = { ...context, codemapperUri: inferredResource };
				const operation = instantiationService.createInstance(ApplyCodeBlockOperation);

				await operation.run(context);
				await operation.run(context);

				assert.deepStrictEqual({
					originalValues: originals.map(model => model.textEditorModel!.getValue()),
					targetValues: mappedResources.map(resource => untitled.getValue(resource)),
					targetLanguages: mappedResources.map(resource => untitled.get(resource)?.getLanguageId()),
					uniqueResources: new Set([...originals.map(model => model.resource.toString()), ...mappedResources.map(resource => resource.toString())]).size,
					createdCount: createdResources.length,
					writtenResources,
					notifications,
				}, {
					originalValues,
					targetValues: [context.code, context.code],
					targetLanguages: inferredResource ? ['jsonc', 'jsonc'] : ['json', 'json'],
					uniqueResources: originals.length + 2,
					createdCount: originals.length + 2,
					writtenResources: [],
					notifications: [],
				});
			});
		}
	}

	test('allocates an untitled buffer without prompting when there is no editor or resource', async () => {
		await instantiationService.createInstance(ApplyCodeBlockOperation).run(context);

		assert.deepStrictEqual({
			pickerCalls,
			value: untitled.getValue(mappedResources[0]),
			language: untitled.get(mappedResources[0])?.getLanguageId(),
			createdCount: createdResources.length,
			notifications,
		}, { pickerCalls: 0, value: context.code, language: 'json', createdCount: 1, notifications: [] });
	});

	for (const languageId of [undefined, '', PLAINTEXT_LANGUAGE_ID]) {
		test(`preserves the inferred resource language when the code block language is ${JSON.stringify(languageId)}`, async () => {
			context = { ...context, codemapperUri: URI.file('/workspace/launch.json'), languageId };

			await instantiationService.createInstance(ApplyCodeBlockOperation).run(context);

			assert.deepStrictEqual({
				value: untitled.getValue(mappedResources[0]),
				language: untitled.get(mappedResources[0])?.getLanguageId(),
				createdCount: createdResources.length,
				notifications,
			}, { value: context.code, language: 'jsonc', createdCount: 1, notifications: [] });
		});
	}

	for (const resource of [undefined, URI.file('/workspace/notes.txt'), URI.file('/workspace/code.unknown')]) {
		test(`uses the default language for an untagged code block unless its resource has a known language (${resource?.path ?? 'no resource'})`, async () => {
			await instantiationService.createInstance(TestServiceAccessor).testConfigurationService.setUserConfiguration('files', { defaultLanguage: 'json' });
			context = { ...context, codemapperUri: resource, languageId: PLAINTEXT_LANGUAGE_ID };

			await instantiationService.createInstance(ApplyCodeBlockOperation).run(context);

			assert.deepStrictEqual({
				value: untitled.getValue(mappedResources[0]),
				language: untitled.get(mappedResources[0])?.getLanguageId(),
				notifications,
			}, { value: context.code, language: resource?.path.endsWith('.txt') ? PLAINTEXT_LANGUAGE_ID : 'json', notifications: [] });
		});
	}

	test('resolves a code block language alias when the resource language is unknown', async () => {
		context = { ...context, codemapperUri: URI.file('/workspace/code.unknown'), languageId: 'JSON' };

		await instantiationService.createInstance(ApplyCodeBlockOperation).run(context);

		assert.deepStrictEqual({
			value: untitled.getValue(mappedResources[0]),
			language: untitled.get(mappedResources[0])?.getLanguageId(),
			createdCount: createdResources.length,
			notifications,
		}, { value: context.code, language: 'json', createdCount: 1, notifications: [] });
	});

	test('cancelling target selection does not create an editor or apply edits', async () => {
		const original = await untitled.resolve({ initialValue: 'keep this content' });
		activeEditor = createEditor(original.textEditorModel!);
		selectedTarget = undefined;

		await instantiationService.createInstance(ApplyCodeBlockOperation).run(context);

		assert.deepStrictEqual({
			value: original.textEditorModel!.getValue(),
			createdCount: createdResources.length,
			openedResources,
			mappedResources,
			writtenResources,
			notifications,
		}, { value: 'keep this content', createdCount: 1, openedResources: [], mappedResources: [], writtenResources: [], notifications: [] });
	});

	for (const target of ['activeEditor', 'createFile', 'existingFile']) {
		test(`preserves the ${target} target and its language`, async () => {
			const original = await untitled.resolve({ initialValue: 'keep this content' });
			activeEditor = createEditor(original.textEditorModel!);
			const resource = URI.file('/workspace/target.txt');
			context = { ...context, codemapperUri: resource };
			selectedTarget = target;
			resourceExists = target === 'existingFile';

			await instantiationService.createInstance(ApplyCodeBlockOperation).run(context);

			const expectedResource = target === 'activeEditor' ? original.resource : resource;
			assert.deepStrictEqual({
				targets: mappedResources.map(resource => resource.toString()),
				value: modelService.getModel(expectedResource)?.getValue(),
				language: modelService.getModel(expectedResource)?.getLanguageId(),
				originalValue: original.textEditorModel!.getValue(),
				pickerCalls,
				createdCount: createdResources.length,
				writtenResources: writtenResources.map(resource => resource.toString()),
				notifications,
			}, {
				targets: [expectedResource.toString()],
				value: context.code,
				language: 'plaintext',
				originalValue: target === 'activeEditor' ? context.code : 'keep this content',
				pickerCalls: target === 'existingFile' ? 0 : 1,
				createdCount: 1,
				writtenResources: target === 'createFile' ? [resource.toString()] : [],
				notifications: [],
			});
		});
	}
});

suite('Chat code-block action telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let accepted: IEditTelemetryCodeAcceptedData[];
	let userActions: IChatUserActionEvent[];
	let clipboardWrites: string[];
	let selection: Selection;
	let context: ICodeBlockActionContext;
	let editor: IActiveCodeEditor;

	let codeBlockActions: IDisposable;
	suiteSetup(() => codeBlockActions = registerChatCodeBlockActions());
	suiteTeardown(() => codeBlockActions.dispose());

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		const chatSessionsService = new MockChatSessionsService();
		chatSessionsService.setContributions([
			['agent-host-copilotcli', 'copilotcli'],
			['agent-host-claude', 'claude'],
			['agent-host-codex', 'codex'],
			['remote-test-copilotcli', 'copilotcli'],
			['remote-private-machine-codex-openai', 'codex-openai'],
			['custom-agent-session', 'custom-provider'],
		].map(([type, agentHostProviderId]) => ({ type, agentHostProviderId, name: type, displayName: type, description: '' })));
		instantiationService.stub(IChatSessionsService, chatSessionsService);
		instantiationService.stub(IAgentHostConnectionsService, {
			resolveSessionResourceIdentity: () => ({ connectionAuthority: 'private-host', backendSession: URI.parse('copilotcli:/backend-session') }),
		});
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

	for (const [name, resource, sessionId, isAgentHostSession, provider] of [
		['local', LocalChatSessionUri.forSession('local-session'), 'local-session', false, undefined],
		['Copilot', URI.parse('agent-host-copilotcli:/session#chat'), 'agent-host-copilotcli:/session#chat', true, 'copilotcli'],
		['Claude', URI.parse('agent-host-claude:/session#chat'), 'agent-host-claude:/session#chat', true, 'claude'],
		['Codex', URI.parse('agent-host-codex:/session#chat'), 'agent-host-codex:/session#chat', true, 'codex'],
		['remote', URI.parse('remote-test-copilotcli:/session#chat'), 'session#chat', true, 'copilotcli'],
		['hyphenated remote provider', URI.parse('remote-private-machine-codex-openai:/session#chat'), 'session#chat', true, 'codex-openai'],
		['custom contribution', URI.parse('custom-agent-session:/session#chat'), 'custom-agent-session:/session#chat', false, 'custom-provider'],
		['missing contribution', URI.parse('agent-host-unregistered:/session#chat'), 'agent-host-unregistered:/session#chat', true, 'unknown'],
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
				agentSessionId: data.agentSessionId,
				isAgentHostSession: data.isAgentHostSession,
				provider: data.provider,
				feature: data.feature,
				presentation: data.presentation,
			})), ['copyButton', 'copyManual', 'insertInNewFile', 'insertAtCursor'].map(method => ({
				method,
				requestId: 'request-origin',
				sessionId,
				agentSessionId: isAgentHostSession ? 'backend-session' : undefined,
				isAgentHostSession,
				provider,
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
