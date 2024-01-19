/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TestDiffProviderFactoryService } from 'vs/editor/browser/diff/testDiffProviderFactoryService';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffProviderFactoryService } from 'vs/editor/browser/widget/diffEditor/diffProviderFactoryService';
import { Range } from 'vs/editor/common/core/range';
import { ILanguageService } from 'vs/editor/common/languages/language';
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
import { IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { IChatAccessibilityService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IInlineChatSavingService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSavingService';
import { HunkState, ReplyResponse, Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionService';
import { InlineChatSessionServiceImpl } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionServiceImpl';
import { EditMode, IInlineChatEditResponse, IInlineChatService, InlineChatResponseType, InlineChatResponseTypes } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { CancellationToken } from 'vs/base/common/cancellation';
import { assertType } from 'vs/base/common/types';
import { InlineChatServiceImpl } from 'vs/workbench/contrib/inlineChat/common/inlineChatServiceImpl';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { DiffAlgorithmName, IEditorWorkerService, ILineChange } from 'vs/editor/common/services/editorWorker';
import { IDocumentDiff, IDocumentDiffProviderOptions } from 'vs/editor/common/diff/documentDiffProvider';
import { EditorSimpleWorker } from 'vs/editor/common/services/editorSimpleWorker';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { MovedText } from 'vs/editor/common/diff/linesDiffComputer';
import { LineRangeMapping, DetailedLineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';


suite('ReplyResponse', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Inline chat widget should not contain Accept and Discard buttons for responses which do not include changes. #3143', async function () {
		const textFileService = new class extends mock<ITextFileService>() { };
		const languageService = new class extends mock<ILanguageService>() { };

		const message = { value: 'hello' };
		const emptyMessage = { value: '' };

		const raw: IInlineChatEditResponse = {
			type: InlineChatResponseType.EditorEdit,
			edits: [],
			message: emptyMessage,
			id: 1234
		};

		{
			const res2 = new ReplyResponse(raw, emptyMessage, URI.parse('test:uri'), 1, [], '1', textFileService, languageService);
			assert.strictEqual(res2.responseType, InlineChatResponseTypes.Empty);
		}
		{
			const res1 = new ReplyResponse({ ...raw, message }, message, URI.parse('test:uri'), 1, [], '1', textFileService, languageService);
			assert.strictEqual(res1.responseType, InlineChatResponseTypes.OnlyMessages);
		}
		{
			const res3 = new ReplyResponse({ ...raw, edits: [{ text: 'EDIT', range: new Range(1, 1, 1, 1) }] }, emptyMessage, URI.parse('test:uri'), 1, [], '1', textFileService, languageService);
			assert.strictEqual(res3.responseType, InlineChatResponseTypes.OnlyEdits);
		}
		{
			const res4 = new ReplyResponse({ ...raw, edits: [{ text: 'EDIT', range: new Range(1, 1, 1, 1) }], message }, message, URI.parse('test:uri'), 1, [], '1', textFileService, languageService);
			assert.strictEqual(res4.responseType, InlineChatResponseTypes.Mixed);
		}
	});
});

class TestWorkerService extends mock<IEditorWorkerService>() {

	private readonly _worker = new EditorSimpleWorker(null!, null);

	constructor(@IModelService private readonly _modelService: IModelService) {
		super();
	}

	override async computeDiff(original: URI, modified: URI, options: IDocumentDiffProviderOptions, algorithm: DiffAlgorithmName): Promise<IDocumentDiff | null> {

		const originalModel = this._modelService.getModel(original);
		const modifiedModel = this._modelService.getModel(modified);

		assertType(originalModel);
		assertType(modifiedModel);

		this._worker.acceptNewModel({
			url: originalModel.uri.toString(),
			versionId: originalModel.getVersionId(),
			lines: originalModel.getLinesContent(),
			EOL: originalModel.getEOL(),
		});

		this._worker.acceptNewModel({
			url: modifiedModel.uri.toString(),
			versionId: modifiedModel.getVersionId(),
			lines: modifiedModel.getLinesContent(),
			EOL: modifiedModel.getEOL(),
		});

		const result = await this._worker.computeDiff(originalModel.uri.toString(), modifiedModel.uri.toString(), options, algorithm);
		if (!result) {
			return result;
		}
		// Convert from space efficient JSON data to rich objects.
		const diff: IDocumentDiff = {
			identical: result.identical,
			quitEarly: result.quitEarly,
			changes: toLineRangeMappings(result.changes),
			moves: result.moves.map(m => new MovedText(
				new LineRangeMapping(new LineRange(m[0], m[1]), new LineRange(m[2], m[3])),
				toLineRangeMappings(m[4])
			))
		};
		return diff;

		function toLineRangeMappings(changes: readonly ILineChange[]): readonly DetailedLineRangeMapping[] {
			return changes.map(
				(c) => new DetailedLineRangeMapping(
					new LineRange(c[0], c[1]),
					new LineRange(c[2], c[3]),
					c[4]?.map(
						(c) => new RangeMapping(
							new Range(c[0], c[1], c[2], c[3]),
							new Range(c[4], c[5], c[6], c[7])
						)
					)
				)
			);
		}
	}
}

suite('InlineChatSession', function () {

	const store = new DisposableStore();
	let editor: IActiveCodeEditor;
	let model: ITextModel;
	let instaService: TestInstantiationService;
	let inlineChatService: InlineChatServiceImpl;

	let inlineChatSessionService: IInlineChatSessionService;

	setup(function () {
		const contextKeyService = new MockContextKeyService();
		inlineChatService = new InlineChatServiceImpl(contextKeyService);

		const serviceCollection = new ServiceCollection(
			[IEditorWorkerService, new SyncDescriptor(TestWorkerService)],
			[IInlineChatService, inlineChatService],
			[IContextKeyService, contextKeyService],
			[IDiffProviderFactoryService, new SyncDescriptor(TestDiffProviderFactoryService)],
			[IInlineChatSessionService, new SyncDescriptor(InlineChatSessionServiceImpl)],
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
			}]
		);

		store.add(inlineChatService.addProvider({
			debugName: 'Unit Test',
			label: 'Unit Test',
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

		instaService = store.add(workbenchInstantiationService(undefined, store).createChild(serviceCollection));
		inlineChatSessionService = store.add(instaService.get(IInlineChatSessionService));

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
		await session.hunkData.recompute();
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
	});

});
