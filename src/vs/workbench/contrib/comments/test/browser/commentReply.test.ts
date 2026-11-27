/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { Comment, CommentInput, CommentThread } from '../../../../../editor/common/languages.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createCodeEditorServices, instantiateTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestMenuService } from '../../../../test/browser/workbenchTestServices.js';
import { CommentMenus } from '../../browser/commentMenus.js';
import { CommentReply } from '../../browser/commentReply.js';
import { ICommentController, ICommentService } from '../../browser/commentService.js';
import { SimpleCommentEditor } from '../../browser/simpleCommentEditor.js';

suite('CommentReply', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const existingComment: Comment = { body: 'Existing comment', uniqueIdInThread: 1, userName: 'Reviewer' };

	teardown(() => sinon.restore());

	async function createReply(hasExistingComments = true, options?: { focus?: boolean; commentController?: ICommentController }) {
		const instantiationService = createCodeEditorServices(store);
		const model = store.add(createTextModel(''));
		const editor = store.add(instantiateTestCodeEditor(instantiationService, model));
		const onDidBlurEditorWidget = store.add(new Emitter<void>());
		const onDidChangeInput = store.add(new Emitter<CommentInput | undefined>());
		sinon.stub(editor, 'onDidBlurEditorWidget').value(onDidBlurEditorWidget.event);
		sinon.stub(editor, 'getDomNode').returns(dom.$('div'));
		const focus = sinon.spy(editor, 'focus');
		const layout = sinon.spy(editor, 'layout');
		instantiationService.stubInstance<ICodeEditor>(SimpleCommentEditor, editor);
		instantiationService.stub(ITextModelService, {
			createModelReference: async () => ({
				object: new class extends mock<IResolvedTextEditorModel>() {
					override readonly textEditorModel = model;
				},
				dispose: () => { }
			})
		});
		instantiationService.stub(ICommentService, {
			getCommentController: () => options?.commentController,
			setActiveEditingCommentThread: () => { },
			setActiveCommentAndThread: async () => { }
		});
		instantiationService.stub(IMenuService, new TestMenuService());
		instantiationService.stub(IContextMenuService, {});
		const thread = new class extends mock<CommentThread<IRange>>() {
			override comments: ReadonlyArray<Comment> | undefined = hasExistingComments ? [existingComment] : [];
			override readonly canReply = true;
			override readonly onDidChangeInput = onDidChangeInput.event;
		};
		const container = dom.$('div');
		const reply = store.add(instantiationService.createInstance(
			CommentReply<IRange>, 'test', container, { getLayoutInfo: () => ({ height: 500 }) },
			thread, instantiationService, instantiationService.get(IContextKeyService),
			store.add(instantiationService.createInstance(CommentMenus)), undefined, undefined,
			{ submitComment: async () => { }, collapse: () => { } }, !!options?.focus, null
		));
		await reply.whenInitialized;

		return { reply, container, onDidBlurEditorWidget, onDidChangeInput, model, thread, editor, focus, layout };
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

	test('keeps an empty new thread expanded on blur and when the input is cleared', async () => {
		const { reply, container, onDidBlurEditorWidget, onDidChangeInput, model, thread } = await createReply(false);
		// Updating the thread creates the reply button (and its blur listener) even for a new thread
		reply.updateCommentThread(thread);
		const formContainer = container.querySelector('.comment-form-container')!;
		const expanded = [formContainer.classList.contains('expand')];
		onDidBlurEditorWidget.fire();
		expanded.push(formContainer.classList.contains('expand'));
		model.setValue('Draft comment');
		onDidChangeInput.fire({ uri: model.uri, value: '' });
		expanded.push(formContainer.classList.contains('expand'));

		assert.deepStrictEqual({
			expanded,
			hasReplyButton: !!container.querySelector('.review-thread-reply-button'),
			value: model.getValue()
		}, { expanded: [true, true, true], hasReplyButton: true, value: '' });
	});

	test('collapses an untouched reply area when a new thread receives its first comments', async () => {
		const { reply, container, model, thread } = await createReply(false);
		const formContainer = container.querySelector('.comment-form-container')!;
		const expanded = [formContainer.classList.contains('expand')];
		thread.comments = [existingComment];
		reply.updateCommentThread(thread);
		expanded.push(formContainer.classList.contains('expand'));

		assert.deepStrictEqual({
			expanded,
			hasReplyButton: !!container.querySelector('.review-thread-reply-button'),
			value: model.getValue()
		}, { expanded: [true, false], hasReplyButton: true, value: '' });
	});

	test('keeps a draft expanded when a new thread receives its first comments', async () => {
		const { reply, container, model, thread } = await createReply(false);
		model.setValue('Draft comment');
		thread.comments = [existingComment];
		reply.updateCommentThread(thread);

		assert.deepStrictEqual({
			expanded: container.querySelector('.comment-form-container')!.classList.contains('expand'),
			value: model.getValue()
		}, { expanded: true, value: 'Draft comment' });
	});

	test('takes no other input while an action of its form runs', async () => {
		const submission = new DeferredPromise<void>();
		const submissions: string[] = [];
		const commentController = new class extends mock<ICommentController>() {
			override readonly id = 'test';
			override getSubmitCommentThreadLabel() {
				return 'Submit';
			}
			override submitCommentThread(_thread: CommentThread, body: string) {
				submissions.push(body);
				return submission.p;
			}
		};
		const { reply, container, model, editor } = await createReply(false, { commentController });
		const button = container.querySelector<HTMLElement>('.other-actions .monaco-button')!;
		const getState = () => ({
			submissions: [...submissions],
			isButtonDisabled: button.getAttribute('aria-disabled') === 'true',
			isReadOnly: editor.getOption(EditorOption.readOnly),
			value: model.getValue(),
		});
		model.setValue('Draft comment');
		button.click();
		await timeout(0);
		button.click();
		await reply.submitComment();
		const whileRunning = getState();
		submission.complete();
		await timeout(0);
		const afterwards = getState();
		model.setValue('Next comment');

		assert.deepStrictEqual({ whileRunning, afterwards, withNextComment: getState() }, {
			whileRunning: { submissions: ['Draft comment'], isButtonDisabled: true, isReadOnly: true, value: 'Draft comment' },
			afterwards: { submissions: ['Draft comment'], isButtonDisabled: true, isReadOnly: false, value: '' },
			withNextComment: { submissions: ['Draft comment'], isButtonDisabled: false, isReadOnly: false, value: 'Next comment' },
		});
	});

	test('sizes the editor to its form, or by the thread\'s width when the form is not rendered', async () => {
		const { reply, container, layout } = await createReply();
		reply.layout(500);
		const widths = [layout.lastCall.args[0]?.width];
		container.style.width = '300px';
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		reply.layout(500);
		widths.push(layout.lastCall.args[0]?.width);

		assert.deepStrictEqual(widths, [446, 300]);
	});

	test('focuses a new comment that was initialized outside the document once it is in the document', async () => {
		const { reply, container, focus } = await createReply(false, { focus: true });
		const focusCounts = [focus.callCount];
		reply.focusIfPending();
		focusCounts.push(focus.callCount);
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		reply.focusIfPending();
		focusCounts.push(focus.callCount);
		reply.focusIfPending();
		focusCounts.push(focus.callCount);

		assert.deepStrictEqual(focusCounts, [0, 0, 1, 1]);
	});
});
