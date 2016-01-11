/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/outputactions.contribution';
import nls = require('vs/nls');
import {BaseActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {Registry} from 'vs/platform/platform';
import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions} from 'vs/workbench/browser/actionBarRegistry';
import {Action} from 'vs/base/common/actions';
import {IEditorInputAction, IEditorInputActionContext, EditorInputActionContributor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {OutputEditorInput} from 'vs/workbench/parts/output/browser/outputEditorInput';
import {ClearOutputEditorAction, ToggleOutputAction, GlobalShowOutputAction, SwitchOutputActionItem, SwitchOutputAction, ClearOutputAction} from 'vs/workbench/parts/output/browser/outputActions';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

class OutputEditorActionContributor extends EditorInputActionContributor {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasActionsForEditorInput(context: IEditorInputActionContext): boolean {
		return context.input instanceof OutputEditorInput;
	}

	public getActionsForEditorInput(context: IEditorInputActionContext): IEditorInputAction[] {
		let actions: IEditorInputAction[] = [];

		actions.push(this.instantiationService.createInstance(SwitchOutputAction));
		actions.push(this.instantiationService.createInstance(ClearOutputAction));

		return actions;
	}

	public getActionItem(context: any, action: Action): BaseActionItem {
		if (action.id === SwitchOutputAction.ID) {
			return this.instantiationService.createInstance(SwitchOutputActionItem, action, context.input);
		}

		return super.getActionItem(context, action);
	}
}

let actionRegistry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
let actionBarRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);

// register show output action globally
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalShowOutputAction, GlobalShowOutputAction.ID, GlobalShowOutputAction.LABEL), nls.localize('viewCategory', "View"));

actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleOutputAction, ToggleOutputAction.ID, ToggleOutputAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_U,
	linux: {
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_H  // On Ubuntu Ctrl+Shift+U is taken by some global OS command
	}
}), nls.localize('viewCategory', "View"));

// Contribute Output Editor Contributor
actionBarRegistry.registerActionBarContributor(Scope.EDITOR, OutputEditorActionContributor);

// Contribute to Context Menu of Output Window
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ClearOutputEditorAction, ClearOutputEditorAction.ID, nls.localize('clearOutput.label', "Clear Output")));
