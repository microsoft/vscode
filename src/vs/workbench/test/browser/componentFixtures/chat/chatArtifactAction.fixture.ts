/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { AgentHostArtifactRequestMetaKey, AgentHostArtifactRunMetaKey } from '../../../../../platform/agentHost/common/meta/agentHostArtifactIntegrationMeta.js';
import { MessageKind, Turn, TurnState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ArtifactRequestPresentation } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { createTestArtifactRequestPresentation } from '../../../../../platform/artifactIntegrations/test/common/artifactIntegrationTestUtils.js';
import { chartsGreen } from '../../../../../platform/theme/common/colors/chartsColors.js';
import { turnsToHistory } from '../../../../contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { IFixtureMessage, renderChatWidget } from './chatWidget.fixture.js';

const pullRequest = {
	resource: 'https://github.com/microsoft/vscode/pull/338107',
	label: 'microsoft/vscode#338107',
	description: 'Add pull request artifact integration',
	icon: { id: 'git-pull-request', colorId: chartsGreen },
};

const checks: ArtifactRequestPresentation = {
	version: 1, integrationLabel: 'GitHub Pull Requests', source: 'automation',
	action: { label: 'Fix CI', iconId: 'tools' },
	artifact: pullRequest,
	details: [{
		title: 'Checks', description: '1 of 5 checks passed; 3 failed; 1 in progress.',
		availability: { kind: 'available' }, links: [], completeness: 'complete',
		items: [
			{ id: 'linux', label: 'Linux Unit Tests', description: 'Failed', icon: { id: 'error', colorId: 'errorForeground' }, resource: `${pullRequest.resource}/checks` },
			{ id: 'macos', label: 'macOS Unit Tests', description: 'Failed', icon: { id: 'error', colorId: 'errorForeground' }, resource: `${pullRequest.resource}/checks` },
			{ id: 'lint', label: 'Hygiene', description: 'Failed', icon: { id: 'error', colorId: 'errorForeground' }, resource: `${pullRequest.resource}/checks` },
			{ id: 'windows', label: 'Windows Unit Tests', description: 'In progress', icon: { id: 'circle-large-outline', colorId: 'editorWarning.foreground' }, resource: `${pullRequest.resource}/checks` },
			{ id: 'compile', label: 'Compile', description: 'Passed', icon: { id: 'pass', colorId: chartsGreen }, resource: `${pullRequest.resource}/checks` },
		],
	}],
};

const comments: ArtifactRequestPresentation = {
	...checks,
	action: { label: 'Address Comments', iconId: 'comment-discussion' },
	details: [{
		title: 'Comments', description: '2 unresolved review comments.',
		availability: { kind: 'available' }, links: [], completeness: 'complete',
		items: [
			{ id: 'disposal', label: 'src/artifactDetails.ts:42', description: 'octocat: Dispose the details observation when the request finishes.', icon: { id: 'comment' }, resource: `${pullRequest.resource}#discussion_r1` },
			{ id: 'history', label: 'src/artifactModel.ts:128', description: 'reviewer: Preserve the action snapshot when restoring a session.', icon: { id: 'comment' }, resource: `${pullRequest.resource}#discussion_r2` },
		],
	}],
};

const experiment = createTestArtifactRequestPresentation();

function message(presentation: ArtifactRequestPresentation, index: number): IFixtureMessage {
	const turn: Turn = {
		id: `action-${index}`,
		message: {
			text: `${presentation.action.label} for ${presentation.artifact.resource}.\n\nUse the current session and preserve the existing permission settings.`,
			origin: { kind: MessageKind.SystemNotification },
			_meta: { [AgentHostArtifactRunMetaKey]: `run-${index}`, [AgentHostArtifactRequestMetaKey]: presentation },
		},
		state: TurnState.Complete, responseParts: [], usage: undefined,
		startedAt: '2026-09-30T15:33:00.000Z',
	};
	const request = turnsToHistory(URI.parse('fixture-host://session'), [turn], 'fixture-agent', 'fixture-host')[0];
	if (request?.type !== 'request' || request.requestSource !== 'artifactIntegration' || !request.artifactRequest) {
		throw new Error('Expected a restored artifact action request');
	}
	return {
		user: request.prompt,
		isSystemInitiated: request.isSystemInitiated,
		requestSource: request.requestSource, artifactRequest: request.artifactRequest, timestamp: request.timestamp,
		assistant: [{ kind: 'markdown', text: 'I will investigate the reported state and make the necessary changes.' }],
	};
}

async function render(context: ComponentFixtureContext, presentations: readonly ArtifactRequestPresentation[], expanded = false, agentMessage = false, width = 720): Promise<void> {
	const messages = presentations.map(message);
	await renderChatWidget(context, {
		messages, width, height: expanded ? 620 : 500, listHeight: expanded ? 600 : 480,
		inputVisible: false, responseFooterAction: true,
	});
	const targetWindow = dom.getWindow(context.container);
	await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	const cards = [...context.container.querySelectorAll<HTMLElement>('.chat-artifact-action')];
	if (cards.length !== presentations.length) {
		throw new Error(`Expected ${presentations.length} artifact requests, got ${cards.length}`);
	}
	for (const [index, card] of cards.entries()) {
		const disclosure = card.querySelector<HTMLElement>('.chat-action-request-disclosure');
		if (!disclosure || disclosure.ariaExpanded !== 'false' || !disclosure.ariaLabel?.includes(presentations[index].action.label)) {
			throw new Error('Artifact request disclosure must start collapsed with an accessible action label');
		}
		if (expanded) {
			disclosure.dispatchEvent(new targetWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		}
		if (disclosure.ariaExpanded !== String(expanded)) {
			throw new Error('Artifact request keyboard disclosure did not update its accessible state');
		}
		if (expanded) {
			for (const row of card.querySelectorAll<HTMLElement>('.artifact-details-item')) {
				const bounds = row.getBoundingClientRect();
				const iconBounds = row.querySelector<HTMLElement>('.artifact-details-item-icon .codicon')!.getBoundingClientRect();
				const firstLineBounds = row.querySelector<HTMLElement>('.artifact-details-item-label')!.getBoundingClientRect();
				if (Math.abs((iconBounds.top + iconBounds.bottom - firstLineBounds.top - firstLineBounds.bottom) / 2) > 0.5) {
					throw new Error('Artifact status icons must align with the first line of text');
				}
				for (const label of row.querySelectorAll<HTMLElement>('.artifact-details-item-label, .artifact-details-item-description:not([hidden])')) {
					const labelBounds = label.getBoundingClientRect();
					if (labelBounds.top < bounds.top || labelBounds.bottom > bounds.bottom) {
						throw new Error('Artifact details must fit both lines inside the list row');
					}
				}
			}
			for (const icon of card.querySelectorAll<HTMLElement>('.artifact-icon[style]')) {
				const glyph = icon.querySelector<HTMLElement>('.codicon')!;
				if (targetWindow.getComputedStyle(icon).color !== targetWindow.getComputedStyle(glyph).color) {
					throw new Error('Artifact status colors must survive nested chat list styling');
				}
			}
		}
		if (agentMessage) {
			card.querySelector<HTMLElement>('.chat-action-request-message-toggle')!.click();
			if (!card.classList.contains('showing-agent-message') || card.querySelector('.chat-action-request-message')?.textContent !== messages[index].user) {
				throw new Error('Artifact request must preserve the full agent message');
			}
		}
	}
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	InChat: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, [checks, comments, experiment]),
	}),
	Checks: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, [checks], true),
	}),
	Comments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, [comments], true),
	}),
	Experiment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, [experiment], true),
	}),
	AgentMessage: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, [checks], true, true),
	}),
	Narrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => render(context, [createTestArtifactRequestPresentation({
			source: 'manual',
			artifact: { ...experiment.artifact, label: 'Experiment 42 - Ranking relevance across all search result categories' },
		})], true, false, 380),
	}),
});
