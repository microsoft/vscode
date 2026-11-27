/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IDialogService, IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IListService, ListService } from '../../../../../../platform/list/browser/listService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { EditorInputCapabilities } from '../../../../../common/editor.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { IRecentSessionWorkspace, ISessionWorkspacesService, ISessionWorkspaceUpdate } from '../../../common/sessionWorkspaces.js';
import { SessionWorkspaceDraftModel } from '../../../browser/workspaceEditor/sessionWorkspaceDraft.js';
import { SessionWorkspaceEditorWidget } from '../../../browser/workspaceEditor/sessionWorkspaceEditor.js';
import '../../../browser/workspaceEditor/sessionWorkspaceEditor.contribution.js';
import { REMOVE_SESSION_WORKSPACE_COMMAND_ID } from '../../../browser/workspaceEditor/sessionWorkspaceEditorCommands.js';
import { SessionWorkspaceEditorInput, SessionWorkspaceEditorTarget } from '../../../browser/workspaceEditor/sessionWorkspaceEditorInput.js';

suite('SessionWorkspaceEditor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const vscode = URI.file('/work/vscode');
	const docs = URI.file('/work/vscode-docs');
	const agents: IRecentSessionWorkspace = { uri: URI.file('/user/AgentsWorkspaces/Agents.code-workspace'), name: 'Agents', folders: [vscode, docs], owned: true, color: 'terminal.ansiGreen' };
	const isEqual = (a: URI, b: URI) => a.toString() === b.toString();

	function createWidget(target: SessionWorkspaceEditorTarget, pickedFolders: URI[] = []) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IListService, disposables.add(new ListService()));
		instantiationService.stub(IHoverService, upcastPartial<IHoverService>({ setupDelayedHover: () => Disposable.None }));
		instantiationService.stub(IFileDialogService, upcastPartial<IFileDialogService>({ showOpenDialog: async () => pickedFolders }));
		const calls: string[] = [];
		let current: IRecentSessionWorkspace | undefined = target.kind === 'edit' ? target.workspace : undefined;
		const describe = (update: ISessionWorkspaceUpdate) => JSON.stringify({ ...update, folders: update.folders?.map(folder => folder.path) });
		instantiationService.stub(ISessionWorkspacesService, upcastPartial<ISessionWorkspacesService>({
			createWorkspace: async (name, folders, appearance) => {
				calls.push(`create ${describe({ name, folders, ...appearance })}`);
				return current = { uri: URI.file(`/user/AgentsWorkspaces/${name}.code-workspace`), name, folders, owned: true, ...appearance };
			},
			updateWorkspace: async (uri, update) => {
				calls.push(`update ${uri.path} ${describe(update)}`);
				return current = { ...current!, name: update.name ?? current!.name, folders: update.folders ?? current!.folders, color: update.color === undefined ? current!.color : update.color ?? undefined };
			},
		}));
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add(toDisposable(() => container.remove()));
		const widget = disposables.add(instantiationService.createInstance(SessionWorkspaceEditorWidget, container, target));
		widget.layout(new Dimension(640, 600));
		const names: string[] = [target.kind === 'edit' ? target.workspace.name : ''];
		disposables.add(widget.onDidChangeName(name => names.push(name)));
		const state = () => ({
			title: names.at(-1) || 'New Workspace',
			folders: Array.from(container.querySelectorAll('.monaco-list-row'), row => `${row.querySelector('.session-workspace-editor-path-label')?.textContent}${(row.querySelector('.session-workspace-editor-default-tag') as HTMLElement).hidden ? '' : ' (default)'}`),
			message: container.querySelector('.session-workspace-editor-message')?.textContent,
		});
		const typeName = (value: string) => {
			const input = container.querySelector<HTMLInputElement>('.monaco-inputbox input')!;
			input.value = value;
			input.dispatchEvent(new Event('input'));
		};
		const button = (label: string) => Array.from(container.querySelectorAll<HTMLElement>('.monaco-button')).find(candidate => candidate.textContent === label)!;
		return { container, widget, calls, state, typeName, button };
	}

	test('the draft names a new workspace after its default folder until the user names it, and diffs what changed', () => {
		const draft = new SessionWorkspaceDraftModel({ name: '', folders: [] }, false, isEqual);
		const empty = { name: draft.name, valid: draft.isValid };
		draft.addFolders([vscode, docs, vscode]);
		const withFolders = { name: draft.name, folders: draft.folders.map(folder => folder.path), valid: draft.isValid };
		draft.setDefaultFolder(docs);
		const renamedDefault = draft.name;
		draft.setName('Agents');
		draft.removeFolder(docs);
		const applied = { name: 'Agents', folders: [vscode, docs], icon: 'rocket', color: 'terminal.ansiRed' };

		assert.deepStrictEqual({
			empty, withFolders, renamedDefault, named: { name: draft.name, folders: draft.folders.map(folder => folder.path) },
			update: draft.getUpdate(applied),
			unchanged: new SessionWorkspaceDraftModel(applied, true, isEqual).getUpdate(applied),
		}, {
			empty: { name: '', valid: false },
			withFolders: { name: 'vscode', folders: ['/work/vscode', '/work/vscode-docs'], valid: true },
			renamedDefault: 'vscode-docs',
			named: { name: 'Agents', folders: ['/work/vscode'] },
			// Cleared appearance is null, unchanged fields undefined
			update: { name: undefined, folders: [vscode], icon: null, color: null },
			unchanged: undefined,
		});
	});

	test('a new workspace is created only on Create, and shows what it needs once the user tried', async () => {
		const { container, widget, calls, state, typeName, button } = createWidget({ kind: 'new' }, [vscode]);
		let closes = 0;
		disposables.add(widget.onDidRequestClose(() => closes++));
		const view = () => ({ ...state(), create: button('Create').classList.contains('disabled') ? 'disabled' : 'enabled', reason: container.querySelector('.session-workspace-editor-create-reason')?.textContent });

		const initial = view();
		button('Create').dispatchEvent(new Event('focus'));
		const tried = view();
		button('Add Folder...').click();
		await widget.flush();
		typeName('Agents');
		await widget.flush();
		const callsBeforeCreate = [...calls];
		button('Create').click();
		await widget.flush();

		assert.deepStrictEqual({ initial, tried, callsBeforeCreate, calls, closes }, {
			initial: { title: 'New Workspace', folders: [], message: '', create: 'disabled', reason: 'A workspace needs a name. Add a folder: a workspace needs at least one.' },
			tried: { title: 'New Workspace', folders: [], message: 'Add a folder: a workspace needs at least one.', create: 'disabled', reason: 'A workspace needs a name. Add a folder: a workspace needs at least one.' },
			callsBeforeCreate: [],
			calls: ['create {"name":"Agents","folders":["/work/vscode"]}'],
			closes: 1,
		});
	});

	test('an existing workspace applies each change as the user makes it, and nothing while it has no folder', async () => {
		const { container, widget, calls, state } = createWidget({ kind: 'edit', workspace: agents });
		const initial = state();
		const action = (label: string) => Array.from(container.querySelectorAll<HTMLElement>('.session-workspace-editor-folder-actions .action-label')).find(candidate => candidate.textContent === label || candidate.getAttribute('aria-label') === label)!;

		action('Set as Default').click();
		await widget.flush();
		const defaultSet = state();
		Array.from(container.querySelectorAll<HTMLElement>('.session-workspace-editor-swatch')).find(swatch => swatch.getAttribute('aria-label') === 'Blue')!.click();
		await widget.flush();
		action('Remove Folder').click();
		await widget.flush();
		action('Remove Folder').click();
		await widget.flush();

		assert.deepStrictEqual({ initial, defaultSet, emptied: state(), footer: !!container.querySelector('.session-workspace-editor-footer'), calls }, {
			initial: { title: 'Agents', folders: ['~/work/vscode (default)', '~/work/vscode-docs'], message: '' },
			defaultSet: { title: 'Agents', folders: ['~/work/vscode-docs (default)', '~/work/vscode'], message: '' },
			emptied: { title: 'Agents', folders: [], message: 'Add a folder: a workspace needs at least one.' },
			footer: false,
			calls: [
				'update /user/AgentsWorkspaces/Agents.code-workspace {"folders":["/work/vscode-docs","/work/vscode"]}',
				'update /user/AgentsWorkspaces/Agents.code-workspace {"color":"terminal.ansiBlue"}',
				'update /user/AgentsWorkspaces/Agents.code-workspace {"folders":["/work/vscode"]}',
			],
		});
	});

	test('the input is a modal fitted to its content, titled by the name, and matches its workspace across renames', () => {
		const renamed: IRecentSessionWorkspace = { ...agents, uri: URI.file('/user/AgentsWorkspaces/Agents 2.code-workspace'), name: 'Agents 2', previousUris: [agents.uri] };
		const input = disposables.add(new SessionWorkspaceEditorInput({ kind: 'new' }));
		const newName = input.getName();
		input.didApply(agents);
		const edit = disposables.add(new SessionWorkspaceEditorInput({ kind: 'edit', workspace: renamed }));
		const other = disposables.add(new SessionWorkspaceEditorInput({ kind: 'edit', workspace: { ...agents, uri: URI.file('/user/other.code-workspace'), previousUris: undefined } }));
		const fresh = disposables.add(new SessionWorkspaceEditorInput({ kind: 'new' }));

		assert.deepStrictEqual({
			newName, name: input.getName(), modal: !!(input.capabilities & EditorInputCapabilities.RequiresModal), options: input.getModalEditorOptions(),
			matchesRenamed: edit.matches(input), matchesOther: other.matches(input), newMatchesNew: fresh.matches(disposables.add(new SessionWorkspaceEditorInput({ kind: 'new' }))),
		}, {
			newName: 'New Workspace', name: 'Agents', modal: true,
			options: { alwaysModal: true, canMoveToEditorArea: false, canMaximize: false, compactHeader: true, fitToContent: true },
			matchesRenamed: true, matchesOther: false, newMatchesNew: false,
		});
	});

	test('Remove Workspace removes it as chosen, then moves its sessions to their folders; failures show no raw error', async () => {
		const run = async (choice: boolean | undefined, { removeError, detachError }: { removeError?: Error; detachError?: Error } = {}) => {
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			const calls: string[] = [];
			const renamed: IRecentSessionWorkspace = { ...agents, previousUris: [URI.file('/user/AgentsWorkspaces/Old.code-workspace')] };
			instantiationService.stub(ISessionWorkspacesService, upcastPartial<ISessionWorkspacesService>({
				getWorkspace: () => renamed,
				removeWorkspace: async (uri, options) => {
					calls.push(`remove ${uri.path} deleteFile=${options?.deleteFile}`);
					if (removeError) {
						throw removeError;
					}
				},
			}));
			instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
				detachSessionsFromWorkspace: async files => {
					calls.push(`detach ${files.map(file => file.path).join(', ')}`);
					if (detachError) {
						throw detachError;
					}
				},
			}));
			instantiationService.stub(IDialogService, upcastPartial<IDialogService>({ prompt: async () => ({ result: choice }) as never }));
			instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ error: message => { calls.push(`error ${message}`); } }));
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ getEditors: () => [], closeEditors: async () => { } }));
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(REMOVE_SESSION_WORKSPACE_COMMAND_ID)!.handler(accessor, agents.uri));
			return calls;
		};

		assert.deepStrictEqual({
			keepFile: await run(false),
			deleteFile: await run(true),
			cancelled: await run(undefined),
			refused: await run(true, { removeError: new Error('No trash') }),
			detachFailed: await run(false, { detachError: new Error('Failed to detach 1 of 1 sessions: vscode-agent-host://secret') }),
		}, {
			keepFile: ['remove /user/AgentsWorkspaces/Agents.code-workspace deleteFile=false', 'detach /user/AgentsWorkspaces/Agents.code-workspace, /user/AgentsWorkspaces/Old.code-workspace'],
			deleteFile: ['remove /user/AgentsWorkspaces/Agents.code-workspace deleteFile=true', 'detach /user/AgentsWorkspaces/Agents.code-workspace, /user/AgentsWorkspaces/Old.code-workspace'],
			cancelled: [],
			// A refused removal leaves the sessions with their workspace
			refused: ['remove /user/AgentsWorkspaces/Agents.code-workspace deleteFile=true', 'error Could not remove the workspace \'Agents\'. See the log for details.'],
			detachFailed: ['remove /user/AgentsWorkspaces/Agents.code-workspace deleteFile=false', 'detach /user/AgentsWorkspaces/Agents.code-workspace, /user/AgentsWorkspaces/Old.code-workspace', 'error Removed the workspace \'Agents\', but some of its sessions could not be moved to their folders. See the log for details.'],
		});
	});
});
