/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CloudSandboxEnabledSettingId } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider, ICopilotChatSession } from '../../browser/copilotChatSessionsProvider.js';
import { SandboxPicker } from '../../browser/sandboxPicker.js';

class TestSessionsProvidersService extends mock<ISessionsProvidersService>() {
	override readonly onDidChangeProviders = Event.None;

	constructor(private readonly provider: ISessionsProvider) {
		super();
	}

	override getProvider<T extends ISessionsProvider>(): T | undefined {
		return this.provider as T;
	}
}

suite('Copilot SandboxPicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPicker(options: { settingEnabled?: boolean; remoteHostsEnabled?: boolean; hasRepository?: boolean; useSandbox?: boolean } = {}) {
		const useSandbox = observableValue<boolean | undefined>('useSandbox', options.useSandbox ?? false);
		const toggles: boolean[] = [];
		const providerSession = upcastPartial<ICopilotChatSession>({
			useSandbox,
			setUseSandbox: (value: boolean) => {
				toggles.push(value);
				useSandbox.set(value, undefined);
			},
		});
		const provider = Object.assign(Object.create(CopilotChatSessionsProvider.prototype), {
			getSession: () => providerSession,
		});
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, options.settingEnabled ?? true);
		configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, options.remoteHostsEnabled ?? true);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(provider));
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const workspace = upcastPartial<ISessionWorkspace>({
			folders: (options.hasRepository ?? true) ? [upcastPartial<ISessionWorkspace['folders'][0]>({ root: URI.parse('github:/osortega/simple-server') })] : [],
		});
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', upcastPartial<IActiveSession>({
			providerId: 'default-copilot',
			sessionId: 'session',
			workspace: observableValue<ISessionWorkspace | undefined>('workspace', workspace),
		}));

		const picker = disposables.add(instantiationService.createInstance(SandboxPicker, activeSession));
		const container = document.createElement('div');
		picker.render(container);
		return { container, toggles, useSandbox };
	}

	function chipState(container: HTMLElement) {
		const slot = container.querySelector<HTMLElement>('.sessions-chat-sandbox-checkbox');
		const checkbox = container.querySelector<HTMLElement>('.sessions-chat-sandbox-checkbox .monaco-checkbox');
		return {
			rendered: !!slot,
			hidden: slot?.classList.contains('hidden') ?? false,
			disabled: slot?.classList.contains('disabled') ?? false,
			checked: checkbox?.getAttribute('aria-checked') ?? undefined,
		};
	}

	test('is enabled and unchecked by default when the setting is on and a repository is present', () => {
		const { container } = createPicker();

		assert.deepStrictEqual(chipState(container), { rendered: true, hidden: false, disabled: false, checked: 'false' });
	});

	test('is hidden when the cloud sandbox setting is off', () => {
		const { container } = createPicker({ settingEnabled: false });

		assert.deepStrictEqual(chipState(container), { rendered: true, hidden: true, disabled: false, checked: 'false' });
	});

	test('is hidden when remote agent hosts are off, since a sandbox is reached over that relay', () => {
		const { container } = createPicker({ remoteHostsEnabled: false });

		assert.deepStrictEqual(chipState(container), { rendered: true, hidden: true, disabled: false, checked: 'false' });
	});

	test('shows unchecked when the feature is off despite a remembered preference', () => {
		// The send path falls back to the server-run cloud agent in this state, so the chip must
		// not claim the session is going to a sandbox.
		const { container } = createPicker({ settingEnabled: false, useSandbox: true });

		assert.deepStrictEqual(chipState(container), { rendered: true, hidden: true, disabled: false, checked: 'false' });
	});

	test('is disabled without a repository, since a sandbox is always provisioned against one', () => {
		const { container } = createPicker({ hasRepository: false });

		assert.deepStrictEqual(chipState(container), { rendered: true, hidden: false, disabled: true, checked: 'false' });
	});

	test('reflects an already-selected sandbox preference', () => {
		const { container } = createPicker({ useSandbox: true });

		assert.deepStrictEqual(chipState(container), { rendered: true, hidden: false, disabled: false, checked: 'true' });
	});

	test('clicking the row toggles the session preference', () => {
		const { container, toggles } = createPicker();
		const row = container.querySelector<HTMLElement>('.sessions-chat-sandbox-checkbox .action-label');
		assert.ok(row);

		row.click();

		assert.deepStrictEqual({ toggles, state: chipState(container) }, {
			toggles: [true],
			state: { rendered: true, hidden: false, disabled: false, checked: 'true' },
		});
	});
});
