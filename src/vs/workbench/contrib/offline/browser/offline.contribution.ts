/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { STATUS_BAR_FOREGROUND, STATUS_BAR_BORDER } from 'vs/workbench/common/theme';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { localize } from 'vs/nls';
import { combinedDisposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { DomEmitter } from 'vs/base/browser/event';
import { IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';

export const STATUS_BAR_OFFLINE_BACKGROUND = registerColor('statusBar.offlineBackground', {
	dark: '#6c1717',
	light: '#6c1717',
	hcDark: '#6c1717',
	hcLight: '#6c1717'
}, localize('statusBarOfflineBackground', "Status bar background color when the workbench is offline. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_OFFLINE_FOREGROUND = registerColor('statusBar.offlineForeground', {
	dark: STATUS_BAR_FOREGROUND,
	light: STATUS_BAR_FOREGROUND,
	hcDark: STATUS_BAR_FOREGROUND,
	hcLight: STATUS_BAR_FOREGROUND
}, localize('statusBarOfflineForeground', "Status bar foreground color when the workbench is offline. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_OFFLINE_BORDER = registerColor('statusBar.offlineBorder', {
	dark: STATUS_BAR_BORDER,
	light: STATUS_BAR_BORDER,
	hcDark: STATUS_BAR_BORDER,
	hcLight: STATUS_BAR_BORDER
}, localize('statusBarOfflineBorder', "Status bar border color separating to the sidebar and editor when the workbench is offline. The status bar is shown in the bottom of the window"));

export class OfflineStatusBarController implements IWorkbenchContribution {

	private readonly disposables = new DisposableStore();
	private disposable: IDisposable | undefined;

	private set enabled(enabled: boolean) {
		if (enabled === !!this.disposable) {
			return;
		}

		if (enabled) {
			this.disposable = combinedDisposable(
				this.statusbarService.overrideStyle({
					priority: 100,
					foreground: STATUS_BAR_OFFLINE_FOREGROUND,
					background: STATUS_BAR_OFFLINE_BACKGROUND,
					border: STATUS_BAR_OFFLINE_BORDER,
				}),
				this.statusbarService.addEntry({
					name: 'Offline Indicator',
					text: '$(debug-disconnect) Offline',
					ariaLabel: 'Network is offline.',
					tooltip: localize('offline', "Network appears to be offline, certain features might be unavailable.")
				}, 'offline', StatusbarAlignment.LEFT, 10000)
			);
		} else {
			this.disposable!.dispose();
			this.disposable = undefined;
		}
	}

	constructor(
		@IDebugService private readonly debugService: IDebugService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) {
		Event.any(
			this.disposables.add(new DomEmitter(window, 'online')).event,
			this.disposables.add(new DomEmitter(window, 'offline')).event
		)(this.update, this, this.disposables);

		this.debugService.onDidChangeState(this.update, this, this.disposables);
		this.contextService.onDidChangeWorkbenchState(this.update, this, this.disposables);
		this.update();
	}

	protected update(): void {
		this.enabled = !navigator.onLine;
	}

	dispose(): void {
		this.disposable?.dispose();
		this.disposables.dispose();
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench)
	.registerWorkbenchContribution(OfflineStatusBarController, LifecyclePhase.Restored);
