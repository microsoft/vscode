/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { isMacintosh, isNative } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWindowsConfiguration } from 'vs/platform/windows/common/windows';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IHostService } from 'vs/workbench/services/host/browser/host';

interface IConfiguration extends IWindowsConfiguration {
	update: { mode: string; };
	telemetry: { enableCrashReporter: boolean };
	workbench: { list: { horizontalScrolling: boolean } };
	debug: { console: { wordWrap: boolean } };
}

export class SettingsChangeRelauncher extends Disposable implements IWorkbenchContribution {

	private titleBarStyle: 'native' | 'custom' | undefined;
	private nativeTabs: boolean | undefined;
	private nativeFullScreen: boolean | undefined;
	private clickThroughInactive: boolean | undefined;
	private updateMode: string | undefined;
	private enableCrashReporter: boolean | undefined;
	private treeHorizontalScrolling: boolean | undefined;
	private debugConsoleWordWrap: boolean | undefined;

	constructor(
		@IHostService private readonly hostService: IHostService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super();

		this.onConfigurationChange(configurationService.getValue<IConfiguration>(), false);
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange(this.configurationService.getValue<IConfiguration>(), true)));
	}

	private onConfigurationChange(config: IConfiguration, notify: boolean): void {
		let changed = false;

		// Tree horizontal scrolling support
		if (typeof config.workbench?.list?.horizontalScrolling === 'boolean' && config.workbench.list.horizontalScrolling !== this.treeHorizontalScrolling) {
			this.treeHorizontalScrolling = config.workbench.list.horizontalScrolling;
			changed = true;
		}

		// Debug console word wrap
		if (typeof config.debug?.console.wordWrap === 'boolean' && config.debug.console.wordWrap !== this.debugConsoleWordWrap) {
			this.debugConsoleWordWrap = config.debug.console.wordWrap;
			changed = true;
		}

		if (isNative) {

			// Titlebar style
			if (typeof config.window?.titleBarStyle === 'string' && config.window?.titleBarStyle !== this.titleBarStyle && (config.window.titleBarStyle === 'native' || config.window.titleBarStyle === 'custom')) {
				this.titleBarStyle = config.window.titleBarStyle;
				changed = true;
			}

			// macOS: Native tabs
			if (isMacintosh && typeof config.window?.nativeTabs === 'boolean' && config.window.nativeTabs !== this.nativeTabs) {
				this.nativeTabs = config.window.nativeTabs;
				changed = true;
			}

			// macOS: Native fullscreen
			if (isMacintosh && typeof config.window?.nativeFullScreen === 'boolean' && config.window.nativeFullScreen !== this.nativeFullScreen) {
				this.nativeFullScreen = config.window.nativeFullScreen;
				changed = true;
			}

			// macOS: Click through (accept first mouse)
			if (isMacintosh && typeof config.window?.clickThroughInactive === 'boolean' && config.window.clickThroughInactive !== this.clickThroughInactive) {
				this.clickThroughInactive = config.window.clickThroughInactive;
				changed = true;
			}

			// Update channel
			if (typeof config.update?.mode === 'string' && config.update.mode !== this.updateMode) {
				this.updateMode = config.update.mode;
				changed = true;
			}

			// Crash reporter
			if (typeof config.telemetry?.enableCrashReporter === 'boolean' && config.telemetry.enableCrashReporter !== this.enableCrashReporter) {
				this.enableCrashReporter = config.telemetry.enableCrashReporter;
				changed = true;
			}
		}

		// Notify only when changed and we are the focused window (avoids notification spam across windows)
		if (notify && changed) {
			this.doConfirm(
				isNative ?
					localize('relaunchSettingMessage', "A setting has changed that requires a restart to take effect.") :
					localize('relaunchSettingMessageWeb', "A setting has changed that requires a reload to take effect."),
				isNative ?
					localize('relaunchSettingDetail', "Press the restart button to restart {0} and enable the setting.", this.productService.nameLong) :
					localize('relaunchSettingDetailWeb', "Press the reload button to reload {0} and enable the setting.", this.productService.nameLong),
				isNative ?
					localize('restart', "&&Restart") :
					localize('restartWeb', "&&Reload"),
				() => this.hostService.restart()
			);
		}
	}

	private async doConfirm(message: string, detail: string, primaryButton: string, confirmed: () => void): Promise<void> {
		if (this.hostService.hasFocus) {
			const res = await this.dialogService.confirm({ type: 'info', message, detail, primaryButton });
			if (res.confirmed) {
				confirmed();
			}
		}
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SettingsChangeRelauncher, LifecyclePhase.Restored);
