/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/markdownactions';
import {Promise} from 'vs/base/common/winjs.base';
import {Action} from 'vs/base/common/actions';
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import paths = require('vs/base/common/paths');
import nls = require('vs/nls');
import {FileEditorInput} from 'vs/workbench/parts/files/common/files';
import {EditorInputAction} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorOptions, getUntitledOrFileResource} from 'vs/workbench/common/editor';
import {MarkdownEditorInput} from 'vs/workbench/parts/markdown/browser/markdownEditorInput';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';

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

	public run(event?: any): Promise {
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


		return Promise.as(true);
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

	public run(event?: any): Promise {
		let activeInput = this.editorService.getActiveEditorInput();

		// Do nothing if already in markdown preview
		if (activeInput instanceof MarkdownEditorInput) {
			return Promise.as(true);
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


		return Promise.as(true);
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

	public run(event?: any): Promise {
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

	public run(event?: any): Promise {
		let input = <FileEditorInput>this.input;

		let sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		let markdownInput = this.instantiationService.createInstance(MarkdownEditorInput, input.getResource(), void 0, void 0);

		return this.editorService.openEditor(markdownInput, null, sideBySide);
	}
}

export class ShowWelcomeAction extends Action {

	public static ID = 'workbench.action.markdown.showWelcome';
	public static LABEL = nls.localize('showWelcome', "Show Welcome");

	private preserveFocus: boolean;
	private welcomePageResource: URI;

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IPartService private partService: IPartService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);

		this.preserveFocus = false;

		const env = contextService.getConfiguration().env;
		if (env.welcomePage) {
			this.welcomePageResource = URI.file(paths.join(env.appRoot, env.welcomePage));
		}

		this.enabled = !!this.welcomePageResource;
	}

	public setPreserveFocus(preserveFocus: boolean) {
		this.preserveFocus = preserveFocus;
	}

	public run(): Promise {
		return this.partService.joinCreation().then(() => {
			let editorCount = this.editorService.getVisibleEditors().length;

			let markdownInput = this.instantiationService.createInstance(MarkdownEditorInput, this.welcomePageResource, nls.localize('welcome', "Welcome"), nls.localize('vscode', "Getting Started"));

			let options = new EditorOptions();
			options.preserveFocus = this.preserveFocus;

			return this.editorService.openEditor(markdownInput, options, editorCount !== 0 && editorCount !== 3);
		});
	}
}