/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { CloudSandboxEnabledSettingId, isCloudSandboxEnabled } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { CheckboxChip } from '../../../chat/browser/checkboxChip.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider, ICopilotChatSession, RemoteNewSession } from './copilotChatSessionsProvider.js';

/**
 * "Sandbox" checkbox for a new cloud session: when checked, the session runs in a GitHub-managed
 * sandbox this client drives over the Agent Host Protocol, instead of the server-run cloud agent.
 *
 * Disabled rather than hidden without a repository, since a sandbox is always provisioned
 * against one.
 */
export class SandboxPicker extends Disposable {

	private readonly _chip: CheckboxChip;
	private _hasRepository = false;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._chip = this._register(new CheckboxChip({
			label: localize('sandboxPicker.label', "Sandbox"),
			ariaLabel: localize('sandboxPicker.checkboxAriaLabel', "Run in a GitHub-managed sandbox"),
			onToggle: checked => this._applyToggle(checked),
			slotClassName: 'sessions-chat-sandbox-checkbox',
		}));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CloudSandboxEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._update();
			}
		}));

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const providerSession = session ? this._getSession(session) : undefined;
			providerSession?.useSandbox.read(reader);
			// Exactly what the send path requires, so the chip can never promise a sandbox the
			// send would silently decline to provision. `repoNwo` is fixed at construction.
			this._hasRepository = providerSession instanceof RemoteNewSession && !!providerSession.repoNwo;
			this._update();
		}));
	}

	private _getSession(session: IActiveSession): ICopilotChatSession | undefined {
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		return provider instanceof CopilotChatSessionsProvider ? provider.getSession(session.sessionId) : undefined;
	}

	private _applyToggle(checked: boolean): void {
		const session = this._session.get();
		const providerSession = session ? this._getSession(session) : undefined;
		if (!providerSession) {
			return;
		}
		reportNewChatPickerClosed(this._telemetryService, {
			id: 'NewChatSandboxPicker',
			name: 'NewChatSandboxPicker',
			optionIdBefore: String(providerSession.useSandbox.get() === true),
			optionIdAfter: String(checked),
			optionLabelBefore: undefined,
			optionLabelAfter: undefined,
			isPII: false,
		});
		providerSession.setUseSandbox(checked);
	}

	render(container: HTMLElement): void {
		this._chip.render(container);
		this._update();
	}

	private _update(): void {
		const session = this._session.get();
		const providerSession = session ? this._getSession(session) : undefined;
		const enabled = isCloudSandboxEnabled(this._configurationService);
		this._chip.update({
			checked: enabled && providerSession?.useSandbox.get() === true,
			state: !enabled ? 'hidden' : this._hasRepository ? 'enabled' : 'disabled',
			disabledReason: this._hasRepository ? undefined : localize('sandboxPicker.noRepository', "A repository is required to run in a sandbox"),
		});
	}
}
