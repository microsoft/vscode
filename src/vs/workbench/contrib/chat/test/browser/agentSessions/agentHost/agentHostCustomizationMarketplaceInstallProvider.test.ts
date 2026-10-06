/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentCustomizationInstallation } from '../../../../../../../platform/agentHost/common/agent.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../../../platform/agentHost/common/agentService.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { AgentHostCustomizationMarketplaceInstallProvider } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationMarketplaceInstallProvider.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../../common/plugins/agentPluginService.js';

suite('AgentHostCustomizationMarketplaceInstallProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the host-advertised backend session for SDK inventory', async () => {
		const frontendSession = URI.parse('agent-host-copilotcli:/frontend-session');
		const backendSession = URI.parse('vendor-session://opaque-host/backend-session?version=2');
		const calls: { provider: string; session: string }[] = [];
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
			'copilotcli',
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async listCustomizationInstallations(provider: string, session: URI) {
					calls.push({ provider, session: session.toString() });
					return [];
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity(session: URI) {
					assert.strictEqual(session, frontendSession);
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
		));

		const installations = await provider.getInstallations(frontendSession, CancellationToken.None);

		assert.deepStrictEqual({ calls, installations }, {
			calls: [{ provider: 'copilotcli', session: backendSession.toString() }],
			installations: [],
		});
	});

	test('preserves SDK plugin inventory when session-bound receipt inventory is unavailable', async () => {
		const session = URI.parse('agent-host-copilotcli:/frontend-session');
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/spark');
			override readonly label = 'Spark';
			override readonly copilotCliInstallation = { name: 'spark', marketplace: 'copilot-plugins' };
		}();
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
			'copilotcli',
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async listCustomizationInstallations(): Promise<readonly IAgentCustomizationInstallation[]> { throw new Error('Policy session unavailable'); }
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: URI.parse('ahp-session:/backend-session') };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', [plugin]);
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
		));

		const installations = await provider.getInstallations(session, CancellationToken.None);

		assert.deepStrictEqual(installations.map(installation => ({
			installationId: installation.installationId,
			installation: installation.resource.installation,
			state: installation.state.kind,
		})), [{
			installationId: 'plugin:copilot-plugins:spark',
			installation: { kind: 'configuredPlugin', name: 'spark', marketplace: 'copilot-plugins' },
			state: 'installed',
		}]);
	});
});
