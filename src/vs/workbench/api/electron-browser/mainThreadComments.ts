/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor, isCodeEditor, isDiffEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import * as modes from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { keys } from 'vs/base/common/map';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ExtHostCommentsShape, ExtHostContext, IExtHostContext, MainContext, MainThreadCommentsShape } from '../node/extHost.protocol';

import { ICommentService } from 'vs/workbench/parts/comments/electron-browser/commentService';
import { COMMENTS_PANEL_ID } from 'vs/workbench/parts/comments/electron-browser/commentsPanel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { URI } from 'vs/base/common/uri';
import { ReviewController } from 'vs/workbench/parts/comments/electron-browser/commentsEditorContribution';

@extHostNamedCustomer(MainContext.MainThreadComments)
export class MainThreadComments extends Disposable implements MainThreadCommentsShape {
	private _disposables: IDisposable[];
	private _proxy: ExtHostCommentsShape;
	private _documentProviders = new Map<number, IDisposable>();
	private _workspaceProviders = new Map<number, IDisposable>();
	private _firstSessionStart: boolean;

	constructor(
		extHostContext: IExtHostContext,
		@IEditorService private _editorService: IEditorService,
		@ICommentService private _commentService: ICommentService,
		@IPanelService private _panelService: IPanelService,
		@ICodeEditorService private _codeEditorService: ICodeEditorService
	) {
		super();
		this._disposables = [];
		this._firstSessionStart = true;
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostComments);
		this._disposables.push(this._editorService.onDidActiveEditorChange(e => {
			const editors = this.getFocusedEditors();
			if (!editors || !editors.length) {
				return;
			}

			editors.forEach(editor => {
				const controller = ReviewController.get(editor);
				if (!controller) {
					return;
				}

				if (!editor.getModel()) {
					return;
				}

				const outerEditorURI = editor.getModel().uri;
				this.provideDocumentComments(outerEditorURI).then(commentInfos => {
					this._commentService.setDocumentComments(outerEditorURI, commentInfos.filter(info => info !== null));
				});
			});
		}));
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
				},
				editComment: async (uri, comment, text, token) => {
					return this._proxy.$editComment(handle, uri, comment, text);
				},
				deleteComment: async (uri, comment, token) => {
					return this._proxy.$deleteComment(handle, uri, comment);
				}
			}
		);
	}

	$registerWorkspaceCommentProvider(handle: number): void {
		this._workspaceProviders.set(handle, undefined);
		this._panelService.setPanelEnablement(COMMENTS_PANEL_ID, true);
		if (this._firstSessionStart) {
			this._panelService.openPanel(COMMENTS_PANEL_ID);
			this._firstSessionStart = false;
		}
		this._proxy.$provideWorkspaceComments(handle).then(commentThreads => {
			if (commentThreads) {
				this._commentService.setWorkspaceComments(handle, commentThreads);
			}
		});
	}

	$unregisterDocumentCommentProvider(handle: number): void {
		this._documentProviders.delete(handle);
		this._commentService.unregisterDataProvider(handle);
	}

	$unregisterWorkspaceCommentProvider(handle: number): void {
		this._workspaceProviders.delete(handle);
		if (this._workspaceProviders.size === 0) {
			this._panelService.setPanelEnablement(COMMENTS_PANEL_ID, false);
		}
		this._commentService.removeWorkspaceComments(handle);
	}

	$onDidCommentThreadsChange(handle: number, event: modes.CommentThreadChangedEvent) {
		// notify comment service
		this._commentService.updateComments(event);
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		this._workspaceProviders.forEach(value => dispose(value));
		this._workspaceProviders.clear();
		this._documentProviders.forEach(value => dispose(value));
		this._documentProviders.clear();
	}

	getFocusedEditors(): ICodeEditor[] {
		let activeControl = this._editorService.activeControl;
		if (activeControl) {
			if (isCodeEditor(activeControl.getControl())) {
				return [this._editorService.activeControl.getControl() as ICodeEditor];
			}

			if (isDiffEditor(activeControl.getControl())) {
				let diffEditor = activeControl.getControl() as IDiffEditor;
				return [diffEditor.getOriginalEditor(), diffEditor.getModifiedEditor()];
			}
		}

		let editor = this._codeEditorService.getFocusedCodeEditor();

		if (editor) {
			return [editor];
		}
		return [];
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
