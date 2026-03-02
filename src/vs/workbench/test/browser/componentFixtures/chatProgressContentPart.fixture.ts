/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Event } from '../../../../base/common/event.js';
import { observableValue } from '../../../../base/common/observable.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatProgressContentPart } from '../../../contrib/chat/browser/widget/chatContentParts/chatProgressContentPart.js';
import { ChatContentMarkdownRenderer } from '../../../contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { IChatContentPartRenderContext } from '../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { IChatMarkdownAnchorService } from '../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatProgressMessage } from '../../../contrib/chat/common/chatService/chatService.js';
import { IChatResponseViewModel } from '../../../contrib/chat/common/model/chatViewModel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

import '../../../contrib/chat/browser/widget/media/chat.css';

function createMockContext(opts?: { isComplete?: boolean; hasFollowingContent?: boolean }): IChatContentPartRenderContext {
	const element = new class extends mock<IChatResponseViewModel>() {
		override readonly isComplete = opts?.isComplete ?? false;
	}();
	return {
		element,
		elementIndex: 0,
		container: document.createElement('div'),
		content: opts?.hasFollowingContent ? [{ kind: 'progressMessage', content: new MarkdownString('test') }] : [],
		contentIndex: 0,
		editorPool: undefined!,
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: undefined!,
		codeBlockModelCollection: undefined!,
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

export default defineThemedFixtureGroup({
	WithSpinner: defineComponentFixture({
		render: (ctx) => renderProgressPart(
			ctx,
			createProgressMessage('Searching workspace for relevant files...'),
			createMockContext({ isComplete: false }),
			{ forceShowSpinner: true, forceShowMessage: true, shimmer: false },
		),
	}),

	Completed: defineComponentFixture({
		render: (ctx) => renderProgressPart(
			ctx,
			createProgressMessage('Found 12 relevant files'),
			createMockContext({ isComplete: true }),
			{ forceShowSpinner: false, forceShowMessage: true },
		),
	}),

	WithCustomIcon: defineComponentFixture({
		render: (ctx) => renderProgressPart(
			ctx,
			createProgressMessage('Running tests...'),
			createMockContext({ isComplete: false }),
			{ forceShowSpinner: true, forceShowMessage: true, icon: Codicon.beaker },
		),
	}),

	WithInlineCode: defineComponentFixture({
		render: (ctx) => renderProgressPart(
			ctx,
			createProgressMessage('Reading `src/vs/workbench/contrib/chat/browser/chatWidget.ts`'),
			createMockContext({ isComplete: false }),
			{ forceShowSpinner: true, forceShowMessage: true, shimmer: false },
		),
	}),

	LongMessage: defineComponentFixture({
		render: (ctx) => renderProgressPart(
			ctx,
			createProgressMessage('Searching across multiple workspace folders for TypeScript files matching the pattern you described, including test files and configuration'),
			createMockContext({ isComplete: false }),
			{ forceShowSpinner: true, forceShowMessage: true, shimmer: false },
		),
	}),
});
