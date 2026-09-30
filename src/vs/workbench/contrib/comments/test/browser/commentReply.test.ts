/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { CommentInput, CommentThread } from '../../../../../editor/common/languages.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createCodeEditorServices, instantiateTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestMenuService } from '../../../../test/browser/workbenchTestServices.js';
import { CommentMenus } from '../../browser/commentMenus.js';
import { CommentReply } from '../../browser/commentReply.js';
import { ICommentService } from '../../browser/commentService.js';
import { SimpleCommentEditor } from '../../browser/simpleCommentEditor.js';

suite('CommentReply', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	async function createReply(hasExistingComments = true) {
		const instantiationService = createCodeEditorServices(store);
		const model = store.add(createTextModel(''));
		const editor = store.add(instantiateTestCodeEditor(instantiationService, model));
		const onDidBlurEditorWidget = store.add(new Emitter<void>());
		const onDidChangeInput = store.add(new Emitter<CommentInput | undefined>());
		sinon.stub(editor, 'onDidBlurEditorWidget').value(onDidBlurEditorWidget.event);
		sinon.stub(editor, 'getDomNode').returns(dom.$('div'));
		instantiationService.stubInstance(SimpleCommentEditor, editor);
		instantiationService.stub(ITextModelService, {
			createModelReference: async () => ({
				object: new class extends mock<IResolvedTextEditorModel>() {
					override readonly textEditorModel = model;
				},
				dispose: () => { }
			})
		});
		instantiationService.stub(ICommentService, {
			getCommentController: () => undefined,
			setActiveEditingCommentThread: () => { },
			setActiveCommentAndThread: () => { }
		});
		instantiationService.stub(IMenuService, new TestMenuService());
		instantiationService.stub(IContextMenuService, {});
		const thread = new class extends mock<CommentThread<IRange>>() {
			override readonly comments = hasExistingComments ? [{ body: 'Existing comment', uniqueIdInThread: 1, userName: 'Reviewer' }] : [];
			override readonly canReply = true;
			override readonly onDidChangeInput = onDidChangeInput.event;
		};
		const container = dom.$('div');
		const reply = store.add(instantiationService.createInstance(
			CommentReply<IRange>, 'test', container, { getLayoutInfo: () => ({ height: 500 }) },
			thread, instantiationService, instantiationService.get(IContextKeyService),
			store.add(instantiationService.createInstance(CommentMenus)), undefined, undefined,
			{ submitComment: async () => { }, collapse: () => { } }, false, null
		));
		await Promise.resolve();

		return { reply, container, onDidBlurEditorWidget, onDidChangeInput, model };
	}

	test('collapses an empty reply on blur and can expand it again', async () => {
		const { container, onDidBlurEditorWidget } = await createReply();
		const formContainer = container.querySelector('.comment-form-container')!;
		const button = container.querySelector<HTMLButtonElement>('.review-thread-reply-button')!;
		const expanded = [formContainer.classList.contains('expand')];
		button.dispatchEvent(new FocusEvent('focus'));
		expanded.push(formContainer.classList.contains('expand'));
		onDidBlurEditorWidget.fire();
		expanded.push(formContainer.classList.contains('expand'));
		button.click();
		expanded.push(formContainer.classList.contains('expand'));

		assert.deepStrictEqual(expanded, [false, true, false, true]);
	});

	test('preserves a nonempty reply on blur', async () => {
		const { reply, container, onDidBlurEditorWidget, model } = await createReply();
		reply.expandReplyAreaAndFocusCommentEditor();
		model.setValue('Draft reply');
		onDidBlurEditorWidget.fire();

		assert.deepStrictEqual({
			expanded: container.querySelector('.comment-form-container')!.classList.contains('expand'),
			value: model.getValue()
		}, { expanded: true, value: 'Draft reply' });
	});

	test('collapses when the thread input is cleared', async () => {
		const { reply, container, onDidChangeInput, model } = await createReply();
		reply.expandReplyAreaAndFocusCommentEditor();
		model.setValue('Draft reply');
		onDidChangeInput.fire({ uri: model.uri, value: '' });

		assert.deepStrictEqual({
			expanded: container.querySelector('.comment-form-container')!.classList.contains('expand'),
			value: model.getValue()
		}, { expanded: false, value: '' });
	});

	test('keeps an empty new thread expanded on blur', async () => {
		const { container, onDidBlurEditorWidget } = await createReply(false);
		onDidBlurEditorWidget.fire();

		assert.deepStrictEqual({
			expanded: container.querySelector('.comment-form-container')!.classList.contains('expand'),
			replyButton: container.querySelector('.review-thread-reply-button')
		}, { expanded: true, replyButton: null });
	});
});
