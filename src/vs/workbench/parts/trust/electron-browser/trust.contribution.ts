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
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';


class TrustContribution implements IWorkbenchContribution {

	private toDispose: IDisposable[] = [];
	private isUntrusted = false;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkspaceConfigurationService private workspaceConfigurationService: IWorkspaceConfigurationService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		lifecycleService.onShutdown(this.dispose, this);
		this.toDispose.push(this.workspaceConfigurationService.onDidUpdateConfiguration(e => this.checkWorkspaceTrust()));
		this.checkWorkspaceTrust();
	}

	getId(): string {
		return 'trust';
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	private checkWorkspaceTrust(): void {
		const wasUntrusted = this.isUntrusted;
		this.isUntrusted = this.workspaceConfigurationService.getUntrustedConfigurations().length > 0;
		if (this.isUntrusted && !wasUntrusted) {
			this.showTrustWarning();
		}
	}

	private updateUserSettings(): TPromise<void> {
		const key = 'security.workspacesTrustedToSpecifyExecutables';
		const path = this.workspaceContextService.getWorkspace().resource.path;

		const value = this.configurationService.lookup(key).user || {};
		value[path] = true;

		return this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: key, value: value }, { writeToBuffer: true, autoSave: false });
	}

	private showTrustWarning(): void {
		const message = nls.localize('untrustedWorkspace', "This workspace specifies executables. While the workspace is untrusted, these settings are being ignored.");

		const openWorkspaceSettings = new Action('trust.openWorkspaceSettings', nls.localize('openWorkspaceSettings', 'Review Settings'), '', true, () => {
			return this.preferencesService.openWorkspaceSettings().then(() => false);
		});

		const trustWorkspace = new Action('trust.trustWorkspace', nls.localize('trustWorkspace', 'Trust Workspace'), '', true, () => {
			return this.updateUserSettings().then(() => this.preferencesService.openGlobalSettings());
		});

		const noChange = new Action('trust.noChange', nls.localize('noChange', 'Keep Not Trusting Workspace'), '', true, () => TPromise.as(true));

		const actions = [openWorkspaceSettings, trustWorkspace, noChange];
		this.messageService.show(Severity.Warning, { message, actions });
	}
}

const workbenchRegistry = <IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(TrustContribution);
