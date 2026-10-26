/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { AgentHostArtifactNoticeMetaKey } from '../../../../../platform/agentHost/common/meta/agentHostArtifactIntegrationMeta.js';
import { ArtifactAutomationOption } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { getArtifactAutomationNotices } from '../../../../../platform/artifactIntegrations/common/artifactIntegrationNotices.js';
import { emptyArtifactConfiguration } from '../../../../../platform/artifactIntegrations/common/artifactAutomationConfiguration.js';
import { ArtifactIntegrationState, ArtifactStoredBinding } from '../../../../../platform/artifactIntegrations/common/artifactIntegrationStore.js';
import { ArtifactAutomationNotice } from '../../../../../platform/artifactIntegrations/common/artifactRuntime.js';
import { systemNotificationToChatPart } from '../../../../contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { IFixtureMessage, renderChatWidget } from './chatWidget.fixture.js';

const options: readonly ArtifactAutomationOption[] = [
	{ id: 'fixCI', kind: 'boolean', defaultValue: false, label: 'Automatically Fix CI', description: 'Ask the agent to fix failing pull request checks and push the repair.', actionIds: ['fixCI'], maxAttempts: 3 },
	{
		id: 'merge', kind: 'enum', defaultValue: 'off', disabledValue: 'off', label: 'Automatically Merge', description: 'Merge the pull request when it is ready.', actionIds: ['merge'], maxAttempts: 1,
		choices: [{ value: 'off', label: 'Off' }, { value: 'ready', label: 'When Ready' }, { value: 'unchanged', label: 'Only if Repairs Make No Changes' }],
	},
];

const initial: ArtifactStoredBinding = {
	id: 'binding', session: 'session', integrationId: 'github.pullRequest', runtimeId: 'host', credentialScope: 'github', resourceKey: 'pr',
	artifact: { id: 'pr', label: '#1336', resource: 'https://github.com/microsoft/vscode-vsce/pull/1336', origin: { chat: 'chat' } },
	options, consent: {}, configuration: emptyArtifactConfiguration(options), checkpoint: { revision: 0 },
};

function transition(previous: ArtifactStoredBinding, values: ArtifactStoredBinding['configuration']['values'], reason?: string): ArtifactStoredBinding {
	return {
		...previous, configuration: {
			...previous.configuration, revision: previous.configuration.revision + 1, values: { ...previous.configuration.values, ...values },
			disablements: reason ? { fixCI: { reason, attempts: 3, lastRunId: 'repair' } } : {},
		},
	};
}

const enabled = transition(initial, { fixCI: true, merge: 'ready' });
const changed = transition(enabled, { merge: 'unchanged' });
const disabled = transition(changed, { fixCI: false }, 'Turned off after 3 unsuccessful attempts. Review the last run before enabling this automation again.');
const state = (binding: ArtifactStoredBinding): ArtifactIntegrationState => ({ version: 1, authority: 'host', revision: binding.configuration.revision, bindings: [binding], runs: [] });
const notices = [
	getArtifactAutomationNotices(state(initial), state(enabled))[0],
	...getArtifactAutomationNotices(state(enabled), state(changed)),
	...getArtifactAutomationNotices(state(changed), state(disabled)),
];

function message(notice: ArtifactAutomationNotice): IFixtureMessage {
	const notification = systemNotificationToChatPart(notice.content, 'host', { [AgentHostArtifactNoticeMetaKey]: { kind: notice.kind, iconId: 'git-pull-request' } });
	if (notification?.kind !== 'systemNotification') {
		throw new Error('Expected an artifact automation system notification');
	}
	return { user: notice.content.split('\n')[0], requestHidden: true, assistant: [{ kind: 'systemNotification', notification }] };
}

async function render(context: ComponentFixtureContext, expanded: boolean): Promise<void> {
	await renderChatWidget(context, {
		messages: notices.map(message),
		width: 720, height: expanded ? 820 : 220, listHeight: expanded ? 800 : 200,
		inputVisible: false, responseFooterAction: true, verbose: true,
	});
	const targetWindow = dom.getWindow(context.container);
	await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	const headers = [...context.container.querySelectorAll<HTMLElement>('.chat-system-notification-disclosure-header')];
	if (headers.length !== notices.length) {
		throw new Error(`Expected ${notices.length} automation notices, got ${headers.length}`);
	}
	for (const header of headers) {
		if (expanded) {
			header.dispatchEvent(new targetWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		}
		if (header.ariaExpanded !== String(expanded) || !header.ariaLabel) {
			throw new Error('Automation notice disclosure state or accessible label is incorrect');
		}
	}
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Notices: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, false),
	}),
	ExpandedNotices: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, true),
	}),
});
