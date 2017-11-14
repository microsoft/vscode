/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IDebugService, State } from 'vs/workbench/parts/debug/common/debug';
import { Themable, STATUS_BAR_FOREGROUND } from 'vs/workbench/common/theme';

const $ = dom.$;

export class DebugStatus extends Themable implements IStatusbarItem {
	private toDispose: IDisposable[];
	private container: HTMLElement;
	private label: HTMLElement;
	private icon: HTMLElement;
	private hidden = true;

	constructor(
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IDebugService private debugService: IDebugService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);
		this.toDispose = [];
		this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration(e => {
			this.setLabel();
		}));
		this.toDispose.push(this.debugService.onDidChangeState(state => {
			if (state !== State.Inactive && this.hidden) {
				this.hidden = false;
				this.render(this.container);
			}
		}));
	}

	protected updateStyles(): void {
		super.updateStyles();
		if (this.icon) {
			this.icon.style.backgroundColor = this.getColor(STATUS_BAR_FOREGROUND);
		}
	}

	public render(container: HTMLElement): IDisposable {
		this.container = container;
		if (!this.hidden) {
			const statusBarItem = dom.append(container, $('.debug-statusbar-item'));
			this.toDispose.push(dom.addDisposableListener(statusBarItem, 'click', () => {
				this.quickOpenService.show('debug ').done(undefined, errors.onUnexpectedError);
			}));
			statusBarItem.title = nls.localize('selectAndStartDebug', "Select and start debug configuration");
			const a = dom.append(statusBarItem, $('a'));
			this.icon = dom.append(a, $('.icon'));
			this.label = dom.append(a, $('span.label'));
			this.setLabel();
			this.updateStyles();
		}

		return this;
	}

	private setLabel(): void {
		if (this.label && !this.hidden) {
			const manager = this.debugService.getConfigurationManager();
			const name = manager.selectedName || '';
			this.label.textContent = manager.getLaunches().length > 1 ? `${name} (${manager.selectedLaunch.workspace.name})` : name;
		}
	}

	public dispose(): void {
		super.dispose();
		this.toDispose = dispose(this.toDispose);
	}
}
