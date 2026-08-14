/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CloudSandboxEnabledSettingId } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { AgentSessionProviders } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISessionFolder, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider, ICopilotChatSession, RemoteNewSession } from '../../browser/copilotChatSessionsProvider.js';
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

	function createPicker(options: { settingEnabled?: boolean; remoteHostsEnabled?: boolean; hasRepository?: boolean; useSandbox?: boolean; committedSession?: boolean } = {}) {
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, options.settingEnabled ?? true);
		configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, options.remoteHostsEnabled ?? true);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() {
			override readonly onDidChangeOptionGroups = Event.None;
			override setSessionOption(): boolean { return true; }
			override getOptionGroupsForSessionType() { return undefined; }
		}());

		// A browsed GitHub workspace root carries a ref (`/<owner>/<repo>/HEAD`); the repo-less
		// case is a URI with no `owner/repo` to derive.
		const root = (options.hasRepository ?? true)
			? URI.parse(`${GITHUB_REMOTE_FILE_SCHEME}:/osortega/simple-server/HEAD`)
			: URI.parse(`${GITHUB_REMOTE_FILE_SCHEME}:/`);
		const workspace = upcastPartial<ISessionWorkspace>({
			uri: root,
			folders: [upcastPartial<ISessionFolder>({ root, workingDirectory: root })],
		});

		const providerSession = disposables.add(instantiationService.createInstance(
			RemoteNewSession,
			URI.from({ scheme: AgentSessionProviders.Cloud, path: '/untitled-1' }),
			workspace,
			AgentSessionProviders.Cloud,
			'default-copilot',
		));
		if (options.useSandbox) {
			providerSession.setUseSandbox(true);
		}
		// A committed session stands in for the case where the active session is no longer the
		// draft, whose `setUseSandbox` is a no-op rather than a throw.
		const session: ICopilotChatSession = options.committedSession
			? upcastPartial<ICopilotChatSession>({ useSandbox: constObservable(undefined), setUseSandbox: () => { } })
			: providerSession;
		const provider = Object.assign(Object.create(CopilotChatSessionsProvider.prototype), {
			getSession: () => session,
		});
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(provider));

		const activeSession = observableValue<IActiveSession | undefined>('activeSession', upcastPartial<IActiveSession>({
			providerId: 'default-copilot',
			sessionId: providerSession.sessionId,
		}));

		const picker = disposables.add(instantiationService.createInstance(SandboxPicker, activeSession));
		const container = document.createElement('div');
		picker.render(container);
		return { container, providerSession };
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
		const { container, providerSession } = createPicker();
		const row = container.querySelector<HTMLElement>('.sessions-chat-sandbox-checkbox .action-label');
		assert.ok(row);

		row.click();

		assert.deepStrictEqual({ useSandbox: providerSession.useSandbox.get(), state: chipState(container) }, {
			useSandbox: true,
			state: { rendered: true, hidden: false, disabled: false, checked: 'true' },
		});
	});

	test('toggling a committed session is a no-op rather than a throw', () => {
		// `getSession` returns committed sessions too, and a throw out of a click handler is a
		// far worse failure than doing nothing.
		const { container } = createPicker({ committedSession: true });
		const row = container.querySelector<HTMLElement>('.sessions-chat-sandbox-checkbox .action-label');
		assert.ok(row);

		assert.doesNotThrow(() => row.click());
	});
});
