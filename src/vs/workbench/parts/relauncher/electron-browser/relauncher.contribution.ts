/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/platform';
import { IMessageService } from 'vs/platform/message/common/message';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { IWindowsService, IWindowService } from "vs/platform/windows/common/windows";
import { IConfigurationService } from "vs/platform/configuration/common/configuration";
import { IWindowConfiguration } from "vs/workbench/electron-browser/common";
import { localize } from "vs/nls";
import { IEnvironmentService } from "vs/platform/environment/common/environment";

interface IConfiguration extends IWindowConfiguration {
	update: { channel: string; };
	telemetry: { enableCrashReporter: boolean };
}

export class SettingsChangeRelauncher implements IWorkbenchContribution {

	private toDispose: IDisposable[] = [];

	private titleBarStyle: 'native' | 'custom';
	private updateChannel: string;
	private enableCrashReporter: boolean;

	constructor(
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IEnvironmentService private envService: IEnvironmentService,
		@IMessageService private messageService: IMessageService
	) {
		this.onConfigurationChange(configurationService.getConfiguration<IConfiguration>(), false);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationChange(e.config, true)));
	}

	private onConfigurationChange(config: IConfiguration, notify: boolean): void {
		let changed = false;

		// Titlebar style
		if (config.window && config.window.titleBarStyle !== this.titleBarStyle && (config.window.titleBarStyle === 'native' || config.window.titleBarStyle === 'custom')) {
			this.titleBarStyle = config.window.titleBarStyle;
			changed = true;
		}

		// Update channel
		if (config.update && typeof config.update.channel === 'string' && config.update.channel !== this.updateChannel) {
			this.updateChannel = config.update.channel;
			changed = true;
		}

		// Crash reporter
		if (config.telemetry && typeof config.telemetry.enableCrashReporter === 'boolean' && config.telemetry.enableCrashReporter !== this.enableCrashReporter) {
			this.enableCrashReporter = config.telemetry.enableCrashReporter;
			changed = true;
		}

		// Notify only when changed and we are the focused window (avoids notification spam across windows)
		if (notify && changed) {
			this.windowService.isFocused().then(focused => {
				if (focused) {
					const relaunch = this.messageService.confirm({
						type: 'info',
						message: localize('relaunchMessage', "A setting has changed that requires a restart to take effect."),
						detail: localize('relaunchDetail', "Press the restart button to restart {0} and enable the setting.", this.envService.appNameLong),
						primaryButton: localize('restart', "Restart")
					});

					if (relaunch) {
						this.windowsService.relaunch(Object.create(null));
					}
				}
			});
		}
	}

	getId(): string {
		return 'workbench.relauncher';
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

const workbenchRegistry = <IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SettingsChangeRelauncher);
