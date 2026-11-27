/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IDialogService, IFileDialogService, IPrompt } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { Event } from '../../../../../base/common/event.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IRecentSessionWorkspace, ISessionWorkspacesService } from '../../../../contrib/sessions/common/sessionWorkspaces.js';
import { SESSION_WORKSPACE_EDITOR_WIDTH, SessionWorkspaceEditorWidget } from '../../../../contrib/sessions/browser/workspaceEditor/sessionWorkspaceEditor.js';
import { SessionWorkspaceEditorTarget } from '../../../../contrib/sessions/browser/workspaceEditor/sessionWorkspaceEditorInput.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { registerColors } from '../../../../contrib/terminal/common/terminalColorRegistry.js';
import { Dialog } from '../../../../../base/browser/ui/dialog/dialog.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ISessionsManagementService } from '../../../../contrib/sessions/common/sessionsManagement.js';
import { ISessionGroupsService } from '../../../../contrib/sessions/browser/sessionGroupsService.js';
import '../../../../contrib/sessions/browser/workspaceEditor/sessionWorkspaceEditor.contribution.js';
import { REMOVE_SESSION_WORKSPACE_COMMAND_ID } from '../../../../contrib/sessions/browser/workspaceEditor/sessionWorkspaceEditorCommands.js';

// The workspace colors are the terminal's ANSI colors, which both windows load with the terminal
registerColors();

/**
 * The Workspace editor as it shows in its modal: a frame with the modal's title bar around the editor's contents, which
 * the modal fits as the modal part does, centered over the window, in each of its states. A caption gives the modal's
 * size.
 */

const vscode = URI.file('/Users/me/work/vscode');
const docs = URI.file('/Users/me/work/vscode-docs');
const remote = URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+devbox', path: '/home/me/vscode-copilot-chat' });
const AGENTS: IRecentSessionWorkspace = { uri: URI.file('/Users/me/AgentsWorkspaces/Agents.code-workspace'), name: 'VS Code Agents', folders: [vscode, docs, remote], owned: true, icon: 'rocket', color: 'terminal.ansiGreen' };

type Interaction = 'rest' | 'focusFolderRow' | 'remotePathHover' | 'newTried' | 'newReady';

/** The window the modal shows over, and the modal part's compact header and border, which it fits the content with. */
const WINDOW_WIDTH = 1000;
const WINDOW_HEIGHT = 760;
const MODAL_HEADER_HEIGHT = 40;
const MODAL_BORDER = 1;

export default defineThemedFixtureGroup({ path: 'sessions/workspaceEditor/' }, {
	New: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderWorkspaceEditor(context, { kind: 'new' }),
	}),
	// Enter in the empty name tries Create: what the workspace still needs
	NewTried: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWorkspaceEditor(context, { kind: 'new' }, 'newTried'),
	}),
	// Two folders added, which name the workspace: Create is enabled
	NewReady: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWorkspaceEditor(context, { kind: 'new' }, 'newReady'),
	}),
	Edit: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderWorkspaceEditor(context, { kind: 'edit', workspace: AGENTS }),
	}),
	// The keyboard on the second folder row: its focus outline, and its actions, Set as Default and Remove Folder
	EditFolderRowFocused: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderWorkspaceEditor(context, { kind: 'edit', workspace: AGENTS }, 'focusFolderRow'),
	}),
	// The hover of a remote folder's path, which names the computer it is on
	EditRemotePathHover: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWorkspaceEditor(context, { kind: 'edit', workspace: AGENTS }, 'remotePathHover'),
	}),
	// The modal fits the content: with 6 folders
	EditSixFolders: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWorkspaceEditor(context, { kind: 'edit', workspace: { ...AGENTS, folders: [vscode, docs, remote, ...['vscode-python', 'vscode-js-debug', 'vscode-pull-request-github'].map(name => URI.file(`/Users/me/work/${name}`))] } }),
	}),
	// A custom color: one more swatch, selected, and the icon in it
	EditCustomColor: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderWorkspaceEditor(context, { kind: 'edit', workspace: { ...AGENTS, color: '#ff8800' } }),
	}),
	// A theme color chosen: the custom swatch keeps the last custom color picked, which one click chooses again
	EditCustomColorOtherChosen: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderWorkspaceEditor(context, { kind: 'edit', workspace: AGENTS }, 'rest', '#ff8800'),
	}),
	// A custom group, which has a name, an icon and a color, and no folders
	EditGroup: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderWorkspaceEditor(context, { kind: 'group', group: { id: 'release', name: 'Release work', createdAt: 0, icon: 'rocket', color: 'terminal.ansiMagenta' } }),
	}),
	// Remove Workspace... on a workspace file the user made: deleting it says that it is theirs, and where it is
	RemoveUsersFile: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderRemoveDialog(context, { ...AGENTS, uri: URI.file('/Users/me/work/agents.code-workspace'), name: 'agents', owned: false }),
	}),
});

/** The Remove Workspace command's dialog, as the workbench's dialog shows it, run by the command itself. */
function renderRemoveDialog(context: ComponentFixtureContext, workspace: IRecentSessionWorkspace): void {
	const { container, disposableStore, theme } = context;
	container.style.width = `${WINDOW_WIDTH}px`;
	container.style.height = `${WINDOW_HEIGHT}px`;
	container.style.position = 'relative';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.defineInstance(ISessionWorkspacesService, new class extends mock<ISessionWorkspacesService>() {
				declare readonly _serviceBrand: undefined;
				override getWorkspace(): IRecentSessionWorkspace { return workspace; }
			}());
			registration.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				declare readonly _serviceBrand: undefined;
				override readonly extUri = extUri;
			}());
			registration.definePartialInstance(IQuickInputService, {});
			registration.definePartialInstance(IEditorService, {});
			registration.definePartialInstance(ISessionsManagementService, {});
			registration.defineInstance(IDialogService, new class extends mock<IDialogService>() {
				declare readonly _serviceBrand: undefined;
				override prompt<T>(prompt: IPrompt<T>): Promise<never> {
					const buttons = [...(prompt.buttons ?? []).map(button => button.label), 'Cancel'];
					const dialog = disposableStore.add(new Dialog(container, prompt.message, buttons, {
						cancelId: buttons.length - 1,
						detail: typeof prompt.detail === 'string' ? prompt.detail : undefined,
						type: 'warning',
						buttonStyles: defaultButtonStyles,
						checkboxStyles: defaultCheckboxStyles,
						inputBoxStyles: defaultInputBoxStyles,
						dialogStyles: defaultDialogStyles,
					}));
					void dialog.show();
					return new Promise(() => { });
				}
			}());
		},
	});
	void instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(REMOVE_SESSION_WORKSPACE_COMMAND_ID)!.handler(accessor, workspace.uri));
}

async function renderWorkspaceEditor(context: ComponentFixtureContext, target: SessionWorkspaceEditorTarget, interaction: Interaction = 'rest', lastCustomColor?: string): Promise<void> {
	const { container, disposableStore, theme } = context;
	container.style.width = `${WINDOW_WIDTH}px`;
	container.style.height = `${WINDOW_HEIGHT}px`;
	container.style.position = 'relative';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	// The modal over the window: its dimmed backdrop, and its box with a title bar
	const backdrop = DOM.append(container, DOM.$('div'));
	backdrop.style.cssText = 'position: absolute; inset: 0; background-color: var(--vscode-widget-shadow);';
	const box = DOM.append(container, DOM.$('div'));
	box.style.cssText = 'position: absolute; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); border: var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder, transparent)); border-radius: var(--vscode-cornerRadius-large); box-shadow: 0 0 8px 2px var(--vscode-widget-shadow);';
	const titleBar = DOM.append(box, DOM.$('div'));
	titleBar.style.cssText = `display: flex; align-items: center; justify-content: space-between; height: ${MODAL_HEADER_HEIGHT}px; padding: 0 var(--vscode-spacing-size80) 0 var(--vscode-spacing-size160); flex-shrink: 0;`;
	const titleLabel = DOM.append(titleBar, DOM.$('span'));
	DOM.append(titleBar, renderIcon(Codicon.close));
	const editorHost = DOM.append(box, DOM.$('div'));
	editorHost.style.cssText = 'flex: 1; min-height: 0;';

	// The hovers the editor sets up, by their target, which the fixture shows in place of a pointer resting on them
	const delayedHovers = new Map<HTMLElement, () => string>();
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.definePartialInstance(ILayoutService, { getContainer: () => container, activeContainer: container, mainContainer: container, onDidLayoutContainer: Event.None, onDidAddContainer: Event.None, get containers() { return [container]; } });
			registration.define(IMarkdownRendererService, MarkdownRendererService);
			// The last custom color the user picked, which the editor stores
			const storage = disposableStore.add(new InMemoryStorageService());
			if (lastCustomColor) {
				storage.store('sessions.workspaceEditor.lastCustomColor', lastCustomColor, StorageScope.PROFILE, StorageTarget.USER);
			}
			registration.defineInstance(IStorageService, storage);
			registration.define(IHoverService, class extends HoverService {
				override setupDelayedHover(target: HTMLElement, options: Parameters<IHoverService['setupDelayedHover']>[1], lifecycleOptions?: Parameters<IHoverService['setupDelayedHover']>[2]) {
					delayedHovers.set(target, () => {
						const resolved = typeof options === 'function' ? options() : options;
						return typeof resolved.content === 'string' ? resolved.content : '';
					});
					return super.setupDelayedHover(target, options, lifecycleOptions);
				}
				override showInstantHover(options: Parameters<IHoverService['showInstantHover']>[0], focus?: boolean) {
					return super.showInstantHover({ ...options, container }, focus);
				}
			});
			registration.defineInstance(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
				declare readonly _serviceBrand: undefined;
				override renameGroup(): void { }
				override setGroupIcon(): void { }
				override setGroupColor(): void { }
			}());
			registration.defineInstance(ISessionWorkspacesService, new class extends mock<ISessionWorkspacesService>() {
				declare readonly _serviceBrand: undefined;
				override async updateWorkspace(): Promise<IRecentSessionWorkspace> { return target.kind === 'edit' ? target.workspace : AGENTS; }
				override async createWorkspace(): Promise<IRecentSessionWorkspace> { return AGENTS; }
			}());
			registration.define(IListService, ListService);
			// The icon picker is a quick pick, which the fixtures do not open
			registration.definePartialInstance(IQuickInputService, {});
			registration.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				declare readonly _serviceBrand: undefined;
				override readonly extUri = extUri;
			}());
			registration.defineInstance(IFileDialogService, new class extends mock<IFileDialogService>() {
				declare readonly _serviceBrand: undefined;
				override async showOpenDialog(): Promise<URI[] | undefined> { return interaction === 'newReady' ? [vscode, docs] : undefined; }
			}());
		},
	});
	const widget = disposableStore.add(instantiationService.createInstance(SessionWorkspaceEditorWidget, editorHost, target));
	titleLabel.textContent = target.kind === 'edit' ? target.workspace.name : target.kind === 'group' ? target.group.name : 'New Workspace';
	disposableStore.add(widget.onDidChangeName(name => titleLabel.textContent = name || 'New Workspace'));
	if (interaction === 'newReady') {
		editorHost.querySelector<HTMLElement>('.session-workspace-editor-add-folder .monaco-button')?.click();
		await new Promise(resolve => setTimeout(resolve, 0));
		await widget.flush();
	} else if (interaction === 'newTried') {
		const enter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
		Object.defineProperty(enter, 'keyCode', { get: () => 13 });
		editorHost.querySelector('.monaco-inputbox input')?.dispatchEvent(enter);
	}

	// As the modal part fits a modal to its content, within the window, centered
	editorHost.style.width = `${SESSION_WORKSPACE_EDITOR_WIDTH}px`;
	widget.layout(new DOM.Dimension(SESSION_WORKSPACE_EDITOR_WIDTH, WINDOW_HEIGHT));
	const width = SESSION_WORKSPACE_EDITOR_WIDTH + 2 * MODAL_BORDER;
	const height = Math.min(widget.contentHeight + MODAL_HEADER_HEIGHT + 2 * MODAL_BORDER, WINDOW_HEIGHT);
	box.style.width = `${width}px`;
	box.style.height = `${height}px`;
	box.style.left = `${(WINDOW_WIDTH - width) / 2}px`;
	box.style.top = `${(WINDOW_HEIGHT - height) / 2}px`;
	widget.layout(new DOM.Dimension(SESSION_WORKSPACE_EDITOR_WIDTH, height - MODAL_HEADER_HEIGHT - 2 * MODAL_BORDER));
	const caption = DOM.append(container, DOM.$('div'));
	caption.style.cssText = 'position: absolute; left: 8px; bottom: 4px; font-size: 11px; color: var(--vscode-descriptionForeground);';
	caption.textContent = `Modal ${width} × ${height} (content ${SESSION_WORKSPACE_EDITOR_WIDTH} × ${widget.contentHeight})`;

	if (interaction === 'remotePathHover') {
		const remoteLabel = Array.from(editorHost.querySelectorAll<HTMLElement>('.session-workspace-editor-path-label')).find(label => label.textContent?.includes('vscode-copilot-chat'));
		const content = remoteLabel && delayedHovers.get(remoteLabel)?.();
		if (!remoteLabel || !content) {
			throw new Error('Expected the remote folder\'s path and its hover.');
		}
		disposableStore.add(toDisposable(() => instantiationService.get(IHoverService).hideHover(true)));
		instantiationService.get(IHoverService).showInstantHover({ content, target: remoteLabel, position: { hoverPosition: HoverPosition.BELOW } });
		return;
	}

	if (interaction !== 'rest' && interaction !== 'newTried' && interaction !== 'newReady') {
		const list = editorHost.querySelector<HTMLElement>('.session-workspace-editor-folders-table .monaco-list');
		if (!list) {
			throw new Error('Expected the folders table to render.');
		}
		// The keyboard into the table and down to its second row, as Down Arrow's list.focusDown command does
		list.focus();
		list.dispatchEvent(new FocusEvent('focus')); // a headless window may have no OS focus to fire it
		const listService = instantiationService.get(IListService);
		listService.lastFocusedList?.focusNext();
		listService.lastFocusedList?.focusNext();
	}
}
