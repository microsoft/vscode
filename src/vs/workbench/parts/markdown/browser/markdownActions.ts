/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/markdownactions';
import {TPromise} from 'vs/base/common/winjs.base';
import {Action} from 'vs/base/common/actions';
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import nls = require('vs/nls');
import {FileEditorInput} from 'vs/workbench/parts/files/common/files';
import {EditorInputAction} from 'vs/workbench/browser/parts/editor/baseEditor';
import {getUntitledOrFileResource} from 'vs/workbench/common/editor';
import {MarkdownEditorInput} from 'vs/workbench/parts/markdown/common/markdownEditorInput';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, Severity} from 'vs/platform/message/common/message';

export class GlobalTogglePreviewMarkdownAction extends Action {

	public static ID = 'workbench.action.markdown.togglePreview';
	public static LABEL = nls.localize('toggleMarkdownPreview', "Toggle Preview");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let activeInput = this.editorService.getActiveEditorInput();

		// View source if we are in a markdown file already
		if (activeInput instanceof MarkdownEditorInput) {
			this.editorService.openEditor({
				resource: activeInput.getResource()
			}).done(null, errors.onUnexpectedError);
		}

		// Otherwise try to open as markdown preview
		else {
			let msg: string;

			let resource = getUntitledOrFileResource(activeInput);
			if (resource) {
				let action = this.instantiationService.createInstance(PreviewMarkdownAction, resource);
				action.run().done(() => action.dispose(), errors.onUnexpectedError);
			} else {
				msg = nls.localize('markdownPreviewNoFile', "Open a Markdown file first to show a preview.");
			}

			if (msg) {
				this.messageService.show(Severity.Info, msg);
			}
		}


		return TPromise.as(true);
	}
}

export class OpenPreviewToSideAction extends Action {

	public static ID = 'workbench.action.markdown.openPreviewSideBySide';
	public static LABEL = nls.localize('openPreviewSideBySide', "Open Preview to the Side");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let activeInput = this.editorService.getActiveEditorInput();

		// Do nothing if already in markdown preview
		if (activeInput instanceof MarkdownEditorInput) {
			return TPromise.as(true);
		}

		// Otherwise try to open as markdown preview to the side
		else {
			let msg: string;

			let resource = getUntitledOrFileResource(activeInput);
			if (resource) {
				let input = this.instantiationService.createInstance(MarkdownEditorInput, resource, void 0, void 0);

				return this.editorService.openEditor(input, null, true /* to the side */);
			} else {
				msg = nls.localize('markdownPreviewNoFile', "Open a Markdown file first to show a preview.");
			}

			if (msg) {
				this.messageService.show(Severity.Info, msg);
			}
		}


		return TPromise.as(true);
	}
}

export class PreviewMarkdownAction extends Action {
	private markdownResource: URI;

	constructor(
		markdownResource: URI,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super('workbench.markdown.action.previewFromExplorer', nls.localize('openPreview', "Open Preview"));

		this.markdownResource = markdownResource;
	}

	public run(event?: any): TPromise<any> {
		let input = this.instantiationService.createInstance(MarkdownEditorInput, this.markdownResource, void 0, void 0);

		return this.editorService.openEditor(input);
	}
}

export class PreviewMarkdownEditorInputAction extends EditorInputAction {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super('workbench.markdown.action.previewFromEditor', nls.localize('openPreview', "Open Preview"));

		this.class = 'markdown-action action-preview';
		this.order = 100; // far end
	}

	public run(event?: any): TPromise<any> {
		let input = <FileEditorInput>this.input;

		let sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		let markdownInput = this.instantiationService.createInstance(MarkdownEditorInput, input.getResource(), void 0, void 0);

		return this.editorService.openEditor(markdownInput, null, sideBySide);
	}
}