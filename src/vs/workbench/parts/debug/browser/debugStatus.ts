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
import { IDebugService, State, IDebugConfiguration } from 'vs/workbench/parts/debug/common/debug';
import { Themable, STATUS_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const $ = dom.$;

export class DebugStatus extends Themable implements IStatusbarItem {
	private toDispose: IDisposable[];
	private container: HTMLElement;
	private statusBarItem: HTMLElement;
	private label: HTMLElement;
	private icon: HTMLElement;
	private showInStatusBar: string;

	constructor(
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IDebugService private debugService: IDebugService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(themeService);
		this.toDispose = [];
		this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration(e => {
			this.setLabel();
		}));
		this.toDispose.push(this.debugService.onDidChangeState(state => {
			if (state !== State.Inactive && this.showInStatusBar === 'onFirstSessionStart') {
				this.doRender();
			}
		}));
		this.showInStatusBar = configurationService.getValue<IDebugConfiguration>('debug').showInStatusBar;
		this.toDispose.push(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('debug.showInStatusBar')) {
				this.showInStatusBar = configurationService.getValue<IDebugConfiguration>('debug').showInStatusBar;
				if (this.showInStatusBar === 'never' && this.statusBarItem) {
					this.statusBarItem.hidden = true;
				} else {
					if (this.statusBarItem) {
						this.statusBarItem.hidden = false;
					}
					if (this.showInStatusBar === 'always') {
						this.doRender();
					}
				}
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
		if (this.showInStatusBar === 'always') {
			this.doRender();
		}
		// noop, we render when we decide is best
		return this;
	}

	private doRender(): void {
		if (!this.statusBarItem && this.container) {
			this.statusBarItem = dom.append(this.container, $('.debug-statusbar-item'));
			this.toDispose.push(dom.addDisposableListener(this.statusBarItem, 'click', () => {
				this.quickOpenService.show('debug ').done(undefined, errors.onUnexpectedError);
			}));
			this.statusBarItem.title = nls.localize('selectAndStartDebug', "Select and start debug configuration");
			const a = dom.append(this.statusBarItem, $('a'));
			this.icon = dom.append(a, $('.icon'));
			this.label = dom.append(a, $('span.label'));
			this.setLabel();
			this.updateStyles();
		}
	}

	private setLabel(): void {
		if (this.label && this.statusBarItem) {
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
