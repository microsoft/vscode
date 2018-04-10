/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ITextModel } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { ReviewController } from 'vs/editor/contrib/review/review';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { keys } from '../../../base/common/map';
import { IWorkbenchEditorService } from '../../services/editor/common/editorService';
import { ExtHostCommentsShape, ExtHostContext, IExtHostContext, MainContext, MainThreadCommentsShape } from '../node/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadComments)
export class MainThreadComments extends Disposable implements MainThreadCommentsShape {

	private _proxy: ExtHostCommentsShape;
	private _providers = new Map<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private _workbenchEditorService: IWorkbenchEditorService,
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

			this.provideComments(outerEditor.getModel()).then(commentThreads => {
				controller.setComments(commentThreads);
			});
		});
	}

	$registerCommentProvider(handle: number): void {
		this._providers.set(handle, undefined);
	}

	$unregisterCommentProvider(handle: number): void {
		throw new Error('Method not implemented.');
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

	async provideComments(model: ITextModel): Promise<modes.CommentThread[]> {
		const result: modes.CommentThread[] = [];
		for (const handle of keys(this._providers)) {
			result.push(...await this._proxy.$providerComments(handle, model.uri));
		}
		return result;
	}
}
