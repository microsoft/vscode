/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { agentMergeConfigurationChangedNotice, agentMergeDisableReasons, agentMergeDisabledNotice, agentMergeEnabledNotice, defaultAgentMergeConfiguration } from '../../../../../platform/agentHost/common/agentMerge.js';
import { AgentSystemNotificationKind, toAgentSystemNotificationMeta } from '../../../../../platform/agentHost/common/meta/agentSystemNotificationMeta.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { systemNotificationToChatPart } from '../../../../contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { ChatContentMarkdownRenderer } from '../../../../contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { ChatSystemNotificationContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatSystemNotificationContentPart.js';
import { IChatMarkdownAnchorService } from '../../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

/**
 * Renders the notices the Agent Merge controller posts into a session
 * transcript when it starts, changes behavior, or stops monitoring a pull request.
 *
 * Each fixture drives the real host payload through
 * {@link systemNotificationToChatPart}, so the rendered icon and content come
 * from the same mapping the Agents window uses rather than from hand-built
 * view data that could drift from it.
 */
function renderNotice(context: ComponentFixtureContext, content: string, kind: AgentSystemNotificationKind, expanded = false): void {
	const { container, disposableStore } = context;

	const anchorService = new class extends mock<IChatMarkdownAnchorService>() {
		override register() { return { dispose() { } }; }
	}();

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			reg.defineInstance(ILabelService, new class extends mock<ILabelService>() {
				override getUriLabel(uri: URI): string { return uri.path; }
			}());
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(IChatMarkdownAnchorService, anchorService);
		},
	});

	const progress = systemNotificationToChatPart(content, 'fixture', toAgentSystemNotificationMeta({ kind }));
	if (progress?.kind !== 'systemNotification') {
		throw new Error(`Expected a system notification, got '${progress?.kind}'`);
	}

	const markdownRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
	const part = disposableStore.add(instantiationService.createInstance(ChatSystemNotificationContentPart, progress, markdownRenderer));
	if (expanded) {
		part.domNode.querySelector<HTMLElement>('.chat-system-notification-disclosure-header')?.click();
	}

	// `.interactive-session` supplies the chat font tokens and
	// `.interactive-item-container` the row layout the progress container needs.
	container.style.width = '400px';
	container.style.padding = '8px';
	container.classList.add('interactive-session');
	const itemContainer = dom.$('.interactive-item-container');
	itemContainer.appendChild(part.domNode);
	container.appendChild(itemContainer);
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Enabled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderNotice(
			ctx,
			agentMergeEnabledNotice({ branchName: 'benibenj/agents/hover-widget-structure-improvements' }, defaultAgentMergeConfiguration),
			AgentSystemNotificationKind.AgentMergeEnabled,
		),
	}),

	EnabledExpanded: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderNotice(
			ctx,
			agentMergeEnabledNotice({ branchName: 'benibenj/agents/hover-widget-structure-improvements' }, defaultAgentMergeConfiguration),
			AgentSystemNotificationKind.AgentMergeEnabled,
			true,
		),
	}),

	ConfigurationChanged: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderNotice(
			ctx,
			agentMergeConfigurationChangedNotice(defaultAgentMergeConfiguration, {
				...defaultAgentMergeConfiguration,
				fixCI: false,
				mergePullRequest: 'always',
			})!,
			AgentSystemNotificationKind.AgentMergeConfigurationChanged,
		),
	}),

	DisabledByUser: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderNotice(
			ctx,
			agentMergeDisabledNotice(),
			AgentSystemNotificationKind.AgentMergeDisabled,
		),
	}),

	/** The silent self-disable that made a monitored session look broken. */
	DisabledByBranchChange: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderNotice(
			ctx,
			agentMergeDisableReasons.branchChanged('benibenj/agent-merge-widget', 'main').notice,
			AgentSystemNotificationKind.AgentMergeDisabled,
		),
	}),

	PullRequestMerged: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderNotice(
			ctx,
			agentMergeDisableReasons.pullRequestMerged(123, 'https://github.com/microsoft/vscode/pull/123').notice,
			AgentSystemNotificationKind.AgentMergePullRequestMerged,
		),
	}),

	/** The longest reason, so wrapping keeps the icon aligned to the first line. */
	DisabledByRepairBudget: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderNotice(
			ctx,
			agentMergeDisableReasons.repairBudgetExhausted().notice,
			AgentSystemNotificationKind.AgentMergeDisabled,
		),
	}),

	/**
	 * A reason long enough to wrap onto three lines, pinning the icon to the
	 * first line rather than the middle of the block.
	 */
	DisabledByIndeterminateState: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderNotice(
			ctx,
			agentMergeDisableReasons.indeterminate(30, 'checks could not be read').notice,
			AgentSystemNotificationKind.AgentMergeDisabled,
		),
	}),
});
