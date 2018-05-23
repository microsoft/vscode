/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import * as modes from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { keys } from '../../../base/common/map';
import { IWorkbenchEditorService } from '../../services/editor/common/editorService';
import { ExtHostCommentsShape, ExtHostContext, IExtHostContext, MainContext, MainThreadCommentsShape } from '../node/extHost.protocol';

import { ICommentService } from 'vs/workbench/services/comments/electron-browser/commentService';
import { COMMENTS_PANEL_ID } from 'vs/workbench/parts/comments/electron-browser/commentsPanel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import URI from 'vs/base/common/uri';
import { ReviewController } from 'vs/workbench/parts/comments/electron-browser/commentsEditorContribution';

@extHostNamedCustomer(MainContext.MainThreadComments)
export class MainThreadComments extends Disposable implements MainThreadCommentsShape {

	private _proxy: ExtHostCommentsShape;
	private _documentProviders = new Map<number, IDisposable>();
	private _workspaceProviders = new Map<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private _workbenchEditorService: IWorkbenchEditorService,
		@ICommentService private _commentService: ICommentService,
		@IPanelService private _panelService: IPanelService,
		@ICodeEditorService private _codeEditorService: ICodeEditorService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostComments);
		editorGroupService.onEditorsChanged(e => {
			const outerEditor = this.getFocusedEditor();
			if (!outerEditor) {
				return;
			}

			const controller = ReviewController.get(outerEditor);
			if (!controller) {
				return;
			}

			if (!outerEditor.getModel()) {
				return;
			}

			const outerEditorURI = outerEditor.getModel().uri;
			this.provideDocumentComments(outerEditorURI).then(commentInfos => {
				this._commentService.setComments(outerEditorURI, commentInfos.filter(info => info !== null));
			});

		});
	}

	$registerDocumentCommentProvider(handle: number): void {
		this._documentProviders.set(handle, undefined);

		this._commentService.registerDataProvider(
			handle,
			{
				provideDocumentComments: async (uri, token) => {
					return this._proxy.$provideDocumentComments(handle, uri);
				},
				onDidChangeCommentThreads: null,
				createNewCommentThread: async (uri, range, text, token) => {
					return this._proxy.$createNewCommentThread(handle, uri, range, text);
				},
				replyToCommentThread: async (uri, range, thread, text, token) => {
					return this._proxy.$replyToCommentThread(handle, uri, range, thread, text);
				}
			}
		);
	}

	$registerWorkspaceCommentProvider(handle: number): void {
		this._workspaceProviders.set(handle, undefined);
		this._panelService.setPanelEnablement(COMMENTS_PANEL_ID, true);
		this._panelService.openPanel(COMMENTS_PANEL_ID);
		this._proxy.$provideWorkspaceComments(handle).then(commentThreads => {
			if (commentThreads) {
				this._commentService.setAllComments(commentThreads);
			}
		});
	}

	$unregisterDocumentCommentProvider(handle: number): void {
		this._documentProviders.delete(handle);
		this._commentService.unregisterDataProvider(handle);
	}

	$unregisterWorkspaceCommentProvider(handle: number): void {
		this._workspaceProviders.delete(handle);
		this._panelService.setPanelEnablement(COMMENTS_PANEL_ID, false);
		this._commentService.removeAllComments();
	}

	$onDidCommentThreadsChange(handle: number, event: modes.CommentThreadChangedEvent) {
		// notify comment service
		this._commentService.updateComments(event);
	}

	dispose(): void {
		throw new Error('Method not implemented.');
	}

	getFocusedEditor(): ICodeEditor {
		let editor = this._codeEditorService.getFocusedCodeEditor();
		if (!editor) {
			let activeEditor = this._workbenchEditorService.getActiveEditor();
			if (activeEditor) {
				editor = activeEditor.getControl() as ICodeEditor;
			}
		}

		return editor;
	}

	async provideWorkspaceComments(): Promise<modes.CommentThread[]> {
		const result: modes.CommentThread[] = [];
		for (const handle of keys(this._workspaceProviders)) {
			result.push(...await this._proxy.$provideWorkspaceComments(handle));
		}
		return result;
	}

	async provideDocumentComments(resource: URI): Promise<modes.CommentInfo[]> {
		const result: modes.CommentInfo[] = [];
		for (const handle of keys(this._documentProviders)) {
			result.push(await this._proxy.$provideDocumentComments(handle, resource));
		}
		return result;
	}
}
