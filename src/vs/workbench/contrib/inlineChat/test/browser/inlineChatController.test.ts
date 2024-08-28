/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { equals } from 'vs/base/common/arrays';
import { DeferredPromise, raceCancellation, timeout } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { mock } from 'vs/base/test/common/mock';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffProviderFactoryService } from 'vs/editor/browser/widget/diffEditor/diffProviderFactoryService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLineSequence, ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { TestDiffProviderFactoryService } from 'vs/editor/test/browser/diff/testDiffProviderFactoryService';
import { instantiateTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IEditorProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { IView, IViewDescriptorService } from 'vs/workbench/common/views';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';
import { IChatAccessibilityService, IChatWidget, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAgentLocation, ChatAgentService, IChatAgentData, IChatAgentNameService, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { InlineChatController, State } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { CTX_INLINE_CHAT_USER_DID_EDIT, EditMode, InlineChatConfigKeys } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { TestViewsService, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { IExtensionService, nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { IChatProgress, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { ChatService } from 'vs/workbench/contrib/chat/common/chatServiceImpl';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { TestContextService, TestExtensionService } from 'vs/workbench/test/common/workbenchTestServices';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { ChatSlashCommandService, IChatSlashCommandService } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { ChatWidgetService } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from 'vs/workbench/contrib/chat/common/chatWidgetHistoryService';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { NullHoverService } from 'vs/platform/hover/test/browser/nullHoverService';
import { ChatVariablesService } from 'vs/workbench/contrib/chat/browser/chatVariables';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { TestCommandService } from 'vs/editor/test/browser/editorTestServices';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { RerunAction } from 'vs/workbench/contrib/inlineChat/browser/inlineChatActions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { assertType } from 'vs/base/common/types';
import { IWorkbenchAssignmentService } from 'vs/workbench/services/assignment/common/assignmentService';
import { NullWorkbenchAssignmentService } from 'vs/workbench/services/assignment/test/common/nullAssignmentService';
import { IInlineChatSavingService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSavingService';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionService';
import { InlineChatSessionServiceImpl } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionServiceImpl';
import { TestWorkerService } from 'vs/workbench/contrib/inlineChat/test/browser/testWorkerService';

suite('InteractiveChatController', function () {

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
			[IInlineChatSavingService, new class extends mock<IInlineChatSavingService>() {
				override markChanged(session: Session): void {
					// noop
				}
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
			[IWorkbenchAssignmentService, new NullWorkbenchAssignmentService()]
		);

		instaService = store.add((store.add(workbenchInstantiationService(undefined, store))).createChild(serviceCollection));

		configurationService = instaService.get(IConfigurationService) as TestConfigurationService;
		configurationService.setUserConfiguration('chat', { editor: { fontSize: 14, fontFamily: 'default' } });
		configurationService.setUserConfiguration('inlineChat', { mode: 'livePreview' });
		configurationService.setUserConfiguration('editor', {});

		contextKeyService = instaService.get(IContextKeyService) as MockContextKeyService;
		chatService = instaService.get(IChatService);
		chatAgentService = instaService.get(IChatAgentService);

		inlineChatSessionService = store.add(instaService.get(IInlineChatSessionService));

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
		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 1, 10 /* line length */));

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
		ctrl.acceptInput();
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

		configurationService.setUserConfiguration(InlineChatConfigKeys.Mode, EditMode.Live);

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
		assert.strictEqual(contextKeyService.getContextKeyValue(CTX_INLINE_CHAT_USER_DID_EDIT.key), undefined);
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
		assert.strictEqual(contextKeyService.getContextKeyValue(CTX_INLINE_CHAT_USER_DID_EDIT.key), true);

		ctrl.finishExistingSession();
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
		ctrl.finishExistingSession();
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
		await ctrl.acceptInput();
		assert.strictEqual(await p2, undefined);

		assert.strictEqual(model.getValue(), 'zwei-eins-');

		// REQUEST 2 - RERUN
		const p3 = ctrl.awaitStates([State.SHOW_REQUEST, State.WAIT_FOR_INPUT]);
		await instaService.invokeFunction(rerun.runInlineChatCommand, ctrl, editor);
		assert.strictEqual(await p3, undefined);

		assert.strictEqual(model.getValue(), 'drei-eins-');

		ctrl.finishExistingSession();
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
		await ctrl.acceptInput();
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

		const newSession = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(newSession);

		await chatService.sendRequest(newSession.chatModel.sessionId, 'Existing', { location: ChatAgentLocation.Editor });


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
});
