/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

'use strict';

import { Disposable } from 'vs/base/common/lifecycle';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { format } from 'vs/base/common/strings';
import { IPartService } from 'vs/workbench/services/part/common/partService';
// import { ProgressState } from 'vs/workbench/browser/parts/editor/editorGroupsControl';
// import { INotificationActions } from 'vs/platform/notification/common/notification';
// import { isErrorWithActions } from 'vs/base/common/errors';
// import { toErrorMessage } from 'vs/base/common/errorMessage';

class ProgressMonitor {

	constructor(private _token: number, private progressPromise: TPromise<void>) { }

	public get token(): number {
		return this._token;
	}

	public cancel(): void {
		this.progressPromise.cancel();
	}
}

export class NextEditorViewer extends Disposable {
	private editorOpenToken: number;
	private visibleEditor: BaseEditor;

	constructor(
		private container: HTMLElement,
		private group: EditorGroup,
		@IPartService private partService: IPartService
	) {
		super();

		this.editorOpenToken = 0;
	}

	openEditor(input: EditorInput, options?: EditorOptions): TPromise<BaseEditor> {

		// We need an editor descriptor for the input
		const descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(input);
		if (!descriptor) {
			return TPromise.wrapError<BaseEditor>(new Error(format('Can not find a registered editor for the input {0}', input)));
		}

		// Progress Monitor & Ref Counting
		this.editorOpenToken++;
		const editorOpenToken = this.editorOpenToken;
		const monitor = new ProgressMonitor(editorOpenToken, TPromise.timeout(this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */).then(() => {
			// TODO@grid progress
			// this.editorGroupsControl.updateProgress(position, ProgressState.INFINITE);
		}));

		// Show editor
		// const editor = this.doShowEditor(descriptor, input, options, [] /* ratio */, monitor);
		// if (!editor) {
		// 	return TPromise.wrap<BaseEditor>(null); // canceled or other error
		// }

		// // Set input to editor
		// const inputPromise = this.doSetInput(editor, input, options, monitor);

		return TPromise.as(void 0); /* inputPromise;*/
	}
}