/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {IAction} from 'vs/base/common/actions';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {asFileResource, FileEditorInput} from 'vs/workbench/parts/files/common/files';
import mime = require('vs/base/common/mime');
import {IEditorInputActionContext, IEditorInputAction, EditorInputActionContributor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {OpenPreviewToSideAction, GlobalTogglePreviewMarkdownAction, PreviewMarkdownEditorInputAction, PreviewMarkdownAction} from 'vs/workbench/parts/markdown/browser/markdownActions';
import {MARKDOWN_MIME} from 'vs/workbench/parts/markdown/common/markdown';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

class ExplorerViewerActionContributor extends ActionBarContributor {

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		let element = context.element;

		// Contribute only on file resources
		let fileResource = asFileResource(element);
		if (!fileResource) {
			return false;
		}

		return !fileResource.isDirectory && mime.guessMimeTypes(fileResource.resource.fsPath).indexOf(MARKDOWN_MIME) >= 0;
	}

	public getSecondaryActions(context: any): IAction[] {
		let actions: IAction[] = [];

		if (this.hasSecondaryActions(context)) {
			let fileResource = asFileResource(context.element);

			// Open Markdown
			let action = this.instantiationService.createInstance(PreviewMarkdownAction, fileResource.resource);
			action.order = 0; // on top of other actions
			actions.push(action);
		}

		return actions;
	}
}

class MarkdownFilesActionContributor extends EditorInputActionContributor {

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	/* We override toId() to make the caching of actions based on the mime of the input if given */
	protected toId(context: IEditorInputActionContext): string {
		let id = super.toId(context);

		let mime = this.getMimeFromContext(context);
		if (mime) {
			id += mime;
		}

		return id;
	}

	private getMimeFromContext(context: IEditorInputActionContext): string {
		if (context && context.input && context.input instanceof FileEditorInput) {
			let fileInput = <FileEditorInput>context.input;
			return fileInput.getMime();
		}

		return null;
	}

	public hasActionsForEditorInput(context: IEditorInputActionContext): boolean {
		const input = context.input;
		if (input instanceof FileEditorInput) {
			const fileResource = input.getResource();

			return mime.guessMimeTypes(fileResource.fsPath).indexOf(MARKDOWN_MIME) >= 0;
		}

		return false;
	}

	public getActionsForEditorInput(context: IEditorInputActionContext): IEditorInputAction[] {
		if (this.hasActionsForEditorInput(context)) {
			return [
				this.instantiationService.createInstance(PreviewMarkdownEditorInputAction)
			];
		}

		return [];
	}
}

// Contribute to viewers and editors of markdown files
let actionBarRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, ExplorerViewerActionContributor);
actionBarRegistry.registerActionBarContributor(Scope.EDITOR, MarkdownFilesActionContributor);

let category = nls.localize('markdown', "Markdown");

let workbenchActionsRegistry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalTogglePreviewMarkdownAction, GlobalTogglePreviewMarkdownAction.ID, GlobalTogglePreviewMarkdownAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_V }), category);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviewToSideAction, OpenPreviewToSideAction.ID, OpenPreviewToSideAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_V) }), category);