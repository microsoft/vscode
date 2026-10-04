/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { localize } from '../../../../nls.js';
import { DEV_CONTAINER_AGENT_HOST_CHANNEL, DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId, IDevContainerAgentHostDiagnostics } from '../../../../platform/agentHost/common/devContainerAgentHost.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AgentSandboxEnabledSettingValue, AgentSandboxSettingId, isAgentSandboxEnabledValue } from '../../../../platform/sandbox/common/settings.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IOnboardingTryoutRunContext, IOnboardingTryoutService, registerOnboardingTryout } from '../../onboarding/common/onboardingTryout.js';
import { createDevContainerSamplesTryout } from '../browser/onboarding/devContainerSamplesTryout.js';

const requiredSettings = [RemoteAgentHostsEnabledSettingId, DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId] as const;

export class DevContainerSamplesTryoutPrerequisites extends Disposable {
	private readonly docker: IDevContainerAgentHostDiagnostics;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOnboardingTryoutService private readonly tryoutService: IOnboardingTryoutService,
		@ILogService private readonly logService: ILogService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();
		this.docker = ProxyChannel.toService<IDevContainerAgentHostDiagnostics>(sharedProcessService.getChannel(DEV_CONTAINER_AGENT_HOST_CHANNEL));
	}

	private isActive(context: IOnboardingTryoutRunContext): boolean {
		return !this._store.isDisposed && !context.store.isDisposed && !context.token.isCancellationRequested
			&& this.configurationService.getValue<boolean>('chat.disableAIFeatures') !== true
			&& this.tryoutService.getAvailability(context.id).kind === 'ready';
	}

	private isPolicyDisabled(): boolean {
		return this.agentHostEnablementService.managedSandboxEnforced.get()
			|| requiredSettings.some(setting => this.configurationService.inspect<boolean>(setting).policyValue === false);
	}

	async check(context: IOnboardingTryoutRunContext): Promise<boolean> {
		if (!this.isActive(context)) {
			return false;
		}
		if (this.isPolicyDisabled()) {
			await this.dialogService.info(this.agentHostEnablementService.managedSandboxEnforced.get()
				? localize('devContainerSamplesTryout.sandboxRequired', "Dev Container samples currently do not support sandboxing, which is required by your organization.")
				: localize('devContainerSamplesTryout.policy', "Your organization has disabled a setting required by Dev Container samples."));
			return false;
		}
		try {
			const status = await raceCancellationError(this.docker.getDockerStatus(), context.token);
			if (!this.isActive(context) || this.isPolicyDisabled()) {
				return false;
			}
			if (status !== 'running') {
				await this.dialogService.info(status === 'notInstalled'
					? localize('devContainerSamplesTryout.dockerNotInstalled', "Docker was not found. Dev Container samples require Docker to be installed and available on PATH.")
					: localize('devContainerSamplesTryout.dockerNotRunning', "Docker is not running or is not accessible. Dev Container samples require a running Docker daemon."));
				return false;
			}
			const disabledSettings = requiredSettings.filter(setting => this.configurationService.getValue<boolean>(setting) !== true);
			const sandboxEnabled = isAgentSandboxEnabledValue(this.configurationService.getValue<AgentSandboxEnabledSettingValue>(AgentSandboxSettingId.AgentSandboxEnabled));
			if (disabledSettings.length || sandboxEnabled) {
				const details: string[] = [];
				if (disabledSettings.length) {
					details.push(localize('devContainerSamplesTryout.enableSettings', "The following user settings will be enabled:\n{0}", disabledSettings.join('\n')));
				}
				if (sandboxEnabled) {
					details.push(localize('devContainerSamplesTryout.sandboxWarning', "Sandboxing is currently not supported with Dev Container samples. Sandboxing will be disabled for the sample session only. Your sandboxing setting will remain unchanged."));
				}
				details.push(localize('devContainerSamplesTryout.openDetail', "This opens the samples picker in the Agents window without choosing a sample or starting a container. Your existing draft is preserved."));
				const { confirmed } = await this.dialogService.confirm({
					type: 'info',
					message: disabledSettings.length
						? localize('devContainerSamplesTryout.enable', "Enable the settings required for Dev Container samples?")
						: localize('devContainerSamplesTryout.withoutSandbox', "Try a Dev Container sample without sandboxing?"),
					detail: details.join('\n\n'),
					primaryButton: disabledSettings.length
						? localize('devContainerSamplesTryout.enableButton', "Enable and Continue")
						: localize('devContainerSamplesTryout.continue', "Continue"),
				});
				if (!confirmed) {
					return false;
				}
				for (const setting of disabledSettings) {
					if (!this.isActive(context) || this.isPolicyDisabled()) {
						return false;
					}
					if (this.configurationService.getValue<boolean>(setting) !== true) {
						await this.configurationService.updateValue(setting, true, ConfigurationTarget.USER);
					}
				}
			}
		} catch (error) {
			if (isCancellationError(error) || !this.isActive(context)) {
				return false;
			}
			this.logService.error('[DevContainerSamplesTryout] Prerequisite check failed', error);
			await this.dialogService.error(localize('devContainerSamplesTryout.failed', "Unable to prepare Dev Container samples."), getErrorMessage(error));
			return false;
		}
		return this.isActive(context) && !this.isPolicyDisabled()
			&& requiredSettings.every(setting => this.configurationService.getValue<boolean>(setting) === true);
	}
}

export class DevContainerSamplesTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.devContainerSamplesTryout';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		const prerequisites = new Lazy(() => this._register(instantiationService.createInstance(DevContainerSamplesTryoutPrerequisites)));
		this._register(registerOnboardingTryout({
			...createDevContainerSamplesTryout(),
			checkPrerequisites: context => prerequisites.value.check(context),
		}));
	}
}

registerWorkbenchContribution2(DevContainerSamplesTryoutContribution.ID, DevContainerSamplesTryoutContribution, WorkbenchPhase.BlockRestore);
