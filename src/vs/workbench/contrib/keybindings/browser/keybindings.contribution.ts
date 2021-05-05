/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { rendererLogChannelId } from 'vs/workbench/contrib/logs/common/logConstants';
import { IOutputService } from 'vs/workbench/contrib/output/common/output';

class ToggleKeybindingsLogAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleKeybindingsLog',
			title: { value: nls.localize('toggleKeybindingsLog', "Toggle Keyboard Shortcuts Troubleshooting"), original: 'Toggle Keyboard Shortcuts Troubleshooting' },
			category: CATEGORIES.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		const logging = accessor.get(IKeybindingService).toggleLogging();
		if (logging) {
			const outputService = accessor.get(IOutputService);
			outputService.showChannel(rendererLogChannelId);
		}
	}
}

registerAction2(ToggleKeybindingsLogAction);
