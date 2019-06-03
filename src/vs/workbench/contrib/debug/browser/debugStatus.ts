/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IDebugService, State, IDebugConfiguration } from 'vs/workbench/contrib/debug/common/debug';
import { Themable } from 'vs/workbench/common/theme';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { OcticonLabel } from 'vs/base/browser/ui/octiconLabel/octiconLabel';

const $ = dom.$;

export class DebugStatus extends Themable implements IStatusbarItem {
	private container: HTMLElement;
	private statusBarItem: HTMLElement;
	private label: OcticonLabel;
	private showInStatusBar: 'never' | 'always' | 'onFirstSessionStart';

	constructor(
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService,
		@IDebugService private readonly debugService: IDebugService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(themeService);
		this._register(this.debugService.getConfigurationManager().onDidSelectConfiguration(e => {
			this.setLabel();
		}));
		this._register(this.debugService.onDidChangeState(state => {
			if (state !== State.Inactive && this.showInStatusBar === 'onFirstSessionStart') {
				this.doRender();
			} else {
				if (this.showInStatusBar !== 'never') {
					this.updateStyles();
				}
			}
		}));
		this.showInStatusBar = configurationService.getValue<IDebugConfiguration>('debug').showInStatusBar;
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('debug.showInStatusBar')) {
				this.showInStatusBar = configurationService.getValue<IDebugConfiguration>('debug').showInStatusBar;
				if (this.showInStatusBar === 'always') {
					this.doRender();
				}
				if (this.statusBarItem) {
					dom.toggleClass(this.statusBarItem, 'hidden', this.showInStatusBar === 'never');
				}
			}
		}));
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
			this._register(dom.addDisposableListener(this.statusBarItem, 'click', () => this.quickOpenService.show('debug ')));
			this.statusBarItem.title = nls.localize('selectAndStartDebug', "Select and start debug configuration");
			const a = dom.append(this.statusBarItem, $('a'));
			this.label = new OcticonLabel(a);
			this.setLabel();
		}

		this.updateStyles();
	}

	private setLabel(): void {
		if (this.label && this.statusBarItem) {
			const manager = this.debugService.getConfigurationManager();
			const name = manager.selectedConfiguration.name || '';
			const nameAndLaunchPresent = name && manager.selectedConfiguration.launch;
			dom.toggleClass(this.statusBarItem, 'hidden', this.showInStatusBar === 'never' || !nameAndLaunchPresent);
			if (nameAndLaunchPresent) {
				this.label.text = '$(play) ' + (manager.getLaunches().length > 1 ? `${name} (${manager.selectedConfiguration.launch!.name})` : name);
			}
		}
	}
}
