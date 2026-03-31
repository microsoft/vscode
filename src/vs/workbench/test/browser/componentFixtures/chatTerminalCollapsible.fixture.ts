/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { observableValue } from '../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import type { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import type { IChatResponseViewModel } from '../../../contrib/chat/common/model/chatViewModel.js';
import { ChatTerminalThinkingCollapsibleWrapper } from '../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

import '../../../contrib/chat/browser/widget/media/chat.css';

function createMockContext(): IChatContentPartRenderContext {
	return {
		element: new class extends mock<IChatResponseViewModel>() { }(),
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
		inlineTextModels: upcastPartial<InlineTextModelCollection>({}),
	};
}

function renderCollapsible(context: ComponentFixtureContext, commandText: string, isSandboxWrapped: boolean, isComplete: boolean): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
	});

	container.style.width = '500px';
	container.style.padding = '8px';
	container.classList.add('monaco-workbench');

	const session = dom.$('.interactive-session');
	container.appendChild(session);

	const contentElement = dom.$('.chat-terminal-output-placeholder');
	contentElement.textContent = '(terminal output would appear here)';
	contentElement.style.padding = '8px';
	contentElement.style.color = 'var(--vscode-descriptionForeground)';

	const wrapper = disposableStore.add(instantiationService.createInstance(
		ChatTerminalThinkingCollapsibleWrapper,
		commandText,
		isSandboxWrapped,
		contentElement,
		createMockContext(),
		false,
		isComplete,
	));

	session.appendChild(wrapper.domNode);
}

export default defineThemedFixtureGroup({ path: 'chat/terminalCollapsible/' }, {
	'Ran - simple command': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'ls -lh', false, true),
	}),
	'Running - simple command': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'ls -lh', false, false),
	}),
	'Ran sandbox - simple command': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'ls -lh', true, true),
	}),
	'Running sandbox - simple command': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'ls -lh', true, false),
	}),
	'Ran - special chars': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'grep -rn "hello" ./src --include="*.ts"', false, true),
	}),
	'Ran sandbox - special chars': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'grep -rn "hello" ./src --include="*.ts"', true, true),
	}),
	'Ran - backticks': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'echo `date` && echo `hostname`', false, true),
	}),
	'Ran sandbox - backticks': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'echo `date` && echo `hostname`', true, true),
	}),
	'Ran sandbox - powershell backticks': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'Get-Process | Where-Object {$_.Name -eq `"notepad`"}', true, true),
	}),
});
