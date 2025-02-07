/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { equals } from '../../../../../base/common/arrays.js';
import { DeferredPromise, raceCancellation, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IActiveCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { EndOfLineSequence, ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { instantiateTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IEditorProgressService, IProgressRunner } from '../../../../../platform/progress/common/progress.js';
import { IView, IViewDescriptorService } from '../../../../common/views.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IChatAccessibilityService, IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { ChatAgentLocation, ChatAgentService, IChatAgentData, IChatAgentNameService, IChatAgentService } from '../../../chat/common/chatAgents.js';
import { IChatResponseViewModel } from '../../../chat/common/chatViewModel.js';
import { InlineChatController, State } from '../../browser/inlineChatController.js';
import { CTX_INLINE_CHAT_RESPONSE_TYPE, InlineChatConfigKeys, InlineChatResponseType } from '../../common/inlineChat.js';
import { TestViewsService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { IChatProgress, IChatService } from '../../../chat/common/chatService.js';
import { ChatService } from '../../../chat/common/chatServiceImpl.js';
import { IChatVariablesService } from '../../../chat/common/chatVariables.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestContextService, TestExtensionService } from '../../../../test/common/workbenchTestServices.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatSlashCommandService, IChatSlashCommandService } from '../../../chat/common/chatSlashCommands.js';
import { ChatWidgetService } from '../../../chat/browser/chatWidget.js';
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from '../../../chat/common/chatWidgetHistoryService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { ChatVariablesService } from '../../../chat/browser/chatVariables.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestCommandService } from '../../../../../editor/test/browser/editorTestServices.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { RerunAction } from '../../browser/inlineChatActions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { assertType } from '../../../../../base/common/types.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { IInlineChatSessionService } from '../../browser/inlineChatSessionService.js';
import { InlineChatSessionServiceImpl } from '../../browser/inlineChatSessionServiceImpl.js';
import { TestWorkerService } from './testWorkerService.js';
import { ILanguageModelsService, LanguageModelsService } from '../../../chat/common/languageModels.js';
import { IChatEditingService, IChatEditingSession } from '../../../chat/common/chatEditingService.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { TextModelResolverService } from '../../../../services/textmodelResolver/common/textModelResolverService.js';
import { ChatInputBoxContentProvider } from '../../../chat/browser/chatEdinputInputContentProvider.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { ILanguageModelToolsService } from '../../../chat/common/languageModelToolsService.js';
import { MockLanguageModelToolsService } from '../../../chat/test/common/mockLanguageModelToolsService.js';

suite('InlineChatController', function () {

	const agentData = {
		extensionId: nullExtensionDescription.identifier,
		publisherDisplayName: '',
		extensionDisplayName: '',
		extensionPublisherId: '',
		// id: 'testEditorAgent',
		name: 'testEditorAgent',
		isDefault: true,
		locations: [ChatAgentLocation.Editor],
		metadata: {},
		slashCommands: [],
		disambiguation: [],
	};

	class TestController extends InlineChatController {

		static INIT_SEQUENCE: readonly State[] = [State.CREATE_SESSION, State.INIT_UI, State.WAIT_FOR_INPUT];
		static INIT_SEQUENCE_AUTO_SEND: readonly State[] = [...this.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT];


		readonly onDidChangeState: Event<State> = this._onDidEnterState.event;

		readonly states: readonly State[] = [];

		awaitStates(states: readonly State[]): Promise<string | undefined> {
			const actual: State[] = [];

			return new Promise<string | undefined>((resolve, reject) => {
				const d = this.onDidChangeState(state => {
					actual.push(state);
					if (equals(states, actual)) {
						d.dispose();
						resolve(undefined);
					}
				});

				setTimeout(() => {
					d.dispose();
					resolve(`[${states.join(',')}] <> [${actual.join(',')}]`);
				}, 1000);
			});
		}
	}

	const store = new DisposableStore();
	let configurationService: TestConfigurationService;
	let editor: IActiveCodeEditor;
	let model: ITextModel;
	let ctrl: TestController;
	let contextKeyService: MockContextKeyService;
	let chatService: IChatService;
	let chatAgentService: IChatAgentService;
	let inlineChatSessionService: IInlineChatSessionService;
	let instaService: TestInstantiationService;

	let chatWidget: IChatWidget;

	setup(function () {

		const serviceCollection = new ServiceCollection(
			[IConfigurationService, new TestConfigurationService()],
			[IChatVariablesService, new SyncDescriptor(ChatVariablesService)],
			[ILogService, new NullLogService()],
			[ITelemetryService, NullTelemetryService],
			[IHoverService, NullHoverService],
			[IExtensionService, new TestExtensionService()],
			[IContextKeyService, new MockContextKeyService()],
			[IViewsService, new class extends TestViewsService {
				override async openView<T extends IView>(id: string, focus?: boolean | undefined): Promise<T | null> {
					return { widget: chatWidget ?? null } as any;
				}
			}()],
			[IWorkspaceContextService, new TestContextService()],
			[IChatWidgetHistoryService, new SyncDescriptor(ChatWidgetHistoryService)],
			[IChatWidgetService, new SyncDescriptor(ChatWidgetService)],
			[IChatSlashCommandService, new SyncDescriptor(ChatSlashCommandService)],
			[IChatService, new SyncDescriptor(ChatService)],
			[IChatAgentNameService, new class extends mock<IChatAgentNameService>() {
				override getAgentNameRestriction(chatAgentData: IChatAgentData): boolean {
					return false;
				}
			}],
			[IEditorWorkerService, new SyncDescriptor(TestWorkerService)],
			[IContextKeyService, contextKeyService],
			[IChatAgentService, new SyncDescriptor(ChatAgentService)],
			[IDiffProviderFactoryService, new SyncDescriptor(TestDiffProviderFactoryService)],
			[IInlineChatSessionService, new SyncDescriptor(InlineChatSessionServiceImpl)],
			[ICommandService, new SyncDescriptor(TestCommandService)],
			[IChatEditingService, new class extends mock<IChatEditingService>() {
				override editingSessionsObs: IObservable<readonly IChatEditingSession[]> = constObservable([]);
			}],
			[IEditorProgressService, new class extends mock<IEditorProgressService>() {
				override show(total: unknown, delay?: unknown): IProgressRunner {
					return {
						total() { },
						worked(value) { },
						done() { },
					};
				}
			}],
			[IChatAccessibilityService, new class extends mock<IChatAccessibilityService>() {
				override acceptResponse(response: IChatResponseViewModel | undefined, requestId: number): void { }
				override acceptRequest(): number { return -1; }
			}],
			[IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
				override getOpenAriaHint(verbositySettingKey: AccessibilityVerbositySettingId): string | null {
					return null;
				}
			}],
			[IConfigurationService, configurationService],
			[IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
				override onDidChangeLocation = Event.None;
			}],
			[INotebookEditorService, new class extends mock<INotebookEditorService>() {
				override listNotebookEditors() { return []; }
			}],
			[IWorkbenchAssignmentService, new NullWorkbenchAssignmentService()],
			[ILanguageModelsService, new SyncDescriptor(LanguageModelsService)],
			[ITextModelService, new SyncDescriptor(TextModelResolverService)],
			[ILanguageModelToolsService, new SyncDescriptor(MockLanguageModelToolsService)],
		);

		instaService = store.add((store.add(workbenchInstantiationService(undefined, store))).createChild(serviceCollection));

		configurationService = instaService.get(IConfigurationService) as TestConfigurationService;
		configurationService.setUserConfiguration('chat', { editor: { fontSize: 14, fontFamily: 'default' } });

		configurationService.setUserConfiguration('editor', {});

		contextKeyService = instaService.get(IContextKeyService) as MockContextKeyService;
		chatService = instaService.get(IChatService);
		chatAgentService = instaService.get(IChatAgentService);

		inlineChatSessionService = store.add(instaService.get(IInlineChatSessionService));

		store.add(instaService.get(ILanguageModelsService) as LanguageModelsService);

		store.add(instaService.createInstance(ChatInputBoxContentProvider));

		model = store.add(instaService.get(IModelService).createModel('Hello\nWorld\nHello Again\nHello World\n', null));
		model.setEOL(EndOfLineSequence.LF);
		editor = store.add(instantiateTestCodeEditor(instaService, model));

		store.add(chatAgentService.registerDynamicAgent({ id: 'testEditorAgent', ...agentData, }, {
			async invoke(request, progress, history, token) {
				progress({
					kind: 'textEdit',
					uri: model.uri,
					edits: [{
						range: new Range(1, 1, 1, 1),
						text: request.message
					}]
				});
				return {};
			},
		}));

	});

	teardown(function () {
		store.clear();
		ctrl?.dispose();
	});

	// TODO@jrieken re-enable, looks like List/ChatWidget is leaking
	// ensureNoDisposablesAreLeakedInTestSuite();

	test('creation, not showing anything', function () {
		ctrl = instaService.createInstance(TestController, editor);
		assert.ok(ctrl);
		assert.strictEqual(ctrl.getWidgetPosition(), undefined);
	});

	test('run (show/hide)', async function () {
		ctrl = instaService.createInstance(TestController, editor);
		const actualStates = ctrl.awaitStates(TestController.INIT_SEQUENCE_AUTO_SEND);
		const run = ctrl.run({ message: 'Hello', autoSend: true });
		assert.strictEqual(await actualStates, undefined);
		assert.ok(ctrl.getWidgetPosition() !== undefined);
		await ctrl.cancelSession();

		await run;

		assert.ok(ctrl.getWidgetPosition() === undefined);
	});

	test('wholeRange does not expand to whole lines, editor selection default', async function () {

		editor.setSelection(new Range(1, 1, 1, 3));
		ctrl = instaService.createInstance(TestController, editor);

		ctrl.run({});
		await Event.toPromise(Event.filter(ctrl.onDidChangeState, e => e === State.WAIT_FOR_INPUT));

		const session = inlineChatSessionService.getSession(editor, editor.getModel()!.uri);
		assert.ok(session);
		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 1, 3));

		await ctrl.cancelSession();
	});

	test('typing outside of wholeRange finishes session', async function () {

		configurationService.setUserConfiguration(InlineChatConfigKeys.FinishOnType, true);

		ctrl = instaService.createInstance(TestController, editor);
		const actualStates = ctrl.awaitStates(TestController.INIT_SEQUENCE_AUTO_SEND);
		const r = ctrl.run({ message: 'Hello', autoSend: true });

		assert.strictEqual(await actualStates, undefined);

		const session = inlineChatSessionService.getSession(editor, editor.getModel()!.uri);
		assert.ok(session);
		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 1, 11 /* line length */));

		editor.setSelection(new Range(2, 1, 2, 1));
		editor.trigger('test', 'type', { text: 'a' });

		assert.strictEqual(await ctrl.awaitStates([State.ACCEPT]), undefined);
		await r;
	});

	test('\'whole range\' isn\'t updated for edits outside whole range #4346', async function () {

		editor.setSelection(new Range(3, 1, 3, 3));

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {
				progress({
					kind: 'textEdit',
					uri: editor.getModel().uri,
					edits: [{
						range: new Range(1, 1, 1, 1), // EDIT happens outside of whole range
						text: `${request.message}\n${request.message}`
					}]
				});

				return {};
			},
		}));

		ctrl = instaService.createInstance(TestController, editor);
		const p = ctrl.awaitStates(TestController.INIT_SEQUENCE);
		const r = ctrl.run({ message: 'GENGEN', autoSend: false });

		assert.strictEqual(await p, undefined);


		const session = inlineChatSessionService.getSession(editor, editor.getModel()!.uri);
		assert.ok(session);
		assert.deepStrictEqual(session.wholeRange.value, new Range(3, 1, 3, 3)); // initial

		ctrl.chatWidget.setInput('GENGEN');
		ctrl.chatWidget.acceptInput();
		assert.strictEqual(await ctrl.awaitStates([State.SHOW_REQUEST, State.WAIT_FOR_INPUT]), undefined);

		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 4, 3));

		await ctrl.cancelSession();
		await r;
	});

	test('Stuck inline chat widget #211', async function () {

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {
				return new Promise<never>(() => { });
			},
		}));

		ctrl = instaService.createInstance(TestController, editor);
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST]);
		const r = ctrl.run({ message: 'Hello', autoSend: true });

		assert.strictEqual(await p, undefined);

		ctrl.acceptSession();

		await r;
		assert.strictEqual(ctrl.getWidgetPosition(), undefined);
	});

	test('[Bug] Inline Chat\'s streaming pushed broken iterations to the undo stack #2403', async function () {

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {

				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: 'hEllo1\n' }] });
				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(2, 1, 2, 1), text: 'hEllo2\n' }] });
				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1000, 1), text: 'Hello1\nHello2\n' }] });

				return {};
			},
		}));

		const valueThen = editor.getModel().getValue();

		ctrl = instaService.createInstance(TestController, editor);
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		const r = ctrl.run({ message: 'Hello', autoSend: true });
		assert.strictEqual(await p, undefined);
		ctrl.acceptSession();
		await r;

		assert.strictEqual(editor.getModel().getValue(), 'Hello1\nHello2\n');

		editor.getModel().undo();
		assert.strictEqual(editor.getModel().getValue(), valueThen);
	});



	test.skip('UI is streaming edits minutes after the response is finished #3345', async function () {


		return runWithFakedTimers({ maxTaskCount: Number.MAX_SAFE_INTEGER }, async () => {

			store.add(chatAgentService.registerDynamicAgent({
				id: 'testEditorAgent2',
				...agentData
			}, {
				async invoke(request, progress, history, token) {

					const text = '${CSI}#a\n${CSI}#b\n${CSI}#c\n';

					await timeout(10);
					progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: text }] });

					await timeout(10);
					progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: text.repeat(1000) + 'DONE' }] });

					throw new Error('Too long');
				},
			}));


			// let modelChangeCounter = 0;
			// store.add(editor.getModel().onDidChangeContent(() => { modelChangeCounter++; }));

			ctrl = instaService.createInstance(TestController, editor);
			const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
			const r = ctrl.run({ message: 'Hello', autoSend: true });
			assert.strictEqual(await p, undefined);

			// assert.ok(modelChangeCounter > 0, modelChangeCounter.toString()); // some changes have been made
			// const modelChangeCounterNow = modelChangeCounter;

			assert.ok(!editor.getModel().getValue().includes('DONE'));
			await timeout(10);

			// assert.strictEqual(modelChangeCounterNow, modelChangeCounter);
			assert.ok(!editor.getModel().getValue().includes('DONE'));

			await ctrl.cancelSession();
			await r;
		});
	});

	test('escape doesn\'t remove code added from inline editor chat #3523 1/2', async function () {


		// NO manual edits -> cancel
		ctrl = instaService.createInstance(TestController, editor);
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		const r = ctrl.run({ message: 'GENERATED', autoSend: true });
		assert.strictEqual(await p, undefined);

		assert.ok(model.getValue().includes('GENERATED'));
		ctrl.cancelSession();
		await r;
		assert.ok(!model.getValue().includes('GENERATED'));

	});

	test('escape doesn\'t remove code added from inline editor chat #3523, 2/2', async function () {

		// manual edits -> finish
		ctrl = instaService.createInstance(TestController, editor);
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		const r = ctrl.run({ message: 'GENERATED', autoSend: true });
		assert.strictEqual(await p, undefined);

		assert.ok(model.getValue().includes('GENERATED'));

		editor.executeEdits('test', [EditOperation.insert(model.getFullModelRange().getEndPosition(), 'MANUAL')]);

		ctrl.acceptSession();
		await r;
		assert.ok(model.getValue().includes('GENERATED'));
		assert.ok(model.getValue().includes('MANUAL'));

	});

	test('re-run should discard pending edits', async function () {

		let count = 1;

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {
				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: request.message + (count++) }] });
				return {};
			},
		}));

		ctrl = instaService.createInstance(TestController, editor);
		const rerun = new RerunAction();

		model.setValue('');

		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		const r = ctrl.run({ message: 'PROMPT_', autoSend: true });
		assert.strictEqual(await p, undefined);


		assert.strictEqual(model.getValue(), 'PROMPT_1');

		const p2 = ctrl.awaitStates([State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		await instaService.invokeFunction(rerun.runInlineChatCommand, ctrl, editor);

		assert.strictEqual(await p2, undefined);

		assert.strictEqual(model.getValue(), 'PROMPT_2');
		ctrl.acceptSession();
		await r;
	});

	test('Retry undoes all changes, not just those from the request#5736', async function () {

		const text = [
			'eins-',
			'zwei-',
			'drei-'
		];

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {
				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: text.shift() ?? '' }] });
				return {};
			},
		}));

		ctrl = instaService.createInstance(TestController, editor);
		const rerun = new RerunAction();

		model.setValue('');

		// REQUEST 1
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		const r = ctrl.run({ message: '1', autoSend: true });
		assert.strictEqual(await p, undefined);

		assert.strictEqual(model.getValue(), 'eins-');

		// REQUEST 2
		const p2 = ctrl.awaitStates([State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		ctrl.chatWidget.setInput('1');
		await ctrl.chatWidget.acceptInput();
		assert.strictEqual(await p2, undefined);

		assert.strictEqual(model.getValue(), 'zwei-eins-');

		// REQUEST 2 - RERUN
		const p3 = ctrl.awaitStates([State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		await instaService.invokeFunction(rerun.runInlineChatCommand, ctrl, editor);
		assert.strictEqual(await p3, undefined);

		assert.strictEqual(model.getValue(), 'drei-eins-');

		ctrl.acceptSession();
		await r;

	});

	test('moving inline chat to another model undoes changes', async function () {
		const text = [
			'eins\n',
			'zwei\n'
		];

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {
				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: text.shift() ?? '' }] });
				return {};
			},
		}));
		ctrl = instaService.createInstance(TestController, editor);

		// REQUEST 1
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		ctrl.run({ message: '1', autoSend: true });
		assert.strictEqual(await p, undefined);

		assert.strictEqual(model.getValue(), 'eins\nHello\nWorld\nHello Again\nHello World\n');

		const targetModel = chatService.startSession(ChatAgentLocation.Editor, CancellationToken.None)!;
		store.add(targetModel);
		chatWidget = new class extends mock<IChatWidget>() {
			override get viewModel() {
				return { model: targetModel } as any;
			}
			override focusLastMessage() { }
		};

		const r = ctrl.joinCurrentRun();
		await ctrl.viewInChat();

		assert.strictEqual(model.getValue(), 'Hello\nWorld\nHello Again\nHello World\n');
		await r;
	});

	test('moving inline chat to another model undoes changes (2 requests)', async function () {
		const text = [
			'eins\n',
			'zwei\n'
		];

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {
				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: text.shift() ?? '' }] });
				return {};
			},
		}));
		ctrl = instaService.createInstance(TestController, editor);

		// REQUEST 1
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		ctrl.run({ message: '1', autoSend: true });
		assert.strictEqual(await p, undefined);

		assert.strictEqual(model.getValue(), 'eins\nHello\nWorld\nHello Again\nHello World\n');

		// REQUEST 2
		const p2 = ctrl.awaitStates([State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		ctrl.chatWidget.setInput('1');
		await ctrl.chatWidget.acceptInput();
		assert.strictEqual(await p2, undefined);

		assert.strictEqual(model.getValue(), 'zwei\neins\nHello\nWorld\nHello Again\nHello World\n');

		const targetModel = chatService.startSession(ChatAgentLocation.Editor, CancellationToken.None)!;
		store.add(targetModel);
		chatWidget = new class extends mock<IChatWidget>() {
			override get viewModel() {
				return { model: targetModel } as any;
			}
			override focusLastMessage() { }
		};

		const r = ctrl.joinCurrentRun();

		await ctrl.viewInChat();

		assert.strictEqual(model.getValue(), 'Hello\nWorld\nHello Again\nHello World\n');

		await r;
	});

	test('Clicking "re-run without /doc" while a request is in progress closes the widget #5997', async function () {

		model.setValue('');

		let count = 0;
		const commandDetection: (boolean | undefined)[] = [];

		const onDidInvoke = new Emitter<void>();

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {
				queueMicrotask(() => onDidInvoke.fire());
				commandDetection.push(request.enableCommandDetection);
				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: request.message + (count++) }] });

				if (count === 1) {
					// FIRST call waits for cancellation
					await raceCancellation(new Promise<never>(() => { }), token);
				} else {
					await timeout(10);
				}

				return {};
			},
		}));
		ctrl = instaService.createInstance(TestController, editor);

		// REQUEST 1
		// const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST]);
		const p = Event.toPromise(onDidInvoke.event);
		ctrl.run({ message: 'Hello-', autoSend: true });

		await p;

		// assert.strictEqual(await p, undefined);

		// resend pending request without command detection
		const request = ctrl.chatWidget.viewModel?.model.getRequests().at(-1);
		assertType(request);
		const p2 = Event.toPromise(onDidInvoke.event);
		const p3 = ctrl.awaitStates([State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		chatService.resendRequest(request, { noCommandDetection: true, attempt: request.attempt + 1, location: ChatAgentLocation.Editor });

		await p2;
		assert.strictEqual(await p3, undefined);

		assert.deepStrictEqual(commandDetection, [true, false]);
		assert.strictEqual(model.getValue(), 'Hello-1');
	});

	test('Re-run without after request is done', async function () {

		model.setValue('');

		let count = 0;
		const commandDetection: (boolean | undefined)[] = [];

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {
				commandDetection.push(request.enableCommandDetection);
				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: request.message + (count++) }] });
				return {};
			},
		}));
		ctrl = instaService.createInstance(TestController, editor);

		// REQUEST 1
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		ctrl.run({ message: 'Hello-', autoSend: true });
		assert.strictEqual(await p, undefined);

		// resend pending request without command detection
		const request = ctrl.chatWidget.viewModel?.model.getRequests().at(-1);
		assertType(request);
		const p2 = ctrl.awaitStates([State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		chatService.resendRequest(request, { noCommandDetection: true, attempt: request.attempt + 1, location: ChatAgentLocation.Editor });

		assert.strictEqual(await p2, undefined);

		assert.deepStrictEqual(commandDetection, [true, false]);
		assert.strictEqual(model.getValue(), 'Hello-1');
	});


	test('Inline: Pressing Rerun request while the response streams breaks the response #5442', async function () {

		model.setValue('two\none\n');

		const attempts: (number | undefined)[] = [];

		const deferred = new DeferredPromise<void>();

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {

				attempts.push(request.attempt);

				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: `TRY:${request.attempt}\n` }] });
				await raceCancellation(deferred.p, token);
				deferred.complete();
				await timeout(10);
				return {};
			},
		}));

		ctrl = instaService.createInstance(TestController, editor);

		// REQUEST 1
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST]);
		ctrl.run({ message: 'Hello-', autoSend: true });
		assert.strictEqual(await p, undefined);
		await timeout(10);
		assert.deepStrictEqual(attempts, [0]);

		// RERUN (cancel, undo, redo)
		const p2 = ctrl.awaitStates([State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		const rerun = new RerunAction();
		await instaService.invokeFunction(rerun.runInlineChatCommand, ctrl, editor);
		assert.strictEqual(await p2, undefined);

		assert.deepStrictEqual(attempts, [0, 1]);

		assert.strictEqual(model.getValue(), 'TRY:1\ntwo\none\n');

	});

	test('Stopping/cancelling a request should NOT undo its changes', async function () {

		model.setValue('World');

		const deferred = new DeferredPromise<void>();
		let progress: ((part: IChatProgress) => void) | undefined;

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, _progress, history, token) {

				progress = _progress;
				await deferred.p;
				return {};
			},
		}));

		ctrl = instaService.createInstance(TestController, editor);

		// REQUEST 1
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST]);
		ctrl.run({ message: 'Hello', autoSend: true });
		await timeout(10);
		assert.strictEqual(await p, undefined);

		assertType(progress);

		const modelChange = new Promise<void>(resolve => model.onDidChangeContent(() => resolve()));

		progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: 'Hello-Hello' }] });

		await modelChange;
		assert.strictEqual(model.getValue(), 'HelloWorld'); // first word has been streamed

		const p2 = ctrl.awaitStates([State.WAIT_FOR_INPUT]);
		chatService.cancelCurrentRequestForSession(ctrl.chatWidget.viewModel!.model.sessionId);
		assert.strictEqual(await p2, undefined);

		assert.strictEqual(model.getValue(), 'HelloWorld'); // CANCEL just stops the request and progressive typing but doesn't undo

	});

	test('Apply Edits from existing session w/ edits', async function () {

		model.setValue('');

		const newSession = await inlineChatSessionService.createSession(editor, {}, CancellationToken.None);
		assertType(newSession);

		await (await chatService.sendRequest(newSession.chatModel.sessionId, 'Existing', { location: ChatAgentLocation.Editor }))?.responseCreatedPromise;

		assert.strictEqual(newSession.chatModel.requestInProgress, true);

		const response = newSession.chatModel.lastRequest?.response;
		assertType(response);

		await new Promise(resolve => {
			if (response.isComplete) {
				resolve(undefined);
			}
			const d = response.onDidChange(() => {
				if (response.isComplete) {
					d.dispose();
					resolve(undefined);
				}
			});
		});

		ctrl = instaService.createInstance(TestController, editor);
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE]);
		ctrl.run({ existingSession: newSession });

		assert.strictEqual(await p, undefined);

		assert.strictEqual(model.getValue(), 'Existing');

	});

	test('Undo on error (2 rounds)', async function () {

		return runWithFakedTimers({}, async () => {


			store.add(chatAgentService.registerDynamicAgent({ id: 'testEditorAgent', ...agentData, }, {
				async invoke(request, progress, history, token) {

					progress({
						kind: 'textEdit',
						uri: model.uri,
						edits: [{
							range: new Range(1, 1, 1, 1),
							text: request.message
						}]
					});

					if (request.message === 'two') {
						await timeout(100); // give edit a chance
						return {
							errorDetails: { message: 'FAILED' }
						};
					}
					return {};
				},
			}));

			model.setValue('');

			// ROUND 1

			ctrl = instaService.createInstance(TestController, editor);
			const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
			ctrl.run({ autoSend: true, message: 'one' });
			assert.strictEqual(await p, undefined);
			assert.strictEqual(model.getValue(), 'one');


			// ROUND 2

			const p2 = ctrl.awaitStates([State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
			const values = new Set<string>();
			store.add(model.onDidChangeContent(() => values.add(model.getValue())));
			ctrl.chatWidget.acceptInput('two'); // WILL Trigger a failure
			assert.strictEqual(await p2, undefined);
			assert.strictEqual(model.getValue(), 'one'); // undone
			assert.ok(values.has('twoone')); // we had but the change got undone
		});
	});

	test('Inline chat "discard" button does not always appear if response is stopped #228030', async function () {

		model.setValue('World');

		const deferred = new DeferredPromise<void>();

		store.add(chatAgentService.registerDynamicAgent({
			id: 'testEditorAgent2',
			...agentData
		}, {
			async invoke(request, progress, history, token) {

				progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: 'Hello-Hello' }] });
				await deferred.p;
				return {};
			},
		}));

		ctrl = instaService.createInstance(TestController, editor);

		// REQUEST 1
		const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST]);
		ctrl.run({ message: 'Hello', autoSend: true });


		assert.strictEqual(await p, undefined);

		const p2 = ctrl.awaitStates([State.WAIT_FOR_INPUT]);
		chatService.cancelCurrentRequestForSession(ctrl.chatWidget.viewModel!.model.sessionId);
		assert.strictEqual(await p2, undefined);


		const value = contextKeyService.getContextKeyValue(CTX_INLINE_CHAT_RESPONSE_TYPE.key);
		assert.notStrictEqual(value, InlineChatResponseType.None);
	});

	test('Restore doesn\'t edit on errored result', async function () {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {

			const model2 = store.add(instaService.get(IModelService).createModel('ABC', null));

			model.setValue('World');

			store.add(chatAgentService.registerDynamicAgent({
				id: 'testEditorAgent2',
				...agentData
			}, {
				async invoke(request, progress, history, token) {

					progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: 'Hello1' }] });
					await timeout(100);
					progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: 'Hello2' }] });
					await timeout(100);
					progress({ kind: 'textEdit', uri: model.uri, edits: [{ range: new Range(1, 1, 1, 1), text: 'Hello3' }] });
					await timeout(100);

					return {
						errorDetails: { message: 'FAILED' }
					};
				},
			}));

			ctrl = instaService.createInstance(TestController, editor);

			// REQUEST 1
			const p = ctrl.awaitStates([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
			ctrl.run({ message: 'Hello', autoSend: true });

			assert.strictEqual(await p, undefined);

			const p2 = ctrl.awaitStates([State.PAUSE]);
			editor.setModel(model2);
			assert.strictEqual(await p2, undefined);

			const p3 = ctrl.awaitStates([...TestController.INIT_SEQUENCE]);
			editor.setModel(model);
			assert.strictEqual(await p3, undefined);

			assert.strictEqual(model.getValue(), 'World');
		});
	});
});
