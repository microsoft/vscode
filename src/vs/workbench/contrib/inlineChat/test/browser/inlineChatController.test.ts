/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { equals } from 'vs/base/common/arrays';
import { timeout } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { mock } from 'vs/base/test/common/mock';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffProviderFactoryService } from 'vs/editor/browser/widget/diffEditor/diffProviderFactoryService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
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
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';
import { IChatAccessibilityService, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAgentLocation, ChatAgentService, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { InlineChatController, InlineChatRunOptions, State } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { CTX_INLINE_CHAT_USER_DID_EDIT, EditMode, IInlineChatRequest, IInlineChatService, InlineChatConfigKeys, InlineChatResponseType } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { InlineChatServiceImpl } from 'vs/workbench/contrib/inlineChat/common/inlineChatServiceImpl';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { IInlineChatSavingService } from '../../browser/inlineChatSavingService';
import { IInlineChatSessionService } from '../../browser/inlineChatSessionService';
import { InlineChatSessionServiceImpl } from '../../browser/inlineChatSessionServiceImpl';
import { TestWorkerService } from './testWorkerService';
import { IExtensionService, nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
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

suite('InteractiveChatController', function () {
	class TestController extends InlineChatController {

		static INIT_SEQUENCE: readonly State[] = [State.CREATE_SESSION, State.INIT_UI, State.WAIT_FOR_INPUT];
		static INIT_SEQUENCE_AUTO_SEND: readonly State[] = [...this.INIT_SEQUENCE, State.SHOW_REQUEST, State.SHOW_RESPONSE, State.WAIT_FOR_INPUT];

		private readonly _onDidChangeState = new Emitter<State>();
		readonly onDidChangeState: Event<State> = this._onDidChangeState.event;

		readonly states: readonly State[] = [];

		waitFor(states: readonly State[]): Promise<void> {
			const actual: State[] = [];

			return new Promise<void>((resolve, reject) => {
				const d = this.onDidChangeState(state => {
					actual.push(state);
					if (equals(states, actual)) {
						d.dispose();
						resolve();
					}
				});

				setTimeout(() => {
					d.dispose();
					reject(new Error(`timeout, \nEXPECTED: ${states.join('>')}, \nACTUAL  : ${actual.join('>')}`));
				}, 1000);
			});
		}

		protected override async _nextState(state: State, options: InlineChatRunOptions): Promise<void> {
			let nextState: State | void = state;
			while (nextState) {
				this._onDidChangeState.fire(nextState);
				(<State[]>this.states).push(nextState);
				nextState = await this[nextState](options);
			}
		}

		override dispose() {
			super.dispose();
			this._onDidChangeState.dispose();
		}
	}

	const store = new DisposableStore();
	let configurationService: TestConfigurationService;
	let editor: IActiveCodeEditor;
	let model: ITextModel;
	let ctrl: TestController;
	let contextKeyService: MockContextKeyService;
	let inlineChatService: InlineChatServiceImpl;
	let inlineChatSessionService: IInlineChatSessionService;
	let instaService: TestInstantiationService;

	setup(function () {

		const serviceCollection = new ServiceCollection(
			[IConfigurationService, new TestConfigurationService()],
			[IChatVariablesService, new SyncDescriptor(ChatVariablesService)],
			[ILogService, new NullLogService()],
			[ITelemetryService, NullTelemetryService],
			[IHoverService, NullHoverService],
			[IExtensionService, new TestExtensionService()],
			[IContextKeyService, new MockContextKeyService()],
			[IViewsService, new TestExtensionService()],
			[IWorkspaceContextService, new TestContextService()],
			[IChatWidgetHistoryService, new SyncDescriptor(ChatWidgetHistoryService)],
			[IChatWidgetService, new SyncDescriptor(ChatWidgetService)],
			[IChatSlashCommandService, new SyncDescriptor(ChatSlashCommandService)],
			[IChatService, new SyncDescriptor(ChatService)],
			[IEditorWorkerService, new SyncDescriptor(TestWorkerService)],
			[IContextKeyService, contextKeyService],
			[IChatAgentService, new SyncDescriptor(ChatAgentService)],
			[IInlineChatService, new SyncDescriptor(InlineChatServiceImpl)],
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
			}]
		);

		instaService = store.add((store.add(workbenchInstantiationService(undefined, store))).createChild(serviceCollection));

		configurationService = instaService.get(IConfigurationService) as TestConfigurationService;
		configurationService.setUserConfiguration('chat', { editor: { fontSize: 14, fontFamily: 'default' } });
		configurationService.setUserConfiguration('inlineChat', { mode: 'livePreview' });
		configurationService.setUserConfiguration('editor', {});

		contextKeyService = instaService.get(IContextKeyService) as MockContextKeyService;

		inlineChatService = instaService.get(IInlineChatService) as InlineChatServiceImpl;

		const chatAgentService = instaService.get(IChatAgentService);

		store.add(chatAgentService.registerDynamicAgent({
			extensionId: nullExtensionDescription.identifier,
			publisherDisplayName: '',
			extensionDisplayName: '',
			extensionPublisherId: '',
			id: 'testAgent',
			name: 'testAgent',
			isDefault: true,
			locations: [ChatAgentLocation.Panel],
			metadata: {},
			slashCommands: []
		}, {
			async invoke(request, progress, history, token) {
				return {};
			},
		}));
		inlineChatSessionService = store.add(instaService.get(IInlineChatSessionService));

		model = store.add(instaService.get(IModelService).createModel('Hello\nWorld\nHello Again\nHello World\n', null));
		editor = store.add(instantiateTestCodeEditor(instaService, model));

		store.add(inlineChatService.addProvider({
			extensionId: nullExtensionDescription.identifier,
			label: 'Unit Test Default',
			prepareInlineChatSession() {
				return {
					id: Math.random()
				};
			},
			provideResponse(session, request) {
				return {
					type: InlineChatResponseType.EditorEdit,
					id: Math.random(),
					edits: [{
						range: new Range(1, 1, 1, 1),
						text: request.prompt
					}]
				};
			}
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
		const p = ctrl.waitFor(TestController.INIT_SEQUENCE_AUTO_SEND);
		const run = ctrl.run({ message: 'Hello', autoSend: true });
		await p;
		assert.ok(ctrl.getWidgetPosition() !== undefined);
		await ctrl.cancelSession();

		await run;

		assert.ok(ctrl.getWidgetPosition() === undefined);
	});

	test('wholeRange does not expand to whole lines, editor selection default', async function () {

		editor.setSelection(new Range(1, 1, 1, 3));
		ctrl = instaService.createInstance(TestController, editor);

		store.add(inlineChatService.addProvider({
			extensionId: nullExtensionDescription.identifier,
			label: 'Unit Test',
			prepareInlineChatSession() {
				return {
					id: Math.random()
				};
			},
			provideResponse(session, request) {
				throw new Error();
			}
		}));

		ctrl.run({});
		await Event.toPromise(Event.filter(ctrl.onDidChangeState, e => e === State.WAIT_FOR_INPUT));

		const session = inlineChatSessionService.getSession(editor, editor.getModel()!.uri);
		assert.ok(session);
		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 1, 3));

		await ctrl.cancelSession();
	});

	test('wholeRange expands to whole lines, session provided', async function () {

		editor.setSelection(new Range(1, 1, 1, 1));
		ctrl = instaService.createInstance(TestController, editor);

		store.add(inlineChatService.addProvider({
			extensionId: nullExtensionDescription.identifier,
			label: 'Unit Test',
			prepareInlineChatSession() {
				return {
					id: Math.random(),
					wholeRange: new Range(1, 1, 1, 3)
				};
			},
			provideResponse(session, request) {
				throw new Error();
			}
		}));

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
		const p = ctrl.waitFor(TestController.INIT_SEQUENCE_AUTO_SEND);
		const r = ctrl.run({ message: 'Hello', autoSend: true });

		await p;

		const session = inlineChatSessionService.getSession(editor, editor.getModel()!.uri);
		assert.ok(session);
		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 1, 10 /* line length */));

		editor.setSelection(new Range(2, 1, 2, 1));
		editor.trigger('test', 'type', { text: 'a' });

		await ctrl.waitFor([State.ACCEPT]);
		await r;
	});

	test('\'whole range\' isn\'t updated for edits outside whole range #4346', async function () {

		editor.setSelection(new Range(3, 1, 3, 1));

		store.add(inlineChatService.addProvider({
			extensionId: nullExtensionDescription.identifier,
			label: 'Unit Test',
			prepareInlineChatSession() {
				return {
					id: Math.random(),
					wholeRange: new Range(3, 1, 3, 3)
				};
			},
			provideResponse(session, request) {
				return {
					type: InlineChatResponseType.EditorEdit,
					id: Math.random(),
					edits: [{
						range: new Range(1, 1, 1, 1), // EDIT happens outside of whole range
						text: `${request.prompt}\n${request.prompt}`
					}]
				};
			}
		}));

		ctrl = instaService.createInstance(TestController, editor);
		const p = ctrl.waitFor(TestController.INIT_SEQUENCE);
		const r = ctrl.run({ message: 'GENGEN', autoSend: false });

		await p;

		const session = inlineChatSessionService.getSession(editor, editor.getModel()!.uri);
		assert.ok(session);
		assert.deepStrictEqual(session.wholeRange.value, new Range(3, 1, 3, 3)); // initial

		ctrl.acceptInput();
		await ctrl.waitFor([State.SHOW_REQUEST, State.SHOW_RESPONSE, State.WAIT_FOR_INPUT]);

		assert.deepStrictEqual(session.wholeRange.value, new Range(1, 1, 4, 3));

		await ctrl.cancelSession();
		await r;
	});

	test('Stuck inline chat widget #211', async function () {
		store.add(inlineChatService.addProvider({
			extensionId: nullExtensionDescription.identifier,
			label: 'Unit Test',
			prepareInlineChatSession() {
				return {
					id: Math.random(),
					wholeRange: new Range(3, 1, 3, 3)
				};
			},
			provideResponse(session, request) {
				return new Promise<never>(() => { });
			}
		}));
		ctrl = instaService.createInstance(TestController, editor);
		const p = ctrl.waitFor([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST]);
		const r = ctrl.run({ message: 'Hello', autoSend: true });

		await p;
		ctrl.acceptSession();

		await r;
		assert.strictEqual(ctrl.getWidgetPosition(), undefined);
	});

	test('[Bug] Inline Chat\'s streaming pushed broken iterations to the undo stack #2403', async function () {

		store.add(inlineChatService.addProvider({
			extensionId: nullExtensionDescription.identifier,
			label: 'Unit Test',
			prepareInlineChatSession() {
				return {
					id: Math.random(),
					wholeRange: new Range(3, 1, 3, 3)
				};
			},
			async provideResponse(session, request, progress) {

				progress.report({ edits: [{ range: new Range(1, 1, 1, 1), text: 'hEllo1\n' }] });
				progress.report({ edits: [{ range: new Range(2, 1, 2, 1), text: 'hEllo2\n' }] });

				return {
					id: Math.random(),
					type: InlineChatResponseType.EditorEdit,
					edits: [{ range: new Range(1, 1, 1000, 1), text: 'Hello1\nHello2\n' }]
				};
			}
		}));

		const valueThen = editor.getModel().getValue();

		ctrl = instaService.createInstance(TestController, editor);
		const p = ctrl.waitFor([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.SHOW_RESPONSE, State.WAIT_FOR_INPUT]);
		const r = ctrl.run({ message: 'Hello', autoSend: true });
		await p;
		ctrl.acceptSession();
		await r;

		assert.strictEqual(editor.getModel().getValue(), 'Hello1\nHello2\n');

		editor.getModel().undo();
		assert.strictEqual(editor.getModel().getValue(), valueThen);
	});



	test.skip('UI is streaming edits minutes after the response is finished #3345', async function () {

		configurationService.setUserConfiguration(InlineChatConfigKeys.Mode, EditMode.Live);

		return runWithFakedTimers({ maxTaskCount: Number.MAX_SAFE_INTEGER }, async () => {

			store.add(inlineChatService.addProvider({
				extensionId: nullExtensionDescription.identifier,
				label: 'Unit Test',
				prepareInlineChatSession() {
					return {
						id: Math.random(),
					};
				},
				async provideResponse(session, request, progress) {

					const text = '${CSI}#a\n${CSI}#b\n${CSI}#c\n';

					await timeout(10);
					progress.report({ edits: [{ range: new Range(1, 1, 1, 1), text: text }] });

					await timeout(10);
					progress.report({ edits: [{ range: new Range(1, 1, 1, 1), text: text.repeat(1000) + 'DONE' }] });

					throw new Error('Too long');
				}
			}));


			// let modelChangeCounter = 0;
			// store.add(editor.getModel().onDidChangeContent(() => { modelChangeCounter++; }));

			ctrl = instaService.createInstance(TestController, editor);
			const p = ctrl.waitFor([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.SHOW_RESPONSE, State.WAIT_FOR_INPUT]);
			const r = ctrl.run({ message: 'Hello', autoSend: true });
			await p;

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
		const p = ctrl.waitFor([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.SHOW_RESPONSE, State.WAIT_FOR_INPUT]);
		const r = ctrl.run({ message: 'GENERATED', autoSend: true });
		await p;

		assert.ok(model.getValue().includes('GENERATED'));
		assert.strictEqual(contextKeyService.getContextKeyValue(CTX_INLINE_CHAT_USER_DID_EDIT.key), undefined);
		ctrl.cancelSession();
		await r;
		assert.ok(!model.getValue().includes('GENERATED'));

	});

	test('escape doesn\'t remove code added from inline editor chat #3523, 2/2', async function () {

		// manual edits -> finish
		ctrl = instaService.createInstance(TestController, editor);
		const p = ctrl.waitFor([...TestController.INIT_SEQUENCE, State.SHOW_REQUEST, State.SHOW_RESPONSE, State.WAIT_FOR_INPUT]);
		const r = ctrl.run({ message: 'GENERATED', autoSend: true });
		await p;

		assert.ok(model.getValue().includes('GENERATED'));

		editor.executeEdits('test', [EditOperation.insert(model.getFullModelRange().getEndPosition(), 'MANUAL')]);
		assert.strictEqual(contextKeyService.getContextKeyValue(CTX_INLINE_CHAT_USER_DID_EDIT.key), true);

		ctrl.finishExistingSession();
		await r;
		assert.ok(model.getValue().includes('GENERATED'));
		assert.ok(model.getValue().includes('MANUAL'));

	});

	test('context has correct preview document', async function () {

		const requests: IInlineChatRequest[] = [];

		store.add(inlineChatService.addProvider({
			extensionId: nullExtensionDescription.identifier,
			label: 'Unit Test',
			prepareInlineChatSession() {
				return {
					id: Math.random()
				};
			},
			provideResponse(_session, request) {
				requests.push(request);
				return undefined;
			}
		}));

		async function makeRequest() {
			const p = ctrl.waitFor(TestController.INIT_SEQUENCE_AUTO_SEND);
			const r = ctrl.run({ message: 'Hello', autoSend: true });
			await p;
			await ctrl.cancelSession();
			await r;
		}

		// manual edits -> finish
		ctrl = instaService.createInstance(TestController, editor);

		configurationService.setUserConfiguration('inlineChat', { mode: EditMode.Live });
		await makeRequest();


		configurationService.setUserConfiguration('inlineChat', { mode: EditMode.Preview });
		await makeRequest();

		assert.strictEqual(requests.length, 2);

		assert.strictEqual(requests[0].previewDocument.toString(), model.uri.toString()); // live
		assert.strictEqual(requests[1].previewDocument.toString(), model.uri.toString()); // preview (both use the same but edits aren't applied like that)
	});
});
