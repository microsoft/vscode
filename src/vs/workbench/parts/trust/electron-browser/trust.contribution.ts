/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/platform';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IMessageService, Severity, CloseAction } from 'vs/platform/message/common/message';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';

class TrustContribution implements IWorkbenchContribution {

	private toDispose: IDisposable[] = [];
	private isUntrusted = false;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkspaceConfigurationService private workspaceConfigurationService: IWorkspaceConfigurationService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IMessageService private messageService: IMessageService,
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

	private showTrustWarning(): void {
		const message = nls.localize('untrustedWorkspace', "This workspace specifies executables. While the workspace is untrusted, these settings are being ignored.");

		const openWorkspaceSettings = new Action('trust.openWorkspaceSettings', nls.localize('openWorkspaceSettings', "Review Workspace Settings"), '', true, () => {
			return this.preferencesService.openWorkspaceSettings();
		});


		const actions = [openWorkspaceSettings, CloseAction];
		this.messageService.show(Severity.Warning, { message, actions });
	}
}

const workbenchRegistry = <IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(TrustContribution);
