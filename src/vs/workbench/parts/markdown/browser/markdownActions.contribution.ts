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
import {FileEditorInputActionContributor} from 'vs/workbench/parts/files/browser/files';
import {asFileResource} from 'vs/workbench/parts/files/common/files';
import strings = require('vs/base/common/strings');
import {IEditorInputActionContext, IEditorInputAction} from 'vs/workbench/browser/parts/editor/baseEditor';
import {OpenPreviewToSideAction, GlobalTogglePreviewMarkdownAction, PreviewMarkdownEditorInputAction, PreviewMarkdownAction} from 'vs/workbench/parts/markdown/browser/markdownActions';
import {MARKDOWN_MIME, MARKDOWN_FILES} from 'vs/workbench/parts/markdown/common/markdown';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

class ExplorerViewerActionContributor extends ActionBarContributor {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		let element = context.element;

		// Contribute only on file resources
		let fileResource = asFileResource(element);
		if (!fileResource) {
			return false;
		}

		return !fileResource.isDirectory && (MARKDOWN_FILES.some((extension) => strings.endsWith(fileResource.resource.fsPath, extension)));
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

class MarkdownFilesActionContributor extends FileEditorInputActionContributor {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super([MARKDOWN_MIME]);
	}

	public hasActionsForEditorInput(context: IEditorInputActionContext): boolean {
		return true;
	}

	public getActionsForEditorInput(context: IEditorInputActionContext): IEditorInputAction[] {
		return [
			this.instantiationService.createInstance(PreviewMarkdownEditorInputAction)
		];
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