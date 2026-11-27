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
import { IRange } from '../../../../../editor/common/core/range.js';
import { Comment, CommentInput, CommentThread } from '../../../../../editor/common/languages.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createCodeEditorServices, instantiateTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IMenu, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestMenuService } from '../../../../test/browser/workbenchTestServices.js';
import { CommentMenus } from '../../browser/commentMenus.js';
import { CommentReply } from '../../browser/commentReply.js';
import { ICommentService } from '../../browser/commentService.js';
import { SimpleCommentEditor } from '../../browser/simpleCommentEditor.js';

suite('CommentReply', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const existingComment: Comment = { body: 'Existing comment', uniqueIdInThread: 1, userName: 'Reviewer' };

	teardown(() => sinon.restore());

	/**
	 * Creates a reply whose comment editor has an Upload File action, which runs `runEditorAction`.
	 */
	async function createReply(hasExistingComments = true, options?: { focus?: boolean; runEditorAction?: () => Promise<void> }) {
		const instantiationService = createCodeEditorServices(store);
		const model = store.add(createTextModel(''));
		const editor = store.add(instantiateTestCodeEditor(instantiationService, model));
		const onDidChangeInput = store.add(new Emitter<CommentInput | undefined>());
		// Like a real editor, the editor reports losing focus when focus leaves its DOM node.
		const editorDomNode = dom.$('div');
		sinon.stub(editor, 'getDomNode').returns(editorDomNode);
		sinon.stub(editor, 'onDidBlurEditorWidget').value(store.add(dom.trackFocus(editorDomNode)).onDidBlur);
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
			getCommentController: () => undefined,
			setActiveEditingCommentThread: () => { },
			setActiveCommentAndThread: async () => { }
		});
		instantiationService.stub(ICommandService, { executeCommand: async () => { await options?.runEditorAction?.(); } });
		const uploadAction = instantiationService.createInstance(MenuItemAction, { id: 'test.uploadFile', title: 'Upload File' }, undefined, undefined, undefined, undefined);
		instantiationService.stub(IMenuService, new class extends TestMenuService {
			override createMenu(id: MenuId, contextKeyService: IContextKeyService): IMenu {
				const menu = super.createMenu(id, contextKeyService);
				return id === MenuId.CommentEditorActions ? { ...menu, getActions: () => [['inline', [uploadAction]]] } : menu;
			}
		});
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
		// The real comment editor is created in the reply's form.
		container.querySelector('.comment-form')!.appendChild(editorDomNode);

		return { reply, container, editorDomNode, onDidChangeInput, model, thread, focus, layout };
	}

	/**
	 * Dispatches the focus events of focus moving from one element to another, and lets focus tracking catch up, as it
	 * reports focus leaving on the next turn.
	 */
	async function moveFocus(from: HTMLElement | undefined, to: HTMLElement | undefined): Promise<void> {
		from?.dispatchEvent(new FocusEvent('blur'));
		to?.dispatchEvent(new FocusEvent('focus'));
		await timeout(0);
	}

	test('collapses an empty reply on blur and can expand it again', async () => {
		const { container, editorDomNode } = await createReply();
		const formContainer = container.querySelector('.comment-form-container')!;
		const button = container.querySelector<HTMLButtonElement>('.review-thread-reply-button')!;
		const expanded = [formContainer.classList.contains('expand')];
		await moveFocus(undefined, button);
		expanded.push(formContainer.classList.contains('expand'));
		// Expanding the reply moves focus to its editor, which focus then leaves.
		await moveFocus(button, editorDomNode);
		await moveFocus(editorDomNode, undefined);
		expanded.push(formContainer.classList.contains('expand'));
		button.click();
		expanded.push(formContainer.classList.contains('expand'));

		assert.deepStrictEqual(expanded, [false, true, false, true]);
	});

	test('preserves a nonempty reply on blur', async () => {
		const { reply, container, editorDomNode, model } = await createReply();
		reply.expandReplyAreaAndFocusCommentEditor();
		await moveFocus(undefined, editorDomNode);
		model.setValue('Draft reply');
		await moveFocus(editorDomNode, undefined);

		assert.deepStrictEqual({
			expanded: container.querySelector('.comment-form-container')!.classList.contains('expand'),
			value: model.getValue()
		}, { expanded: true, value: 'Draft reply' });
	});

	test('keeps an empty reply expanded while focus moves to its actions', async () => {
		const { container, editorDomNode } = await createReply();
		const formContainer = container.querySelector('.comment-form-container')!;
		const uploadButton = container.querySelector<HTMLElement>('.editor-actions .monaco-button')!;
		container.querySelector<HTMLElement>('.review-thread-reply-button')!.click();
		await moveFocus(undefined, editorDomNode);
		await moveFocus(editorDomNode, uploadButton);
		const expanded = [formContainer.classList.contains('expand')];
		await moveFocus(uploadButton, undefined);
		expanded.push(formContainer.classList.contains('expand'));

		assert.deepStrictEqual(expanded, [true, false]);
	});

	test('keeps an empty reply expanded while one of its actions runs, such as to show a file dialog', async () => {
		const upload = new DeferredPromise<void>();
		const { container, editorDomNode } = await createReply(true, { runEditorAction: () => upload.p });
		const formContainer = container.querySelector('.comment-form-container')!;
		container.querySelector<HTMLElement>('.review-thread-reply-button')!.click();
		await moveFocus(undefined, editorDomNode);
		container.querySelector<HTMLElement>('.editor-actions .monaco-button')!.click();
		// The file dialog takes focus.
		await moveFocus(editorDomNode, undefined);
		const expanded = [formContainer.classList.contains('expand')];
		// Focus returns to the reply when the dialog is canceled.
		await upload.complete();
		await moveFocus(undefined, editorDomNode);
		await moveFocus(editorDomNode, undefined);
		expanded.push(formContainer.classList.contains('expand'));

		assert.deepStrictEqual(expanded, [true, false]);
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
		const { reply, container, editorDomNode, onDidChangeInput, model, thread } = await createReply(false);
		// Updating the thread creates the reply button (and its blur listener) even for a new thread
		reply.updateCommentThread(thread);
		const formContainer = container.querySelector('.comment-form-container')!;
		const expanded = [formContainer.classList.contains('expand')];
		await moveFocus(undefined, editorDomNode);
		await moveFocus(editorDomNode, undefined);
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
