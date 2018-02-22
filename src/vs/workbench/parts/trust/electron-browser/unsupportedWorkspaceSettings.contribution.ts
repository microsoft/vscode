/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IChoiceService, Choice } from 'vs/platform/dialogs/common/dialogs';
import { Severity } from 'vs/platform/notification/common/notification';

class UnsupportedWorkspaceSettingsContribution implements IWorkbenchContribution {

	private static readonly storageKey = 'workspace.settings.unsupported.warning';
	private toDispose: IDisposable[] = [];
	private isUntrusted = false;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IWorkspaceConfigurationService private workspaceConfigurationService: IWorkspaceConfigurationService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IChoiceService private choiceService: IChoiceService,
		@IStorageService private storageService: IStorageService
	) {
		lifecycleService.onShutdown(this.dispose, this);
		this.toDispose.push(this.workspaceConfigurationService.onDidChangeConfiguration(e => this.checkWorkspaceSettings()));
		this.toDispose.push(workspaceContextService.onDidChangeWorkspaceFolders(e => this.checkWorkspaceSettings()));
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
		const choices: Choice[] = [nls.localize('openWorkspaceSettings', 'Open Workspace Settings'), { label: nls.localize('dontShowAgain', 'Don\'t Show Again') }];
		this.choiceService.choose(Severity.Warning, nls.localize('unsupportedWorkspaceSettings', 'This Workspace contains settings that can only be set in User Settings ({0}). Click [here]({1}) to learn more.', unsupportedKeys.join(', '), 'https://go.microsoft.com/fwlink/?linkid=839878'), choices).then(choice => {
			switch (choice) {
				case 0 /* Open Workspace Settings */:
					this.rememberWarningWasShown();
					this.preferencesService.openWorkspaceSettings();
					break;
				case 1 /* Never show again */:
					this.rememberWarningWasShown();
					break;
			}
		});
	}
}

const workbenchRegistry = <IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UnsupportedWorkspaceSettingsContribution, LifecyclePhase.Running);
