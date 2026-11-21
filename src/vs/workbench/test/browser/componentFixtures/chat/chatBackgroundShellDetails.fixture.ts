/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { registerActionWidgetTestKeybindings } from '../../../../../platform/actionWidget/test/browser/actionWidgetTestUtils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatDropdownPillActionViewItem } from '../../../../browser/chatDropdownPill.js';
import { ChatPillsWidget, type IChatPill } from '../../../../browser/chatPills.js';
import type { ChatBackgroundShellOutput, IChatBackgroundShell } from '../../../../common/chatBackgroundShell.js';
import { SessionBackgroundShellsControl } from '../../../../contrib/chat/browser/sessionBackgroundShellsControl.js';
import { sessionBackgroundShellsPillOptions } from '../../../../contrib/chat/browser/sessionChatPillOptions.js';
import { IDetachedTerminalInstance, ITerminalService } from '../../../../contrib/terminal/browser/terminal.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';
import '../../../../../sessions/browser/media/style.css';

const longCommand = [
	'cd /tmp/demo-project &&',
	'python3 - <<\'PY\'',
	'import json',
	'import time',
	'',
	'samples = [',
	'    {"name": "alpha", "count": 12},',
	'    {"name": "bravo", "count": 8},',
	'    {"name": "charlie", "count": 15},',
	']',
	'',
	'for sample in samples:',
	'    print("Processed:", sample["name"])',
	'    time.sleep(1)',
	'',
	'print(json.dumps({"total": len(samples)}, indent=2))',
	'PY',
	'printf \'Finished sample checks\\n\'',
].join('\n');

interface IBackgroundShellDetailsFixture {
	readonly description: string;
	readonly command: string;
	readonly stoppable: boolean;
	/** Live output; without it the details show only the command, as for a detached shell. */
	readonly output?: ChatBackgroundShellOutput;
}

/** Opens a background shell's details from the Background Shells picker, as the keyboard does. */
async function renderBackgroundShellDetails(context: ComponentFixtureContext, shell: IBackgroundShellDetailsFixture): Promise<void> {
	const { container, disposableStore, theme } = context;
	container.style.width = '900px';
	container.style.height = '720px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.justifyContent = 'flex-end';
	container.style.padding = '8px';
	container.classList.add('agent-sessions-workbench');
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
			// The output stays empty: the details' layout doesn't depend on the terminal.
			reg.defineInstance(ITerminalService, new class extends mock<ITerminalService>() {
				override createDetachedTerminal(): Promise<IDetachedTerminalInstance> { return new Promise(() => { }); }
			}());
		},
	});
	disposableStore.add(registerActionWidgetTestKeybindings(container, instantiationService.get(IContextKeyService), instantiationService));
	const configurationService = instantiationService.get(IConfigurationService);
	if (!(configurationService instanceof TestConfigurationService)) {
		throw new Error('Expected fixture configuration service');
	}
	await configurationService.setUserConfiguration('editor', { fontFamily: 'monospace' });
	instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));

	const shells = constObservable<readonly IChatBackgroundShell[]>([{
		id: 'shell',
		description: shell.description,
		command: shell.command,
		startedAt: new Date(Date.now() - 65_000).toISOString(),
		output: shell.output ? constObservable(shell.output) : undefined,
		stop: shell.stoppable ? async () => true : undefined,
	}]);
	const control = disposableStore.add(instantiationService.createInstance(SessionBackgroundShellsControl, constObservable({ backgroundShells: shells })));
	const action = disposableStore.add(new Action('backgroundShells'));
	const pills = disposableStore.add(instantiationService.createInstance(ChatPillsWidget, {
		pills: constObservable<readonly IChatPill[]>([{
			action,
			createActionViewItem: options => instantiationService.createInstance(ChatDropdownPillActionViewItem, action, options, control.sections, sessionBackgroundShellsPillOptions),
		}]),
	}, undefined));
	// The pill sits at the bottom of the chat, so the picker and details open above it, outside the chat.
	const chat = dom.append(container, dom.$('.interactive-session'));
	chat.style.height = 'auto';
	chat.style.margin = '0';
	chat.appendChild(pills.element);

	const button = pills.element.querySelector<HTMLElement>('.chat-dropdown-pill-button');
	if (!button) {
		throw new Error('Expected the Background Shells pill');
	}
	button.click();
	await waitForFixtureCondition(() => !!container.querySelector('.action-widget .monaco-list'), 'Background Shells picker must be visible');
	const list = container.querySelector<HTMLElement>('.action-widget .monaco-list')!;
	list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
	await waitForFixtureCondition(() => !!container.querySelector('.chat-pill-hover-panel .chat-terminal-content-part'), 'Background shell details must be visible');
}

export default defineThemedFixtureGroup({ path: 'chat/backgroundShellDetails' }, {
	LongCommand: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => renderBackgroundShellDetails(ctx, {
			description: 'Update sample data and run tests',
			command: longCommand,
			stoppable: true,
			output: { status: 'running', text: '' },
		}),
	}),

	LongDescription: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderBackgroundShellDetails(ctx, {
			description: 'Stop the non-exiting isolated test process and stream its request log again from a fresh profile',
			command: 'python3 stream.py',
			stoppable: true,
			output: { status: 'running', text: '' },
		}),
	}),

	LongCommandWithoutDescription: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderBackgroundShellDetails(ctx, {
			description: '',
			command: longCommand,
			stoppable: true,
		}),
	}),

	ShortCommand: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderBackgroundShellDetails(ctx, {
			description: 'Run the unit tests',
			command: 'npm test',
			stoppable: true,
			output: { status: 'running', text: '' },
		}),
	}),

	ShortCommandWithoutDescription: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderBackgroundShellDetails(ctx, {
			description: '',
			command: 'npm run watch',
			stoppable: true,
		}),
	}),

	NotStoppable: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderBackgroundShellDetails(ctx, {
			description: 'Build the client',
			command: 'npm run compile',
			stoppable: false,
		}),
	}),
});
