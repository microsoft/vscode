/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { AgentSystemNotificationKind, toAgentSystemNotificationMeta } from '../../../../../platform/agentHost/common/meta/agentSystemNotificationMeta.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { systemNotificationToChatPart } from '../../../../contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { ChatContentMarkdownRenderer } from '../../../../contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { ChatAutoModeResolutionContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatAutoModeResolutionContentPart.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { IChatMarkdownAnchorService } from '../../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { ChatSystemNotificationContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatSystemNotificationContentPart.js';
import { IChatAutoModeResolutionPart } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { TestMenuService } from '../../workbenchTestServices.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';
// The routing row is styled by the Thinking chrome; import it so this fixture
// does not rely on another module happening to pull it into the bundle.
import '../../../../contrib/chat/browser/widget/chatContentParts/media/chatThinkingContent.css';

function createRenderContext(isComplete: boolean): IChatContentPartRenderContext {
	const element = new class extends mock<IChatResponseViewModel>() {
		override readonly isComplete = isComplete;
	}();
	return {
		element,
		inlineTextModels: upcastPartial<InlineTextModelCollection>({}),
		elementIndex: 0,
		container: document.createElement('div'),
		content: [],
		contentIndex: 0,
		editorPool: undefined!,
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: undefined!,
		currentWidth: observableValue('currentWidth', 400),
		onDidChangeVisibility: Event.None,
	};
}

function renderRoutingPart(context: ComponentFixtureContext, content: IChatAutoModeResolutionPart): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
	});

	const part = disposableStore.add(instantiationService.createInstance(
		ChatAutoModeResolutionContentPart,
		content,
		createRenderContext(!!content.resolved),
	));

	appendResponseValue(container).appendChild(part.domNode);
}

function appendResponseValue(container: HTMLElement): HTMLElement {
	container.style.width = '400px';
	container.style.padding = '8px';
	container.classList.add('interactive-session');

	// The routing row reuses the thinking chrome, whose CSS is scoped to the
	// response value container.
	const response = dom.$('.interactive-item-container.interactive-response');
	const value = dom.$('.value');
	response.appendChild(value);
	container.appendChild(response);
	return value;
}

/**
 * Every way the chat names the model a turn was routed to, with model logos shown:
 * the routing rows, and the notice of a routing that failed and fell back to a model.
 */
function renderModelLogos(context: ComponentFixtureContext): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			reg.defineInstance(ILabelService, new class extends mock<ILabelService>() {
				override getUriLabel(uri: URI): string { return uri.path; }
			}());
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(IChatMarkdownAnchorService, new class extends mock<IChatMarkdownAnchorService>() {
				override register() { return { dispose() { } }; }
			}());
			reg.define(IActionViewItemService, NullActionViewItemService);
			reg.define(IMenuService, TestMenuService);
		},
	});
	(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.ModelLogos, true);

	const value = appendResponseValue(container);
	for (const content of routedWithLogos) {
		value.appendChild(disposableStore.add(instantiationService.createInstance(ChatAutoModeResolutionContentPart, content, createRenderContext(true))).domNode);
	}

	// Driven through the real mapping, so the notice reads as the Agents window shows it.
	const notice = systemNotificationToChatPart('Copilot Fusion routing failed; continuing with claude-opus-5.5', 'fixture', toAgentSystemNotificationMeta({
		kind: AgentSystemNotificationKind.FusionProgress,
		fusionStatus: 'degraded',
		fusionPassModel: 'claude-opus-5.5',
	}), undefined, false, {
		toFusionPassResolution: id => ({ kind: 'autoModeResolution', resolved: { id, name: 'Claude Opus 5.5' }, fusion: true }),
	});
	if (notice?.kind !== 'systemNotification') {
		throw new Error(`Expected a system notification, got '${notice?.kind}'`);
	}
	value.appendChild(disposableStore.add(instantiationService.createInstance(ChatSystemNotificationContentPart, notice, instantiationService.createInstance(ChatContentMarkdownRenderer), undefined)).domNode);
}

const routing: IChatAutoModeResolutionPart = { kind: 'autoModeResolution' };
const routed: IChatAutoModeResolutionPart = { kind: 'autoModeResolution', resolved: { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' } };
const routedWithReason: IChatAutoModeResolutionPart = {
	kind: 'autoModeResolution',
	resolved: {
		id: 'gpt-5.4-mini',
		name: 'GPT-5.4 mini',
		reason: 'Auto selected gpt-5.4-mini to prioritize cost efficiency, alongside model fit for this task.',
	},
};

/** One row per way of naming the routed model: each provider with a logo, the routing sentences, and a provider that has none. */
const routedWithLogos: IChatAutoModeResolutionPart[] = [
	{ kind: 'autoModeResolution', resolved: { id: 'claude-opus-5.5', name: 'Claude Opus 5.5' }, fusion: true },
	{ kind: 'autoModeResolution', resolved: { id: 'claude-opus-5.5', name: 'Claude Opus 5.5', reason: 'Auto selected claude-opus-5.5 for its fit to your request because of high reasoning needs.' }, fusion: true },
	{ kind: 'autoModeResolution', resolved: { id: 'mai-code-1.1-flash-local', name: 'MAI Code 1.1 Flash \u00b7 On-device' }, fusion: true },
	{ kind: 'autoModeResolution', resolved: { id: 'gpt-5-mini', name: 'GPT-5 mini', reason: 'Copilot Fusion routed task to GPT-5 mini. The on-device model was unavailable, so a cloud model was used.' }, fusion: true },
	{ kind: 'autoModeResolution', resolved: { id: 'gemini-4-neon', name: 'Gemini 4 Neon' }, fusion: true },
	{ kind: 'autoModeResolution', resolved: { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }, router: 'daily', effort: 'high' },
	{ kind: 'autoModeResolution', resolved: { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' } },
];

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Routing: defineComponentFixture({
		labels: { kind: 'animated' },
		render: (ctx) => renderRoutingPart(ctx, routing),
	}),

	Routed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderRoutingPart(ctx, routed),
	}),

	RoutedWithReason: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderRoutingPart(ctx, routedWithReason),
	}),

	ModelLogos: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		render: renderModelLogos,
	}),
});
