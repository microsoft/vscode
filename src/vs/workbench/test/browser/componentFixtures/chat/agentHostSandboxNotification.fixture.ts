/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { agentSandboxDiagnosticsMetaKey } from '../../../../../platform/agentHost/common/meta/agentSandboxDiagnostics.js';
import { withSessionSandboxPolicy } from '../../../../../platform/agentHost/common/meta/agentSandboxPolicyMeta.js';
import { createSessionState, SessionStatus } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { AgentHostSandboxNotification } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostSandboxNotification.js';
import { IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { IChatInputNotification, IChatInputNotificationService } from '../../../../contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { renderChatInput } from './renderChatInput.js';

const reason = 'Bubblewrap cannot start sandboxed commands or services with this policy because its private network is unavailable. (Bubblewrap: sandbox networking requires \'slirp4netns\' on PATH: No such file or directory (os error 2). Install slirp4netns.) Network access from the sandbox on Linux requires: bubblewrap (bwrap) 0.5.0 or later, slirp4netns, util-linux 2.35 or later (unshare and nsenter), iptables, ip6tables, iptables-restore and ip6tables-restore, read/write access to /dev/net/tun, and unprivileged user and network namespaces (on Ubuntu 24.04 and later, check kernel.apparmor_restrict_unprivileged_userns; also check user.max_user_namespaces and user.max_net_namespaces). See https://docs.github.com/en/copilot/concepts/about-cloud-and-local-sandboxes';

function renderSandboxNotification(context: ComponentFixtureContext, managed = false, width = 348): Promise<void> {
	const resource = URI.parse('custom-host://opaque/session');
	const state = createSessionState({
		resource: resource.toString(),
		provider: 'custom-provider',
		title: 'Session',
		status: SessionStatus.Idle,
		createdAt: '2026-10-26T00:00:00.000Z',
		modifiedAt: '2026-10-26T00:00:00.000Z',
		_meta: withSessionSandboxPolicy({ [agentSandboxDiagnosticsMetaKey]: [reason] }, { enabled: managed }),
	});
	const notifications = new Map<string, IChatInputNotification>();
	context.disposableStore.add(new AgentHostSandboxNotification(
		resource,
		{ value: state, verifiedValue: state, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None },
		new class extends mock<IChatInputNotificationService>() {
			override setNotification(notification: IChatInputNotification): void { notifications.set(notification.id, notification); }
			override deleteNotification(id: string): void { notifications.delete(id); }
		}(),
		new TestConfigurationService(),
		new class extends mock<IAgentHostEnablementService>() {
			override readonly managedSandboxEnforced = constObservable(false);
			override readonly managedSandboxAllowsBypass = constObservable(false);
		}(),
		new class extends mock<IAgentHostConnectionsService>() {
			override resolveSessionResource() { return undefined; }
		}(),
		new class extends mock<IAgentHostService>() { }(),
		new class extends mock<IWorkbenchEnvironmentService>() { }(),
		new class extends mock<IChatWidgetService>() {
			override readonly onDidChangeFocusedSession = Event.None;
			override readonly onDidChangeWidgetVisibility = Event.None;
		}(),
		new class extends mock<IChatEntitlementService>() {
			override readonly sentiment = { hidden: false };
			override readonly onDidChangeSentiment = Event.None;
		}(),
		new class extends mock<IDialogService>() { }(),
	));
	const notification = [...notifications.values()][0];
	if (!notification) {
		throw new Error('Sandbox diagnostics did not publish a notification');
	}
	return renderChatInput(context, { width, notification: { ...notification, sessionResources: undefined } });
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	LinuxDiagnostics: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderSandboxNotification(context),
	}),
	LinuxDiagnosticsWide: defineComponentFixture({ render: context => renderSandboxNotification(context, false, 600) }),
	ManagedLinuxDiagnostics: defineComponentFixture({ render: context => renderSandboxNotification(context, true) }),
});
