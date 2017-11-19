/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { WebviewSelectAllAction } from 'vs/workbench/parts/html/browser/webviewAction';
import { KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS } from 'vs/workbench/parts/html/browser/webviewEditor';

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(
		WebviewSelectAllAction,
		WebviewSelectAllAction.ID,
		WebviewSelectAllAction.LABEL,
		{ primary: KeyMod.CtrlCmd | KeyCode.KEY_A },
		KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS
	),
	'Webview: Select All'
);
