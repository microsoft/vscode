/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';

import { IActionRunner, IAction, Action } from 'vs/base/common/actions';
import { SelectActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachSelectBoxStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { selectBorder } from 'vs/platform/theme/common/colorRegistry';
import { IRemoteExplorerService } from 'vs/workbench/services/remote/common/remoteExplorerService';

export class SwitchRemoteViewItem extends SelectActionViewItem {

	actionRunner!: IActionRunner;

	constructor(
		action: IAction,
		@IThemeService private readonly themeService: IThemeService,
		@IContextViewService contextViewService: IContextViewService,
		@IRemoteExplorerService remoteExplorerService: IRemoteExplorerService
	) {
		super(null, action, [{ text: 'wsl' }, { text: 'dev-container' }], 0, contextViewService, { ariaLabel: nls.localize('remotes', 'Switch Remote') });
		this._register(attachSelectBoxStyler(this.selectBox, themeService, {
			selectBackground: SIDE_BAR_BACKGROUND
		}));
		// TODO: set from saved state
		remoteExplorerService.targetType = 'wsl';
	}

	render(container: HTMLElement) {
		super.render(container);
		dom.addClass(container, 'switch-remote');
		this._register(attachStylerCallback(this.themeService, { selectBorder }, colors => {
			container.style.border = colors.selectBorder ? `1px solid ${colors.selectBorder}` : '';
		}));
	}
}

export class SwitchRemoteAction extends Action {

	public static readonly ID = 'remote.explorer.switch';
	public static readonly LABEL = nls.localize('remote.explorer.switch', "Switch Remote");

	constructor(
		id: string, label: string,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService
	) {
		super(id, label);
	}

	public async run(item: string): Promise<any> {
		this.remoteExplorerService.targetType = item;
	}
}
