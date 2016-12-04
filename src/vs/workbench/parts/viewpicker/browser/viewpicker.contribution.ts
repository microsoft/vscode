/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Registry } from 'vs/platform/platform';
import nls = require('vs/nls');
import { QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions } from 'vs/workbench/browser/quickopen';
import { VIEW_PICKER_PREFIX, OpenViewPickerAction, QuickOpenViewPickerAction } from 'vs/workbench/parts/viewpicker/browser/viewPickerHandler';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/viewpicker/browser/viewPickerHandler',
		'ViewPickerHandler',
		VIEW_PICKER_PREFIX,
		[
			{
				prefix: VIEW_PICKER_PREFIX,
				needsEditor: false,
				description: nls.localize('viewPickerDescription', "Open View")
			}
		]
	)
);

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenViewPickerAction, OpenViewPickerAction.ID, OpenViewPickerAction.LABEL), 'Open View');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenViewPickerAction, QuickOpenViewPickerAction.ID, QuickOpenViewPickerAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_Q, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_Q }, linux: { primary: null } }), 'Quick Open View');
