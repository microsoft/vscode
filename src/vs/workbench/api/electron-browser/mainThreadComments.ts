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
	private _providers = new Map<number, IDisposable>();

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
			this.provideComments(outerEditorURI).then(commentInfos => {
				this._commentService.setComments(outerEditorURI, commentInfos);
			});

			for (const handle of keys(this._providers)) {
				_commentService.registerDataProvider({
					provideAllComments: async (token) => {
						return await this._proxy.$provideAllComments(handle);
					},
					provideComments: async (model, token) => {
						return this._proxy.$provideComments(handle, model.uri);
					},
					onDidChangeCommentThreads: null
				});
			}
		});
	}

	$registerCommentProvider(handle: number): void {
		this._providers.set(handle, undefined);
		// Fetch all comments
		this._proxy.$provideAllComments(handle).then(commentThreads => {
			if (commentThreads) {
				this._commentService.setAllComments(commentThreads);
				this._panelService.setPanelEnablement(COMMENTS_PANEL_ID, true);
			}
		});
	}

	$onDidCommentThreadsChange(handle: number, event: modes.CommentThreadChangedEvent) {
		// notify comment service
		this._commentService.updateComments(event);
	}

	$unregisterCommentProvider(handle: number): void {
		this._providers.delete(handle);
		this._panelService.setPanelEnablement(COMMENTS_PANEL_ID, false);
		this._commentService.removeAllComments();
	}

	dispose(): void {
		throw new Error('Method not implemented.');
	}

	getFocusedEditor(): ICodeEditor {
		let editor = this._codeEditorService.getFocusedCodeEditor();
		if (!editor) {
			editor = this._workbenchEditorService.getActiveEditor().getControl() as ICodeEditor;
		}

		return editor;
	}

	async provideAllComments(): Promise<modes.CommentThread[]> {
		const result: modes.CommentThread[] = [];
		for (const handle of keys(this._providers)) {
			result.push(...await this._proxy.$provideAllComments(handle));
		}
		return result;
	}

	async provideComments(resource: URI): Promise<modes.CommentInfo[]> {
		const result: modes.CommentInfo[] = [];
		for (const handle of keys(this._providers)) {
			result.push(await this._proxy.$provideComments(handle, resource));
		}
		return result;
	}
}
