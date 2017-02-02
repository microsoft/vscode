/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/platform';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';



class UnsupportedWorkspaceSettingsContribution implements IWorkbenchContribution {

	private static storageKey = 'workspace.settings.unsupported.warning';
	private toDispose: IDisposable[] = [];
	private isUntrusted = false;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkspaceConfigurationService private workspaceConfigurationService: IWorkspaceConfigurationService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IStorageService private storageService: IStorageService
	) {
		lifecycleService.onShutdown(this.dispose, this);
		this.toDispose.push(this.workspaceConfigurationService.onDidUpdateConfiguration(e => this.checkWorkspaceSettings()));
	}

	getId(): string {
		return 'unsupportedWorkspaceSettings';
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	private checkWorkspaceSettings(): void {
		if (this.isUntrusted) {
			return;
		}

		const configurationKeys = this.workspaceConfigurationService.getUnsupportedWorkspaceKeys();
		this.isUntrusted = configurationKeys.length > 0;
		if (this.isUntrusted && !this.hasShownWarning()) {
			this.showWarning(configurationKeys);
		}
	}

	private hasShownWarning(): boolean {
		return this.storageService.getBoolean(UnsupportedWorkspaceSettingsContribution.storageKey, StorageScope.WORKSPACE, false);
	}

	private rememberWarningWasShown(): void {
		this.storageService.store(UnsupportedWorkspaceSettingsContribution.storageKey, true, StorageScope.WORKSPACE);
	}

	private showWarning(unsupportedKeys: string[]): void {
		const message = nls.localize('unsupportedWorkspaceSettings', 'This Workspace contains settings that can only be set in User Settings. ({0})', unsupportedKeys.join(', '));

		const openWorkspaceSettings = new Action('unsupportedWorkspaceSettings.openWorkspaceSettings', nls.localize('openWorkspaceSettings', 'Open Workspace Settings'), '', true, () => {
			this.telemetryService.publicLog('workspace.settings.unsupported.review');
			this.rememberWarningWasShown();
			return this.preferencesService.openWorkspaceSettings();
		});

		const openDocumentation = new Action('unsupportedWorkspaceSettings.openDocumentation', nls.localize('openDocumentation', 'Learn More'), '', true, () => {
			this.telemetryService.publicLog('workspace.settings.unsupported.documentation');
			this.rememberWarningWasShown();
			window.open('https://go.microsoft.com/fwlink/?linkid=839878'); // Don't change link.
			return TPromise.as(true);
		});

		const close = new Action('unsupportedWorkspaceSettings.Ignore', nls.localize('ignore', 'Ignore'), '', true, () => {
			this.telemetryService.publicLog('workspace.settings.unsupported.ignore');
			this.rememberWarningWasShown();
			return TPromise.as(true);
		});

		const actions = [openWorkspaceSettings, openDocumentation, close];
		this.messageService.show(Severity.Warning, { message, actions });
		this.telemetryService.publicLog('workspace.settings.unsupported.warning');
	}
}

const workbenchRegistry = <IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UnsupportedWorkspaceSettingsContribution);
