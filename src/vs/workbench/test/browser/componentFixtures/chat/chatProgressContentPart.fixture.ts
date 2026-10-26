/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { registerActionWidgetTestKeybindings } from '../../../../../platform/actionWidget/test/browser/actionWidgetTestUtils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatProgressContentPart, ChatWorkingProgressContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatProgressContentPart.js';
import { ChatContentMarkdownRenderer } from '../../../../contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { IChatMarkdownAnchorService } from '../../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatProgressMessage } from '../../../../contrib/chat/common/chatService/chatService.js';
import { IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { IChatResponseModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { ISessionChatPillVisibilityService, type IChatBackgroundShell } from '../../../../contrib/chat/common/sessionChatPills.js';
import { createSessionSubagentsPillData } from '../../../../contrib/chat/browser/sessionSubagentsPill.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/media/style.css';

function createMockContext(opts?: { isComplete?: boolean; hasFollowingContent?: boolean }): IChatContentPartRenderContext {
	const element = new class extends mock<IChatResponseViewModel>() {
		override readonly isComplete = opts?.isComplete ?? false;
	}();
	return {
		element,
		inlineTextModels: upcastPartial<InlineTextModelCollection>({}),
		elementIndex: 0,
		container: document.createElement('div'),
		content: opts?.hasFollowingContent ? [{ kind: 'progressMessage', content: new MarkdownString('test') }] : [],
		contentIndex: 0,
		editorPool: undefined!,
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: undefined!,
		currentWidth: observableValue('currentWidth', 400),
		onDidChangeVisibility: Event.None,
	};
}

function createProgressMessage(text: string): IChatProgressMessage {
	return {
		kind: 'progressMessage',
		content: new MarkdownString(text),
	};
}

function renderProgressPart(
	context: ComponentFixtureContext,
	message: IChatProgressMessage,
	renderContext: IChatContentPartRenderContext,
	opts?: {
		forceShowSpinner?: boolean;
		forceShowMessage?: boolean;
		icon?: ThemeIcon;
		shimmer?: boolean;
	},
): void {
	const { container, disposableStore } = context;

	const mockAnchorService = new class extends mock<IChatMarkdownAnchorService>() {
		override register() { return { dispose() { } }; }
	}();

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			reg.defineInstance(ILabelService, new class extends mock<ILabelService>() {
				override getUriLabel(uri: URI): string { return uri.path; }
			}());
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(IChatMarkdownAnchorService, mockAnchorService);
		},
	});

	const markdownRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);

	const part = disposableStore.add(
		instantiationService.createInstance(
			ChatProgressContentPart,
			message,
			markdownRenderer,
			renderContext,
			opts?.forceShowSpinner,
			opts?.forceShowMessage,
			opts?.icon,
			undefined, // toolInvocation
			opts?.shimmer,
			undefined, // isWorkingProgress
		)
	);

	// .interactive-session provides CSS custom properties (--vscode-chat-font-size-body-s, etc.)
	// .interactive-item-container .progress-container is the selector for layout styles
	container.style.width = '400px';
	container.style.padding = '8px';
	container.classList.add('interactive-session');

	const itemContainer = dom.$('.interactive-item-container');
	itemContainer.appendChild(part.domNode);
	container.appendChild(itemContainer);
}

async function renderWorkingBackgroundActivity(context: ComponentFixtureContext, openDropdown: boolean, kind: 'subagents' | 'backgroundShells' | 'mixed' = 'subagents', showReference = false): Promise<void> {
	const { container, disposableStore, theme } = context;
	container.style.width = kind === 'subagents' ? '440px' : '920px';
	container.style.height = openDropdown || kind !== 'subagents' ? '260px' : showReference ? '140px' : '80px';
	container.style.padding = '8px';
	container.classList.add('interactive-session', 'agent-sessions-workbench');
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
				override readonly mainContainer = container;
				override readonly activeContainer = container;
				override readonly onDidLayoutContainer = Event.None;
				override getContainer(): HTMLElement { return container; }
			}());
			reg.define(IContextViewService, ContextViewService);
			reg.define(IActionWidgetService, ActionWidgetService);
		},
	});
	disposableStore.add(registerActionWidgetTestKeybindings(container, instantiationService.get(IContextKeyService), instantiationService));
	const configurationService = instantiationService.get(IConfigurationService);
	if (!(configurationService instanceof TestConfigurationService)) {
		throw new Error('Expected fixture configuration service');
	}
	await configurationService.setUserConfiguration('editor', { fontFamily: 'monospace' });
	instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
	const subagents = createSessionSubagentsPillData(observableValue('subagents', [
		{ id: 'tests', title: 'Checking the regression tests', isActive: false, open: () => { } },
		{ id: 'review', title: 'Reviewing the dropdown behavior', isActive: true, open: () => { } },
		{ id: 'a11y', title: 'Checking keyboard accessibility', isActive: true, open: () => { } },
	]), instantiationService.get(ISessionChatPillVisibilityService).subagents);
	const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [{
		id: 'tests',
		description: 'Running the regression tests',
		command: 'npm test',
		startedAt: new Date(Date.now() - 60_000).toISOString(),
	}]);
	const element = new class extends mock<IChatResponseViewModel>() {
		override readonly id = 'running-subagents';
		override readonly sessionResource = URI.parse('chat-fixture:/running-subagents');
		override readonly isComplete = false;
		override readonly model = upcastPartial<IChatResponseModel>({
			isIncomplete: observableValue('isIncomplete', true),
			onDidChange: Event.None,
		});
		override setVote(): void { }
	}();
	const markdownRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
	const renderContext: IChatContentPartRenderContext = {
		...createMockContext(),
		element,
		suppressProgressShimmer: true,
		backgroundActivityPillSections: { subagents: subagents.inProgressSections, backgroundShells: shells },
	};
	const part = disposableStore.add(instantiationService.createInstance(ChatWorkingProgressContentPart, {
		kind: 'working',
		content: new MarkdownString(kind === 'subagents' ? '2 subagents running' : kind === 'backgroundShells' ? '1 background command running' : '2 subagents and 1 background command running'),
		backgroundActivity: {
			subagents: kind !== 'backgroundShells' ? '2 subagents running' : undefined,
			backgroundShells: kind !== 'subagents' ? '1 background command running' : undefined,
		},
	}, markdownRenderer, renderContext));
	const row = dom.append(container, dom.$('.interactive-item-container.interactive-response.chat-persistent-progress'));
	const value = dom.append(row, dom.$('.value'));
	if (showReference) {
		const reference = disposableStore.add(instantiationService.createInstance(ChatWorkingProgressContentPart, {
			kind: 'working',
			content: new MarkdownString('Reasoning'),
		}, markdownRenderer, renderContext));
		value.appendChild(reference.domNode);
	}
	value.appendChild(part.domNode);
	if (openDropdown) {
		const button = part.domNode.querySelector<HTMLElement>('.chat-dropdown-pill-button');
		if (!button) {
			throw new Error('Expected an interactive background-activity status');
		}
		button.click();
		await waitForFixtureCondition(() => !!container.querySelector('.action-widget'), 'Background activity dropdown must be visible');
		const list = container.querySelector<HTMLElement>('.monaco-list');
		if (list) {
			context.focus(list);
		}
	}
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	WorkingStatusLabelAlignment: defineComponentFixture({
		labels: { kind: 'animated' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		render: ctx => renderWorkingBackgroundActivity(ctx, false, 'subagents', true),
	}),

	RunningSubagents: defineComponentFixture({
		labels: { kind: 'animated' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		render: ctx => renderWorkingBackgroundActivity(ctx, false),
	}),

	RunningSubagentsDropdown: defineComponentFixture({
		labels: { kind: 'animated' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		render: ctx => renderWorkingBackgroundActivity(ctx, true),
	}),

	RunningBackgroundCommands: defineComponentFixture({
		labels: { kind: 'animated' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		render: ctx => renderWorkingBackgroundActivity(ctx, false, 'backgroundShells'),
	}),

	RunningBackgroundCommandsDropdown: defineComponentFixture({
		labels: { kind: 'animated' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		render: ctx => renderWorkingBackgroundActivity(ctx, true, 'backgroundShells'),
	}),

	RunningMixedBackgroundActivity: defineComponentFixture({
		labels: { kind: 'animated' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		render: ctx => renderWorkingBackgroundActivity(ctx, false, 'mixed'),
	}),

	RunningMixedBackgroundActivityDropdown: defineComponentFixture({
		labels: { kind: 'animated' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		render: ctx => renderWorkingBackgroundActivity(ctx, true, 'mixed'),
	}),

	WithSpinner: defineComponentFixture({
		labels: { kind: 'animated' },
		render: (ctx) => renderProgressPart(
			ctx,
			createProgressMessage('Searching workspace for relevant files...'),
			createMockContext({ isComplete: false }),
			{ forceShowSpinner: true, forceShowMessage: true, shimmer: false },
		),
	}),

	Completed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderProgressPart(
			ctx,
			createProgressMessage('Found 12 relevant files'),
			createMockContext({ isComplete: true }),
			{ forceShowSpinner: false, forceShowMessage: true },
		),
	}),

	WithCustomIcon: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderProgressPart(
			ctx,
			createProgressMessage('Running tests...'),
			createMockContext({ isComplete: false }),
			{ forceShowSpinner: true, forceShowMessage: true, icon: Codicon.beaker },
		),
	}),

	WithInlineCode: defineComponentFixture({
		labels: { kind: 'animated' },
		render: (ctx) => renderProgressPart(
			ctx,
			createProgressMessage('Reading `src/vs/workbench/contrib/chat/browser/chatWidget.ts`'),
			createMockContext({ isComplete: false }),
			{ forceShowSpinner: true, forceShowMessage: true, shimmer: false },
		),
	}),

	LongMessage: defineComponentFixture({
		labels: { kind: 'animated' },
		render: (ctx) => renderProgressPart(
			ctx,
			createProgressMessage('Searching across multiple workspace folders for TypeScript files matching the pattern you described, including test files and configuration'),
			createMockContext({ isComplete: false }),
			{ forceShowSpinner: true, forceShowMessage: true, shimmer: false },
		),
	}),
});
