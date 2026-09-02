/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import type { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import type { IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ChatTerminalThinkingCollapsibleWrapper } from '../../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

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

function renderCollapsible(context: ComponentFixtureContext, commandText: string, isSandboxWrapped: boolean, isComplete: boolean, isSkipped: boolean = false, isRunningInBackground: boolean = false, intention: string | undefined = undefined): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
	});

	container.style.width = '500px';
	container.style.padding = '8px';
	container.classList.add('monaco-workbench', 'interactive-session');

	const itemContainer = dom.$('.interactive-item-container');
	container.appendChild(itemContainer);

	const contentElement = dom.$('.chat-terminal-output-placeholder');
	contentElement.textContent = '(terminal output would appear here)';
	contentElement.style.padding = '8px';
	contentElement.style.color = 'var(--vscode-descriptionForeground)';

	const wrapper = disposableStore.add(instantiationService.createInstance(
		ChatTerminalThinkingCollapsibleWrapper,
		commandText,
		intention,
		isSandboxWrapped,
		contentElement,
		createMockContext(),
		false,
		isComplete,
		isSkipped,
		isRunningInBackground,
		undefined,
	));

	itemContainer.appendChild(wrapper.domNode);
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
	'Ran - with intention': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'ls -lh', false, true, false, false, 'List files in the repo root'),
	}),
	'Height parity - with and without intention': defineComponentFixture({
		render: ctx => {
			renderCollapsible(ctx, 'ls -lh', false, true);
			renderCollapsible(ctx, 'ls -lh', false, true, false, false, 'List files in the repo root');
		},
	}),
	'Running - with intention': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'npm test', false, false, false, false, 'Run the test suite'),
	}),
	'Ran sandbox - with intention': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'ls -lh', true, true, false, false, 'List files in the repo root'),
	}),
	'Ran - long intention and command': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'grep -rn deprecatedHelper ./src --include=*.ts --color=never | head -50', false, true, false, false, 'Search the entire repository for references to the deprecated helper function'),
	}),
	'Ran - long intention short command': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'pwd', false, true, false, false, 'Print the absolute path of the current working directory so I know where I am'),
	}),
	'Ran - short intention long command': defineComponentFixture({
		render: ctx => renderCollapsible(ctx, 'find . -type f -name "*.ts" -not -path "*/node_modules/*" -newer package.json', false, true, false, false, 'Find changed files'),
	}),
});
