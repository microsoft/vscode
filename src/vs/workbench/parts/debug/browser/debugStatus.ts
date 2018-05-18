/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IDebugService, State, IDebugConfiguration, VIEWLET_ID } from 'vs/workbench/parts/debug/common/debug';
import { Themable, STATUS_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { STATUS_BAR_DEBUGGING_FOREGROUND, isStatusbarInDebugMode } from 'vs/workbench/parts/debug/browser/statusbarColorProvider';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

const $ = dom.$;

export class DebugStatus extends Themable implements IStatusbarItem {
	private container: HTMLElement;
	private statusBarItem: HTMLElement;
	private label: HTMLElement;
	private icon: HTMLElement;
	private showInStatusBar: string;
	private viewletId: string;

	constructor(
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IDebugService private debugService: IDebugService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IViewletService viewletService: IViewletService
	) {
		super(themeService);
		this._register(this.debugService.getConfigurationManager().onDidSelectConfiguration(e => {
			this.setLabel();
		}));
		this._register(this.debugService.onDidChangeState(state => {
			if (state !== State.Inactive && this.showInStatusBar === 'onFirstSessionStart') {
				this.doRender();
			}
		}));
		this.showInStatusBar = configurationService.getValue<IDebugConfiguration>('debug').showInStatusBar;
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('debug.showInStatusBar')) {
				this.showInStatusBar = configurationService.getValue<IDebugConfiguration>('debug').showInStatusBar;
				if (this.showInStatusBar === 'never' && this.statusBarItem) {
					this.statusBarItem.hidden = true;
				}
				else if (this.showInStatusBar === 'whenViewHidden' && this.viewletId !== VIEWLET_ID) {
					if (!this.statusBarItem) {
						this.doRender();
					}
				}
				else {
					if (this.statusBarItem) {
						this.statusBarItem.hidden = false;
					}
					if (this.showInStatusBar === 'always') {
						this.doRender();
					}
				}
			}
		}));

		this.toDispose.push(viewletService.onDidViewletOpen(e => {
			this.viewletId = e.getId();
			if (this.showInStatusBar === 'whenViewHidden') {
				//Show status bar item if new view is not debug
				if (this.viewletId !== VIEWLET_ID) {
					if (!this.statusBarItem) {
						this.doRender();
					}
				}
				//Remove item if the new view is debug
				else if (this.statusBarItem) {
					this.statusBarItem.remove();
					this.statusBarItem = null;
				}
			}
		}));

		this.toDispose.push(viewletService.onDidViewletClose(e => {
			if (e.getId() === VIEWLET_ID && this.showInStatusBar === 'whenViewHidden') {
				this.doRender();
			}
		}));
	}

	protected updateStyles(): void {
		super.updateStyles();
		if (this.icon) {
			if (isStatusbarInDebugMode(this.debugService)) {
				this.icon.style.backgroundColor = this.getColor(STATUS_BAR_DEBUGGING_FOREGROUND);
			} else {
				this.icon.style.backgroundColor = this.getColor(STATUS_BAR_FOREGROUND);
			}
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
			this._register(dom.addDisposableListener(this.statusBarItem, 'click', () => {
				this.quickOpenService.show('debug ').done(undefined, errors.onUnexpectedError);
			}));
			this.statusBarItem.title = nls.localize('selectAndStartDebug', "Select and start debug configuration");
			const a = dom.append(this.statusBarItem, $('a'));
			this.icon = dom.append(a, $('.icon'));
			this.label = dom.append(a, $('span.label'));
			this.setLabel();
		}

		this.updateStyles();
	}

	private setLabel(): void {
		if (this.label && this.statusBarItem) {
			const manager = this.debugService.getConfigurationManager();
			const name = manager.selectedConfiguration.name;
			const nameAndLaunchPresent = name && manager.selectedConfiguration.launch;
			dom.toggleClass(this.statusBarItem, 'hidden', this.showInStatusBar === 'never' || !nameAndLaunchPresent);
			if (nameAndLaunchPresent) {
				this.label.textContent = manager.getLaunches().length > 1 ? `${name} (${manager.selectedConfiguration.launch.name})` : name;
			}
		}
	}
}
