/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { clamp } from '../../../../base/common/numbers.js';
import { setGlobalSashSize, setGlobalHoverDelay } from '../../../../base/browser/ui/sash/sash.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';

export const minSize = 1;
export const maxSize = 20; // see also https://ux.stackexchange.com/questions/39023/what-is-the-optimum-button-size-of-touch-screen-applications

export class SashSettingsController implements IWorkbenchContribution, IDisposable {

	private readonly disposables = new DisposableStore();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService private readonly layoutService: ILayoutService
	) {
		const onDidChangeSize = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('workbench.sash.size'));
		onDidChangeSize(this.onDidChangeSize, this, this.disposables);
		this.onDidChangeSize();

		const onDidChangeHoverDelay = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('workbench.sash.hoverDelay'));
		onDidChangeHoverDelay(this.onDidChangeHoverDelay, this, this.disposables);
		this.onDidChangeHoverDelay();
	}

	private onDidChangeSize(): void {
		const configuredSize = this.configurationService.getValue<number>('workbench.sash.size');
		const size = clamp(configuredSize, 4, 20);
		const hoverSize = clamp(configuredSize, 1, 8);

		this.layoutService.mainContainer.style.setProperty('--vscode-sash-size', size + 'px');
		this.layoutService.mainContainer.style.setProperty('--vscode-sash-hover-size', hoverSize + 'px');
		setGlobalSashSize(size);
	}

	private onDidChangeHoverDelay(): void {
		setGlobalHoverDelay(this.configurationService.getValue<number>('workbench.sash.hoverDelay'));
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
