/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TestDiffProviderFactoryService } from 'vs/editor/test/browser/diff/testDiffProviderFactoryService';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffProviderFactoryService } from 'vs/editor/browser/widget/diffEditor/diffProviderFactoryService';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
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
import { IChatAccessibilityService, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IInlineChatSavingService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSavingService';
import { HunkState, Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionService';
import { InlineChatSessionServiceImpl } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionServiceImpl';
import { EditMode } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { CancellationToken } from 'vs/base/common/cancellation';
import { assertType } from 'vs/base/common/types';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { TestWorkerService } from './testWorkerService';
import { IExtensionService, nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ChatWidgetService } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { ChatService } from 'vs/workbench/contrib/chat/common/chatServiceImpl';
import { IChatSlashCommandService, ChatSlashCommandService } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { IChatWidgetHistoryService, ChatWidgetHistoryService } from 'vs/workbench/contrib/chat/common/chatWidgetHistoryService';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { TestExtensionService, TestContextService } from 'vs/workbench/test/common/workbenchTestServices';
import { IChatAgentService, ChatAgentService, ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatVariablesService } from 'vs/workbench/contrib/chat/browser/chatVariables';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { TestCommandService } from 'vs/editor/test/browser/editorTestServices';
import { IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';
import { IWorkbenchAssignmentService } from 'vs/workbench/services/assignment/common/assignmentService';
import { NullWorkbenchAssignmentService } from 'vs/workbench/services/assignment/test/common/nullAssignmentService';
import { ILanguageModelToolsService } from 'vs/workbench/contrib/chat/common/languageModelToolsService';
import { MockLanguageModelToolsService } from 'vs/workbench/contrib/chat/test/common/mockLanguageModelToolsService';

suite('InlineChatSession', function () {

	const store = new DisposableStore();
	let editor: IActiveCodeEditor;
	let model: ITextModel;
	let instaService: TestInstantiationService;

	let inlineChatSessionService: IInlineChatSessionService;

	setup(function () {
		const contextKeyService = new MockContextKeyService();


		const serviceCollection = new ServiceCollection(
			[IConfigurationService, new TestConfigurationService()],
			[IChatVariablesService, new SyncDescriptor(ChatVariablesService)],
			[ILogService, new NullLogService()],
			[ITelemetryService, NullTelemetryService],
			[IExtensionService, new TestExtensionService()],
			[IContextKeyService, new MockContextKeyService()],
			[IViewsService, new TestExtensionService()],
			[IWorkspaceContextService, new TestContextService()],
			[IChatWidgetHistoryService, new SyncDescriptor(ChatWidgetHistoryService)],
			[IChatWidgetService, new SyncDescriptor(ChatWidgetService)],
			[IChatSlashCommandService, new SyncDescriptor(ChatSlashCommandService)],
			[IChatService, new SyncDescriptor(ChatService)],
			[IEditorWorkerService, new SyncDescriptor(TestWorkerService)],
			[IChatAgentService, new SyncDescriptor(ChatAgentService)],
			[IContextKeyService, contextKeyService],
			[IDiffProviderFactoryService, new SyncDescriptor(TestDiffProviderFactoryService)],
			[IInlineChatSessionService, new SyncDescriptor(InlineChatSessionServiceImpl)],
			[ICommandService, new SyncDescriptor(TestCommandService)],
			[ILanguageModelToolsService, new MockLanguageModelToolsService()],
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
			[IConfigurationService, new TestConfigurationService()],
			[IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
				override onDidChangeLocation = Event.None;
			}],
			[IWorkbenchAssignmentService, new NullWorkbenchAssignmentService()]
		);



		instaService = store.add(workbenchInstantiationService(undefined, store).createChild(serviceCollection));
		inlineChatSessionService = store.add(instaService.get(IInlineChatSessionService));

		instaService.get(IChatAgentService).registerDynamicAgent({
			extensionId: nullExtensionDescription.identifier,
			publisherDisplayName: '',
			extensionDisplayName: '',
			extensionPublisherId: '',
			id: 'testAgent',
			name: 'testAgent',
			isDefault: true,
			locations: [ChatAgentLocation.Editor],
			metadata: {},
			slashCommands: [],
			disambiguation: [],
		}, {
			async invoke() {
				return {};
			}
		});


		model = store.add(instaService.get(IModelService).createModel('one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven', null));
		editor = store.add(instantiateTestCodeEditor(instaService, model));
	});

	teardown(function () {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function makeEditAsAi(edit: EditOperation | EditOperation[]) {
		const session = inlineChatSessionService.getSession(editor, editor.getModel()!.uri);
		assertType(session);
		session.hunkData.ignoreTextModelNChanges = true;
		try {
			editor.executeEdits('test', Array.isArray(edit) ? edit : [edit]);
		} finally {
			session.hunkData.ignoreTextModelNChanges = false;
		}
		await session.hunkData.recompute({ applied: 0, sha1: 'fakeSha1' });
	}

	function makeEdit(edit: EditOperation | EditOperation[]) {
		editor.executeEdits('test', Array.isArray(edit) ? edit : [edit]);
	}

	test('Create, release', async function () {

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);
		inlineChatSessionService.releaseSession(session);
	});

	test('HunkData, info', async function () {

		const decorationCountThen = model.getAllDecorations().length;

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);
		assert.ok(session.textModelN === model);

		await makeEditAsAi(EditOperation.insert(new Position(1, 1), 'AI_EDIT\n'));


		assert.strictEqual(session.hunkData.size, 1);
		let [hunk] = session.hunkData.getInfo();
		assertType(hunk);

		assert.ok(!session.textModel0.equalsTextBuffer(session.textModelN.getTextBuffer()));
		assert.strictEqual(hunk.getState(), HunkState.Pending);
		assert.ok(hunk.getRangesN()[0].equalsRange({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 7 }));

		await makeEditAsAi(EditOperation.insert(new Position(1, 3), 'foobar'));
		[hunk] = session.hunkData.getInfo();
		assert.ok(hunk.getRangesN()[0].equalsRange({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 13 }));

		inlineChatSessionService.releaseSession(session);

		assert.strictEqual(model.getAllDecorations().length, decorationCountThen); // no leaked decorations!
	});

	test('HunkData, accept', async function () {

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.insert(new Position(1, 1), 'AI_EDIT\n'), EditOperation.insert(new Position(10, 1), 'AI_EDIT\n')]);

		assert.strictEqual(session.hunkData.size, 2);
		assert.ok(!session.textModel0.equalsTextBuffer(session.textModelN.getTextBuffer()));

		for (const hunk of session.hunkData.getInfo()) {
			assertType(hunk);
			assert.strictEqual(hunk.getState(), HunkState.Pending);
			hunk.acceptChanges();
			assert.strictEqual(hunk.getState(), HunkState.Accepted);
		}

		assert.strictEqual(session.textModel0.getValue(), session.textModelN.getValue());
		inlineChatSessionService.releaseSession(session);
	});

	test('HunkData, reject', async function () {

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.insert(new Position(1, 1), 'AI_EDIT\n'), EditOperation.insert(new Position(10, 1), 'AI_EDIT\n')]);

		assert.strictEqual(session.hunkData.size, 2);
		assert.ok(!session.textModel0.equalsTextBuffer(session.textModelN.getTextBuffer()));

		for (const hunk of session.hunkData.getInfo()) {
			assertType(hunk);
			assert.strictEqual(hunk.getState(), HunkState.Pending);
			hunk.discardChanges();
			assert.strictEqual(hunk.getState(), HunkState.Rejected);
		}

		assert.strictEqual(session.textModel0.getValue(), session.textModelN.getValue());
		inlineChatSessionService.releaseSession(session);
	});

	test('HunkData, N rounds', async function () {

		model.setValue('one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelwe\nthirteen\nfourteen\nfifteen\nsixteen\nseventeen\neighteen\nnineteen\n');

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		assert.ok(session.textModel0.equalsTextBuffer(session.textModelN.getTextBuffer()));

		assert.strictEqual(session.hunkData.size, 0);

		// ROUND #1
		await makeEditAsAi([
			EditOperation.insert(new Position(1, 1), 'AI1'),
			EditOperation.insert(new Position(4, 1), 'AI2'),
			EditOperation.insert(new Position(19, 1), 'AI3')
		]);

		assert.strictEqual(session.hunkData.size, 2); // AI1, AI2 are merged into one hunk, AI3 is a separate hunk

		let [first, second] = session.hunkData.getInfo();

		assert.ok(model.getValueInRange(first.getRangesN()[0]).includes('AI1'));
		assert.ok(model.getValueInRange(first.getRangesN()[0]).includes('AI2'));
		assert.ok(model.getValueInRange(second.getRangesN()[0]).includes('AI3'));

		assert.ok(!session.textModel0.getValueInRange(first.getRangesN()[0]).includes('AI1'));
		assert.ok(!session.textModel0.getValueInRange(first.getRangesN()[0]).includes('AI2'));
		assert.ok(!session.textModel0.getValueInRange(second.getRangesN()[0]).includes('AI3'));

		first.acceptChanges();
		assert.ok(session.textModel0.getValueInRange(first.getRangesN()[0]).includes('AI1'));
		assert.ok(session.textModel0.getValueInRange(first.getRangesN()[0]).includes('AI2'));
		assert.ok(!session.textModel0.getValueInRange(second.getRangesN()[0]).includes('AI3'));


		// ROUND #2
		await makeEditAsAi([
			EditOperation.insert(new Position(7, 1), 'AI4'),
		]);
		assert.strictEqual(session.hunkData.size, 2);

		[first, second] = session.hunkData.getInfo();
		assert.ok(model.getValueInRange(first.getRangesN()[0]).includes('AI4')); // the new hunk (in line-order)
		assert.ok(model.getValueInRange(second.getRangesN()[0]).includes('AI3')); // the previous hunk remains

		inlineChatSessionService.releaseSession(session);
	});

	test('HunkData, (mirror) edit before', async function () {

		const lines = ['one', 'two', 'three'];
		model.setValue(lines.join('\n'));
		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.insert(new Position(3, 1), 'AI WAS HERE\n')]);
		assert.strictEqual(session.textModelN.getValue(), ['one', 'two', 'AI WAS HERE', 'three'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), lines.join('\n'));

		makeEdit([EditOperation.replace(new Range(1, 1, 1, 4), 'ONE')]);
		assert.strictEqual(session.textModelN.getValue(), ['ONE', 'two', 'AI WAS HERE', 'three'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['ONE', 'two', 'three'].join('\n'));
	});

	test('HunkData, (mirror) edit after', async function () {

		const lines = ['one', 'two', 'three', 'four', 'five'];
		model.setValue(lines.join('\n'));

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.insert(new Position(3, 1), 'AI_EDIT\n')]);

		assert.strictEqual(session.hunkData.size, 1);
		const [hunk] = session.hunkData.getInfo();

		makeEdit([EditOperation.insert(new Position(1, 1), 'USER1')]);
		assert.strictEqual(session.textModelN.getValue(), ['USER1one', 'two', 'AI_EDIT', 'three', 'four', 'five'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['USER1one', 'two', 'three', 'four', 'five'].join('\n'));

		makeEdit([EditOperation.insert(new Position(5, 1), 'USER2')]);
		assert.strictEqual(session.textModelN.getValue(), ['USER1one', 'two', 'AI_EDIT', 'three', 'USER2four', 'five'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['USER1one', 'two', 'three', 'USER2four', 'five'].join('\n'));

		hunk.acceptChanges();
		assert.strictEqual(session.textModelN.getValue(), ['USER1one', 'two', 'AI_EDIT', 'three', 'USER2four', 'five'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['USER1one', 'two', 'AI_EDIT', 'three', 'USER2four', 'five'].join('\n'));
	});

	test('HunkData, (mirror) edit inside ', async function () {

		const lines = ['one', 'two', 'three'];
		model.setValue(lines.join('\n'));
		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.insert(new Position(3, 1), 'AI WAS HERE\n')]);
		assert.strictEqual(session.textModelN.getValue(), ['one', 'two', 'AI WAS HERE', 'three'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), lines.join('\n'));

		makeEdit([EditOperation.replace(new Range(3, 4, 3, 7), 'wwaaassss')]);
		assert.strictEqual(session.textModelN.getValue(), ['one', 'two', 'AI wwaaassss HERE', 'three'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['one', 'two', 'three'].join('\n'));
	});

	test('HunkData, (mirror) edit after dicard ', async function () {

		const lines = ['one', 'two', 'three'];
		model.setValue(lines.join('\n'));
		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.insert(new Position(3, 1), 'AI WAS HERE\n')]);
		assert.strictEqual(session.textModelN.getValue(), ['one', 'two', 'AI WAS HERE', 'three'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), lines.join('\n'));

		assert.strictEqual(session.hunkData.size, 1);
		const [hunk] = session.hunkData.getInfo();
		hunk.discardChanges();
		assert.strictEqual(session.textModelN.getValue(), lines.join('\n'));
		assert.strictEqual(session.textModel0.getValue(), lines.join('\n'));

		makeEdit([EditOperation.replace(new Range(3, 4, 3, 6), '3333')]);
		assert.strictEqual(session.textModelN.getValue(), ['one', 'two', 'thr3333'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['one', 'two', 'thr3333'].join('\n'));
	});

	test('HunkData, (mirror) edit after, multi turn', async function () {

		const lines = ['one', 'two', 'three', 'four', 'five'];
		model.setValue(lines.join('\n'));

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.insert(new Position(3, 1), 'AI_EDIT\n')]);

		assert.strictEqual(session.hunkData.size, 1);

		makeEdit([EditOperation.insert(new Position(5, 1), 'FOO')]);
		assert.strictEqual(session.textModelN.getValue(), ['one', 'two', 'AI_EDIT', 'three', 'FOOfour', 'five'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['one', 'two', 'three', 'FOOfour', 'five'].join('\n'));

		await makeEditAsAi([EditOperation.insert(new Position(2, 4), ' zwei')]);
		assert.strictEqual(session.hunkData.size, 1);

		assert.strictEqual(session.textModelN.getValue(), ['one', 'two zwei', 'AI_EDIT', 'three', 'FOOfour', 'five'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['one', 'two', 'three', 'FOOfour', 'five'].join('\n'));

		makeEdit([EditOperation.replace(new Range(6, 3, 6, 5), 'vefivefi')]);
		assert.strictEqual(session.textModelN.getValue(), ['one', 'two zwei', 'AI_EDIT', 'three', 'FOOfour', 'fivefivefi'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['one', 'two', 'three', 'FOOfour', 'fivefivefi'].join('\n'));
	});

	test('HunkData, (mirror) edit after, multi turn 2', async function () {

		const lines = ['one', 'two', 'three', 'four', 'five'];
		model.setValue(lines.join('\n'));

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.insert(new Position(3, 1), 'AI_EDIT\n')]);

		assert.strictEqual(session.hunkData.size, 1);

		makeEdit([EditOperation.insert(new Position(5, 1), 'FOO')]);
		assert.strictEqual(session.textModelN.getValue(), ['one', 'two', 'AI_EDIT', 'three', 'FOOfour', 'five'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['one', 'two', 'three', 'FOOfour', 'five'].join('\n'));

		await makeEditAsAi([EditOperation.insert(new Position(2, 4), 'zwei')]);
		assert.strictEqual(session.hunkData.size, 1);

		assert.strictEqual(session.textModelN.getValue(), ['one', 'twozwei', 'AI_EDIT', 'three', 'FOOfour', 'five'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['one', 'two', 'three', 'FOOfour', 'five'].join('\n'));

		makeEdit([EditOperation.replace(new Range(6, 3, 6, 5), 'vefivefi')]);
		assert.strictEqual(session.textModelN.getValue(), ['one', 'twozwei', 'AI_EDIT', 'three', 'FOOfour', 'fivefivefi'].join('\n'));
		assert.strictEqual(session.textModel0.getValue(), ['one', 'two', 'three', 'FOOfour', 'fivefivefi'].join('\n'));

		session.hunkData.getInfo()[0].acceptChanges();
		assert.strictEqual(session.textModelN.getValue(), session.textModel0.getValue());

		makeEdit([EditOperation.replace(new Range(1, 1, 1, 1), 'done')]);
		assert.strictEqual(session.textModelN.getValue(), session.textModel0.getValue());
	});

	test('HunkData, accept, discardAll', async function () {

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.insert(new Position(1, 1), 'AI_EDIT\n'), EditOperation.insert(new Position(10, 1), 'AI_EDIT\n')]);

		assert.strictEqual(session.hunkData.size, 2);
		assert.ok(!session.textModel0.equalsTextBuffer(session.textModelN.getTextBuffer()));

		const textModeNNow = session.textModelN.getValue();

		session.hunkData.getInfo()[0].acceptChanges();
		assert.strictEqual(textModeNNow, session.textModelN.getValue());

		session.hunkData.discardAll(); // all remaining
		assert.strictEqual(session.textModelN.getValue(), 'AI_EDIT\none\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven');
		assert.strictEqual(session.textModelN.getValue(), session.textModel0.getValue());

		inlineChatSessionService.releaseSession(session);
	});

	test('HunkData, discardAll return undo edits', async function () {

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.insert(new Position(1, 1), 'AI_EDIT\n'), EditOperation.insert(new Position(10, 1), 'AI_EDIT\n')]);

		assert.strictEqual(session.hunkData.size, 2);
		assert.ok(!session.textModel0.equalsTextBuffer(session.textModelN.getTextBuffer()));

		const textModeNNow = session.textModelN.getValue();

		session.hunkData.getInfo()[0].acceptChanges();
		assert.strictEqual(textModeNNow, session.textModelN.getValue());

		const undoEdits = session.hunkData.discardAll(); // all remaining
		assert.strictEqual(session.textModelN.getValue(), 'AI_EDIT\none\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven');
		assert.strictEqual(session.textModelN.getValue(), session.textModel0.getValue());

		// undo the discards
		session.textModelN.pushEditOperations(null, undoEdits, () => null);
		assert.strictEqual(textModeNNow, session.textModelN.getValue());

		inlineChatSessionService.releaseSession(session);
	});
});
