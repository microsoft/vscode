/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatWidget } from '../../../../contrib/chat/browser/chat.js';
import { SessionType } from '../../../../contrib/chat/common/chatSessionsService.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../contrib/chat/browser/widget/input/chatInputPart.js';
import { IArtifactSourceGroup } from '../../../../contrib/chat/common/tools/chatArtifactsService.js';
import { IChatEditingSession } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IChatTodo } from '../../../../contrib/chat/common/tools/chatTodoListService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { ComponentFixtureContext, createEditorServices } from '../fixtureUtils.js';
import { FixtureMenuService, registerChatFixtureServices } from './chatFixtureUtils.js';

export interface ChatInputFixtureOptions {
	readonly artifacts?: readonly { label: string; uri: string; type: 'devServer' | 'screenshot' | 'plan' | undefined }[];
	readonly editingSession?: IChatEditingSession;
	readonly todos?: IChatTodo[];
	/** Enables the agent sandbox setting so the permission picker renders its sandboxed state. */
	readonly sandboxingEnabled?: boolean;
	/**
	 * Renders the input the way the Agents (sessions) window does: the
	 * `.interactive-input-part` is wrapped in the sessions DOM ancestry and the
	 * `isSessionsWindow` layout path is exercised. The caller is responsible for
	 * loading the sessions stylesheet so the 32px horizontal padding applies.
	 */
	readonly isSessionsWindow?: boolean;
	/** Seeds the input editor with this text. */
	readonly value?: string;
	/** Selects this range after seeding the text, to exercise selection rendering (e.g. reverse-rounded corners). */
	readonly selection?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
}

export async function renderChatInput(context: ComponentFixtureContext, fixtureOptions: ChatInputFixtureOptions = {}): Promise<void> {
	const { container, disposableStore } = context;
	const { artifacts = [], editingSession, todos = [], isSessionsWindow = false, value, selection, sandboxingEnabled = false } = fixtureOptions;
	const artifactGroups: IArtifactSourceGroup[] = artifacts.length > 0 ? [{ source: { kind: 'agent' as const }, artifacts }] : [];
	const artifactsObs = observableValue<readonly IArtifactSourceGroup[]>('artifactGroups', artifactGroups);

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			registerChatFixtureServices(reg, { artifactGroups: artifactsObs, todos });
		},
	});

	if (artifacts.length > 0) {
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		await configService.setUserConfiguration(ChatConfiguration.ArtifactsEnabled, true);
	}

	if (sandboxingEnabled) {
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		await configService.setUserConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled, true);
		await configService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);
	}

	container.style.width = '500px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	container.classList.add('monaco-workbench');

	const session = document.createElement('div');
	session.classList.add('interactive-session');
	container.appendChild(session);

	const menuService = instantiationService.get(IMenuService) as FixtureMenuService;
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.attachContext', title: '+', icon: Codicon.add }, group: 'navigation', order: -1 });
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.openModePicker', title: 'Agent' }, group: 'navigation', order: 1 });
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.openModelPicker', title: 'GPT-5.3-Codex' }, group: 'navigation', order: 3 });
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.configureTools', title: '', icon: Codicon.settingsGear }, group: 'navigation', order: 100 });
	menuService.addItem(MenuId.ChatExecute, { command: { id: 'workbench.action.chat.submit', title: 'Send', icon: Codicon.newLine }, group: 'navigation', order: 4 });
	menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openSessionTargetPicker', title: 'Local' }, group: 'navigation', order: 0 });
	menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openPermissionPicker', title: 'Default Approvals' }, group: 'navigation', order: 10 });

	const options: IChatInputPartOptions = {
		renderFollowups: false,
		renderInputToolbarBelowInput: false,
		renderWorkingSet: !!editingSession,
		menus: { executeToolbar: MenuId.ChatExecute, telemetrySource: 'fixture' },
		widgetViewKindTag: 'view',
		inputEditorMinLines: 2,
		isSessionsWindow,
		// The sandbox toggle is specific to the local harness, so present the
		// input as the local session type when exercising the sandboxed state.
		sessionTypePickerDelegate: sandboxingEnabled ? { getActiveSessionProvider: () => SessionType.Local } : undefined,
	};
	const styles: IChatInputStyles = {
		overlayBackground: 'var(--vscode-editor-background)',
		listForeground: 'var(--vscode-foreground)',
		listBackground: 'var(--vscode-editor-background)',
	};

	const inputPart = disposableStore.add(instantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, options, styles, false));
	const mockWidget = new class extends mock<IChatWidget>() {
		override readonly onDidChangeViewModel = new Emitter<never>().event;
		override readonly viewModel = undefined;
		override readonly contribs = [];
		override readonly location = ChatAgentLocation.Chat;
		override readonly viewContext = {};
	}();

	inputPart.render(session, '', mockWidget);
	inputPart.layout(500);
	await new Promise(r => setTimeout(r, 100));
	inputPart.layout(500);
	if (value !== undefined) {
		inputPart.setValue(value, true);
		inputPart.layout(500);
		if (selection) {
			inputPart.inputEditor.setSelection(selection);
		}
	}
	inputPart.renderArtifactsWidget(URI.parse('chat-session:test-session'));
	await inputPart.renderChatTodoListWidget(URI.parse('chat-session:test-session'));
	await new Promise(r => setTimeout(r, 50));

	if (editingSession) {
		inputPart.renderChatEditingSessionState(editingSession);
		await new Promise(r => setTimeout(r, 50));
		inputPart.layout(500);
	}
}
