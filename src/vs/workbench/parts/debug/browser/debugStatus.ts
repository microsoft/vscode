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
import { IDebugService } from 'vs/workbench/parts/debug/common/debug';
import { Themable, STATUS_BAR_FOREGROUND } from 'vs/workbench/common/theme';

const $ = dom.$;
const MAX_LABEL_LENGTH = 17;

export class DebugStatus extends Themable implements IStatusbarItem {
	private toDispose: IDisposable[];
	private label: HTMLElement;
	private icon: HTMLElement;

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
	}

	protected updateStyles(): void {
		super.updateStyles();
		this.icon.style.backgroundColor = this.getColor(STATUS_BAR_FOREGROUND);
	}

	public render(container: HTMLElement): IDisposable {
		const statusBarItem = dom.append(container, $('.debug-statusbar-item'));
		this.toDispose.push(dom.addDisposableListener(statusBarItem, 'click', () => {
			this.quickOpenService.show('debug ').done(undefined, errors.onUnexpectedError);
		}));
		statusBarItem.title = nls.localize('debug', "Debug");
		this.icon = dom.append(statusBarItem, $('.icon'));
		this.label = dom.append(statusBarItem, $('span.label'));
		this.setLabel();
		this.updateStyles();

		return this;
	}

	private setLabel(): void {
		if (this.label) {
			let name = this.debugService.getConfigurationManager().selectedName || '';
			if (name.length > MAX_LABEL_LENGTH) {
				name = name.substring(0, MAX_LABEL_LENGTH) + '...';
			}
			this.label.textContent = name;
		}
	}

	public dispose(): void {
		super.dispose();
		this.toDispose = dispose(this.toDispose);
	}
}
