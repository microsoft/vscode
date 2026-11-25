/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { TestEditorService } from '../../../../../test/browser/workbenchTestServices.js';
import { IChatContentPartRenderContext } from '../../../browser/widget/chatContentParts/chatContentParts.js';
import { DiffEditorPool } from '../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { ChatEditCompareModelFactory, IChatEditPresentationService } from '../../../browser/widget/chatContentParts/chatEditPresentation.js';
import { ChatTextEditContentPart } from '../../../browser/widget/chatContentParts/chatTextEditContentPart.js';
import { DefaultChatEditPresentationService } from '../../../browser/widget/chatContentParts/defaultChatEditPresentation.js';
import { CodeCompareBlockPart, ICodeCompareBlockData } from '../../../browser/widget/chatContentParts/codeBlockPart.js';
import { IChatExternalEdit } from '../../../common/chatService/chatService.js';
import { IChatTextEditGroup } from '../../../common/model/chatModel.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';

suite('Entry-selected chat edit presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = URI.parse('test:/edit.ts');
	const before = URI.parse('test:/before.ts');
	const after = URI.parse('test:/after.ts');
	const edit = upcastPartial<IChatTextEditGroup>({ kind: 'textEditGroup', uri });
	const response = upcastPartial<IChatResponseViewModel>({ setVote: () => { } });
	teardown(() => sinon.restore());

	test('the shared part uses the selected row and forwards layout and disposal without a fallback', () => {
		const widths: number[] = [];
		let disposed = false;
		const row = Object.assign(toDisposable(() => disposed = true), { domNode: dom.$('div'), layout: (width: number) => widths.push(width) });
		const presenter = new class extends mock<IChatEditPresentationService>() {
			override renderTextEdit() { return row; }
		}();
		const part = store.add(new ChatTextEditContentPart(edit, upcastPartial<IChatContentPartRenderContext>({ element: response }), {},
			upcastPartial<DiffEditorPool>({ get: () => assert.fail('Shared code must not choose the default renderer') }), 320,
			{ _serviceBrand: undefined, createModel: async () => assert.fail('Only the selected renderer may request models') }, presenter));
		part.layout(390);
		const nodeMatches = part.domNode === row.domNode;
		part.dispose();
		assert.deepStrictEqual({ nodeMatches, widths, disposed }, { nodeMatches: true, widths: [390], disposed: true });
	});

	for (const disposeBeforeResolution of [false, true]) {
		test(`default row retains compare-model and pool lifetime (early disposal: ${disposeBeforeResolution})`, async () => {
			const model = new DeferredPromise<Awaited<ReturnType<ChatEditCompareModelFactory>>>();
			let modelDisposals = 0;
			let poolDisposals = 0;
			let renderToken = CancellationToken.None;
			let data: ICodeCompareBlockData | undefined;
			const widths: number[] = [];
			const codeBlock = upcastPartial<CodeCompareBlockPart>({
				element: dom.$('div'),
				render: async (value, width, token) => { data = value; widths.push(width); renderToken = token; },
				layout: width => { assert.ok(width !== undefined); widths.push(width); },
			});
			const pool = upcastPartial<DiffEditorPool>({
				get: () => ({
					object: codeBlock, isStale: () => poolDisposals > 0, dispose: () => { poolDisposals++; },
				})
			});
			const presenter = new DefaultChatEditPresentationService(store.add(new TestEditorService()), new class extends mock<ITextModelService>() { }());
			const row = store.add(presenter.renderTextEdit(edit, response, () => model.p, pool, 320));
			row.layout(390);
			if (disposeBeforeResolution) {
				row.dispose();
			}
			await model.complete({
				object: { originalSha1: 'sha', original: upcastPartial<IResolvedTextEditorModel>({}), modified: upcastPartial<IResolvedTextEditorModel>({}) },
				dispose: () => { modelDisposals++; },
			});
			const resolved = await data!.diffData;
			row.dispose();
			assert.deepStrictEqual({ widths, resolved: !!resolved, modelDisposals, poolDisposals, cancelled: renderToken.isCancellationRequested }, {
				widths: [320, 390], resolved: !disposeBeforeResolution, modelDisposals: 1, poolDisposals: 1, cancelled: true,
			});
		});
	}

	for (const scenario of [
		{ kind: 'edit', original: before, modified: after, removed: 1, originalLength: 10, expected: { original: { resource: before }, modified: { resource: after } } },
		{ kind: 'edit', original: before, modified: after, removed: 0, originalLength: 0, expected: { resource: uri } },
		{ kind: 'create', original: undefined, modified: after, removed: 0, originalLength: 0, expected: { resource: uri } },
		{ kind: 'delete', original: before, modified: undefined, removed: 1, originalLength: 10, expected: { resource: before } },
	] satisfies { kind: IChatExternalEdit['editKind']; original: URI | undefined; modified: URI | undefined; removed: number; originalLength: number; expected: object }[]) {
		test(`default external ${scenario.kind} preserves editor targets (${scenario.removed} removed)`, async () => {
			const editor = store.add(new TestEditorService());
			const opened = sinon.stub(editor, 'openEditor').resolves(undefined);
			let referencesDisposed = 0;
			const textModels = new class extends mock<ITextModelService>() {
				override async createModelReference() {
					return {
						object: upcastPartial<IResolvedTextEditorModel>({ textEditorModel: upcastPartial<ITextModel>({ getValueLength: () => scenario.originalLength }) }),
						dispose: () => { referencesDisposed++; },
					};
				}
			}();
			const presenter = new DefaultChatEditPresentationService(editor, textModels);
			const options = { preserveFocus: true, pinned: false };
			await presenter.openExternalEdit(upcastPartial<IChatExternalEdit>({
				uri, editKind: scenario.kind, beforeContentUri: scenario.original, afterContentUri: scenario.modified, diff: { added: 1, removed: scenario.removed },
			}), { editorOptions: options, openToSide: true });
			assert.deepStrictEqual({ calls: opened.getCalls().map(call => call.args), referencesDisposed }, {
				calls: [[{ ...scenario.expected, options }, SIDE_GROUP]],
				referencesDisposed: scenario.kind === 'edit' && scenario.removed === 0 ? 1 : 0,
			});
		});
	}

	test('an external editor failure rejects instead of appearing to succeed', async () => {
		const editor = store.add(new TestEditorService());
		sinon.stub(editor, 'openEditor').rejects(new Error('Editor unavailable'));
		const presenter = new DefaultChatEditPresentationService(editor, new class extends mock<ITextModelService>() { }());
		await assert.rejects(presenter.openExternalEdit(upcastPartial<IChatExternalEdit>({ uri }), { editorOptions: {}, openToSide: false }), /Editor unavailable/);
	});
});
