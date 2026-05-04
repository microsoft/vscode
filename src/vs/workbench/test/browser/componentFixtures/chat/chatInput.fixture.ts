/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatWidget } from '../../../../contrib/chat/browser/chat.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../contrib/chat/browser/widget/input/chatInputPart.js';
import { IArtifactSourceGroup } from '../../../../contrib/chat/common/tools/chatArtifactsService.js';
import { ChatEditingSessionState, IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IChatRequestDisablement } from '../../../../contrib/chat/common/model/chatModel.js';
import { IChatTodo } from '../../../../contrib/chat/common/tools/chatTodoListService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { FixtureMenuService, registerChatFixtureServices } from './chatFixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

interface ChatInputFixtureOptions {
	readonly artifacts?: readonly { label: string; uri: string; type: 'devServer' | 'screenshot' | 'plan' | undefined }[];
	readonly editingSession?: IChatEditingSession;
	readonly todos?: IChatTodo[];
}

async function renderChatInput(context: ComponentFixtureContext, fixtureOptions: ChatInputFixtureOptions = {}): Promise<void> {
	const { container, disposableStore } = context;
	const { artifacts = [], editingSession, todos = [] } = fixtureOptions;
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
	menuService.addItem(MenuId.ChatExecute, { command: { id: 'workbench.action.chat.submit', title: 'Send', icon: Codicon.arrowUp }, group: 'navigation', order: 4 });
	menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openSessionTargetPicker', title: 'Local' }, group: 'navigation', order: 0 });
	menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openPermissionPicker', title: 'Default Approvals' }, group: 'navigation', order: 10 });

	const options: IChatInputPartOptions = {
		renderFollowups: false,
		renderInputToolbarBelowInput: false,
		renderWorkingSet: !!editingSession,
		menus: { executeToolbar: MenuId.ChatExecute, telemetrySource: 'fixture' },
		widgetViewKindTag: 'view',
		inputEditorMinLines: 2,
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
	inputPart.renderArtifactsWidget(URI.parse('chat-session:test-session'));
	await inputPart.renderChatTodoListWidget(URI.parse('chat-session:test-session'));
	await new Promise(r => setTimeout(r, 50));

	if (editingSession) {
		inputPart.renderChatEditingSessionState(editingSession);
		await new Promise(r => setTimeout(r, 50));
		inputPart.layout(500);
	}
}

const sampleArtifacts = [
	{ label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' as const },
	{ label: 'Screenshot', uri: 'file:///tmp/screenshot.png', type: 'screenshot' as const },
	{ label: 'Plan', uri: 'file:///tmp/plan.md', type: 'plan' as const },
];

function createMockEditingSession(files: { uri: string; added: number; removed: number }[]): IChatEditingSession {
	const entries = files.map(f => {
		const entry = new class extends mock<IModifiedFileEntry>() {
			override readonly entryId = f.uri;
			override readonly modifiedURI = URI.parse(f.uri);
			override readonly originalURI = URI.parse(f.uri);
			override readonly state = observableValue('state', ModifiedFileEntryState.Modified);
			override readonly linesAdded = observableValue('linesAdded', f.added);
			override readonly linesRemoved = observableValue('linesRemoved', f.removed);
			override readonly lastModifyingRequestId = 'request-1';
			override readonly changesCount = observableValue('changesCount', 1);
			override readonly isCurrentlyBeingModifiedBy = observableValue('isCurrentlyBeingModifiedBy', undefined);
			override readonly lastModifyingResponse = observableValue('lastModifyingResponse', undefined);
			override readonly rewriteRatio = observableValue('rewriteRatio', 0);
			override readonly waitsForLastEdits = observableValue('waitsForLastEdits', false);
			override readonly reviewMode = observableValue('reviewMode', false);
			override readonly autoAcceptController = observableValue('autoAcceptController', undefined);
		}();
		return entry;
	});

	return new class extends mock<IChatEditingSession>() {
		override readonly isGlobalEditingSession = false;
		override readonly chatSessionResource = URI.parse('chat-session:test-session');
		override readonly onDidDispose = Event.None;
		override readonly state = observableValue('state', ChatEditingSessionState.Idle);
		override readonly entries = observableValue('entries', entries);
		override readonly requestDisablement = observableValue<IChatRequestDisablement[]>('requestDisablement', []);
	}();
}

const sampleTodos: IChatTodo[] = [
	{ id: 1, title: 'Set up project structure', status: 'completed' },
	{ id: 2, title: 'Implement auth service', status: 'in-progress' },
	{ id: 3, title: 'Add unit tests', status: 'not-started' },
];

export default defineThemedFixtureGroup({ path: 'chat/input/' }, {
	Default: defineComponentFixture({ render: context => renderChatInput(context) }),
	WithArtifacts: defineComponentFixture({ render: context => renderChatInput(context, { artifacts: sampleArtifacts }) }),
	WithFileChanges: defineComponentFixture({
		render: context => renderChatInput(context, { editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
	}),
	WithTodos: defineComponentFixture({
		render: context => renderChatInput(context, { todos: sampleTodos })
	}),
	WithTodosAndFileChanges: defineComponentFixture({
		render: context => renderChatInput(context, { todos: sampleTodos, editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
	}),
	WithArtifactsAndFileChanges: defineComponentFixture({
		render: context => renderChatInput(context, { artifacts: sampleArtifacts, editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
	}),
	Full: defineComponentFixture({
		render: context => renderChatInput(context, {
			artifacts: sampleArtifacts,
			editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]),
			todos: sampleTodos,
		})
	}),
});
