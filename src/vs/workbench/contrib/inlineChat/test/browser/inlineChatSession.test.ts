/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IActiveCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { instantiateTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IEditorProgressService, IProgressRunner } from '../../../../../platform/progress/common/progress.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { IChatAccessibilityService, IChatWidgetService } from '../../../chat/browser/chat.js';
import { IChatResponseViewModel } from '../../../chat/common/chatViewModel.js';
import { IInlineChatSavingService } from '../../browser/inlineChatSavingService.js';
import { HunkState, Session } from '../../browser/inlineChatSession.js';
import { IInlineChatSessionService } from '../../browser/inlineChatSessionService.js';
import { InlineChatSessionServiceImpl } from '../../browser/inlineChatSessionServiceImpl.js';
import { EditMode } from '../../common/inlineChat.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { assertType } from '../../../../../base/common/types.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { TestWorkerService } from './testWorkerService.js';
import { IExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ChatWidgetService } from '../../../chat/browser/chatWidget.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { ChatService } from '../../../chat/common/chatServiceImpl.js';
import { IChatSlashCommandService, ChatSlashCommandService } from '../../../chat/common/chatSlashCommands.js';
import { IChatVariablesService } from '../../../chat/common/chatVariables.js';
import { IChatWidgetHistoryService, ChatWidgetHistoryService } from '../../../chat/common/chatWidgetHistoryService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { TestExtensionService, TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { IChatAgentService, ChatAgentService, ChatAgentLocation } from '../../../chat/common/chatAgents.js';
import { ChatVariablesService } from '../../../chat/browser/chatVariables.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestCommandService } from '../../../../../editor/test/browser/editorTestServices.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { ILanguageModelToolsService } from '../../../chat/common/languageModelToolsService.js';
import { MockLanguageModelToolsService } from '../../../chat/test/common/mockLanguageModelToolsService.js';
import { IChatRequestModel } from '../../../chat/common/chatModel.js';
import { assertSnapshot } from '../../../../../base/test/common/snapshot.js';

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

	test('Pressing Escape after inline chat errored with "response filtered" leaves document dirty #7764', async function () {

		const origValue = `class Foo {
	private onError(error: string): void {
		if (/The request timed out|The network connection was lost/i.test(error)) {
			return;
		}

		error = error.replace(/See https:\/\/github\.com\/Squirrel\/Squirrel\.Mac\/issues\/182 for more information/, 'This might mean the application was put on quarantine by macOS. See [this link](https://github.com/microsoft/vscode/issues/7426#issuecomment-425093469) for more information');

		this.notificationService.notify({
			severity: Severity.Error,
			message: error,
			source: nls.localize('update service', "Update Service"),
		});
	}
}`;
		model.setValue(origValue);

		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		const fakeRequest = new class extends mock<IChatRequestModel>() {
			override get id() { return 'one'; }
		};
		session.markModelVersion(fakeRequest);

		assert.strictEqual(editor.getModel().getLineCount(), 15);

		await makeEditAsAi([EditOperation.replace(new Range(7, 1, 7, Number.MAX_SAFE_INTEGER), `error = error.replace(
			/See https:\/\/github\.com\/Squirrel\/Squirrel\.Mac\/issues\/182 for more information/,
			'This might mean the application was put on quarantine by macOS. See [this link](https://github.com/microsoft/vscode/issues/7426#issuecomment-425093469) for more information'
		);`)]);

		assert.strictEqual(editor.getModel().getLineCount(), 18);

		// called when a response errors out
		await session.undoChangesUntil(fakeRequest.id);
		await session.hunkData.recompute({ applied: 0, sha1: 'fakeSha1' }, undefined);

		assert.strictEqual(editor.getModel().getValue(), origValue);

		session.hunkData.discardAll(); // called when dimissing the session
		assert.strictEqual(editor.getModel().getValue(), origValue);
	});

	test('Apply Code\'s preview should be easier to undo/esc #7537', async function () {
		model.setValue(`export function fib(n) {
	if (n <= 0) return 0;
	if (n === 1) return 0;
	if (n === 2) return 1;
	return fib(n - 1) + fib(n - 2);
}`);
		const session = await inlineChatSessionService.createSession(editor, { editMode: EditMode.Live }, CancellationToken.None);
		assertType(session);

		await makeEditAsAi([EditOperation.replace(new Range(5, 1, 6, Number.MAX_SAFE_INTEGER), `
	let a = 0, b = 1, c;
	for (let i = 3; i <= n; i++) {
		c = a + b;
		a = b;
		b = c;
	}
	return b;
}`)]);

		assert.strictEqual(session.hunkData.size, 1);
		assert.strictEqual(session.hunkData.pending, 1);
		assert.ok(session.hunkData.getInfo().every(d => d.getState() === HunkState.Pending));

		await assertSnapshot(editor.getModel().getValue(), { name: '1' });

		await model.undo();
		await assertSnapshot(editor.getModel().getValue(), { name: '2' });

		// overlapping edits (even UNDO) mark edits as accepted
		assert.strictEqual(session.hunkData.size, 1);
		assert.strictEqual(session.hunkData.pending, 0);
		assert.ok(session.hunkData.getInfo().every(d => d.getState() === HunkState.Accepted));

		// no further change when discarding
		session.hunkData.discardAll(); // CANCEL
		await assertSnapshot(editor.getModel().getValue(), { name: '2' });
	});

});
