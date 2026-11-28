/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { extUriIgnorePathCase } from '../../../../../../base/common/resources.js';
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
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { SessionWorkspacesEnabledContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { IOpenEmptyWindowOptions, IOpenWindowOptions, isFolderToOpen, isWorkspaceToOpen, IWindowOpenable } from '../../../../../../platform/window/common/window.js';
import { SessionSectionWorkspaceIsLocalContext, SessionSectionWorkspaceKindContext } from '../../../browser/views/sessionsListCommon.js';
import { ISessionGroup, ISessionGroupsService } from '../../../browser/sessionGroupsService.js';
import { IRecentSessionWorkspace, ISessionWorkspacesService, ISessionWorkspaceUpdate, SessionWorkspaceError } from '../../../common/sessionWorkspaces.js';
import { SessionWorkspaceDraftModel } from '../../../browser/workspaceEditor/sessionWorkspaceDraft.js';
import { SessionWorkspaceEditorWidget } from '../../../browser/workspaceEditor/sessionWorkspaceEditor.js';
import '../../../browser/workspaceEditor/sessionWorkspaceEditor.contribution.js';
import { REMOVE_SESSION_WORKSPACE_COMMAND_ID, SessionWorkspaceEditorAvailableContext } from '../../../browser/workspaceEditor/sessionWorkspaceEditorCommands.js';
import { SessionWorkspaceEditorInput, SessionWorkspaceEditorTarget } from '../../../browser/workspaceEditor/sessionWorkspaceEditorInput.js';
import { isWindows } from '../../../../../../base/common/platform.js';

suite('SessionWorkspaceEditor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	/** A path label with `/` separators, which the label service shows with `\` on Windows. */
	const posixLabel = (label: string | null | undefined) => label?.replace(/\\/g, '/');
	/** The label service shows a path in the user's home with `~`, except on Windows. */
	const home = isWindows ? '' : '~';
	const vscode = URI.file('/work/vscode');
	const docs = URI.file('/work/vscode-docs');
	const agents: IRecentSessionWorkspace = { uri: URI.file('/user/AgentsWorkspaces/Agents.code-workspace'), name: 'Agents', folders: [vscode, docs], owned: true, color: 'terminal.ansiGreen' };
	const isEqual = (a: URI, b: URI) => a.toString() === b.toString();

	function createWidget(target: SessionWorkspaceEditorTarget, pickedFolders: URI[] = [], whenCreated?: Promise<void>, updateError?: Error) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IListService, disposables.add(new ListService()));
		instantiationService.stub(IHoverService, upcastPartial<IHoverService>({ setupDelayedHover: () => Disposable.None }));
		instantiationService.stub(IFileDialogService, upcastPartial<IFileDialogService>({ showOpenDialog: async () => pickedFolders }));
		const calls: string[] = [];
		const errors: string[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ error: message => { errors.push(String(message)); } }));
		instantiationService.stub(ILogService, new NullLogService());
		let current: IRecentSessionWorkspace | undefined = target.kind === 'edit' ? target.workspace : undefined;
		const describe = (update: ISessionWorkspaceUpdate) => JSON.stringify({ ...update, folders: update.folders?.map(folder => folder.path) });
		instantiationService.stub(ISessionGroupsService, upcastPartial<ISessionGroupsService>({
			renameGroup: (id, name) => { calls.push(`renameGroup ${id} ${name}`); },
			setGroupIcon: (id, icon) => { calls.push(`setGroupIcon ${id} ${icon}`); },
			setGroupColor: (id, color) => { calls.push(`setGroupColor ${id} ${color}`); },
		}));
		instantiationService.stub(ISessionWorkspacesService, upcastPartial<ISessionWorkspacesService>({
			createWorkspace: async (name, folders, appearance) => {
				calls.push(`create ${describe({ name, folders, ...appearance })}`);
				await whenCreated;
				return current = { uri: URI.file(`/user/AgentsWorkspaces/${name}.code-workspace`), name, folders, owned: true, ...appearance };
			},
			updateWorkspace: async (uri, update) => {
				calls.push(`update ${uri.path} ${describe(update)}`);
				if (updateError) {
					throw updateError;
				}
				return current = { ...current!, name: update.name ?? current!.name, folders: update.folders ?? current!.folders, color: update.color === undefined ? current!.color : update.color ?? undefined };
			},
		}));
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add(toDisposable(() => container.remove()));
		const widget = disposables.add(instantiationService.createInstance(SessionWorkspaceEditorWidget, container, target));
		widget.layout(new Dimension(640, 600));
		const names: string[] = [target.kind === 'edit' ? target.workspace.name : target.kind === 'group' ? target.group.name : ''];
		disposables.add(widget.onDidChangeName(name => names.push(name)));
		const state = () => ({
			title: names.at(-1) || 'New Workspace',
			folders: Array.from(container.querySelectorAll('.monaco-list-row'), row => `${posixLabel(row.querySelector('.session-workspace-editor-path-label')?.textContent)}${(row.querySelector('.session-workspace-editor-default-tag') as HTMLElement).hidden ? '' : ' (default)'}`),
			message: container.querySelector('.session-workspace-editor-message')?.textContent,
		});
		const typeName = (value: string) => {
			const input = container.querySelector<HTMLInputElement>('.monaco-inputbox input')!;
			input.value = value;
			input.dispatchEvent(new Event('input'));
		};
		const button = (label: string) => Array.from(container.querySelectorAll<HTMLElement>('.monaco-button')).find(candidate => candidate.textContent === label)!;
		return { container, widget, calls, errors, state, typeName, button };
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

	test('an existing workspace applies each change as the user makes it, a custom color once picked, and keeps its last folder', async () => {
		const { container, widget, calls, state } = createWidget({ kind: 'edit', workspace: agents });
		const initial = state();
		const action = (label: string) => Array.from(container.querySelectorAll<HTMLElement>('.session-workspace-editor-folder-actions .action-label')).find(candidate => candidate.textContent === label || candidate.getAttribute('aria-label') === label)!;

		action('Set as Default').click();
		await widget.flush();
		const defaultSet = state();
		Array.from(container.querySelectorAll<HTMLElement>('.session-workspace-editor-swatch')).find(swatch => swatch.getAttribute('aria-label') === 'Blue')!.click();
		await widget.flush();
		// Moving through the system's color panel previews; picking applies once
		const colorInput = container.querySelector<HTMLInputElement>('.session-workspace-editor-color-input')!;
		for (const [value, type] of [['#ff0000', 'input'], ['#ff8800', 'input'], ['#ff8800', 'change']]) {
			colorInput.value = value;
			colorInput.dispatchEvent(new Event(type));
		}
		await widget.flush();
		action('Remove Folder').click();
		await widget.flush();
		const lastRemove = Array.from(container.querySelectorAll<HTMLElement>('.session-workspace-editor-folder-actions .action-label')).at(-1)!;
		const lastFolder = { ...state(), remove: `${lastRemove.getAttribute('aria-label')}${lastRemove.classList.contains('disabled') ? ' (disabled)' : ''}` };
		lastRemove.click();
		await widget.flush();

		assert.deepStrictEqual({ initial, defaultSet, lastFolder, footer: !!container.querySelector('.session-workspace-editor-footer'), calls }, {
			initial: { title: 'Agents', folders: [`${home}/work/vscode (default)`, `${home}/work/vscode-docs`], message: '' },
			defaultSet: { title: 'Agents', folders: [`${home}/work/vscode-docs (default)`, `${home}/work/vscode`], message: '' },
			lastFolder: { title: 'Agents', folders: [`${home}/work/vscode`], message: '', remove: 'Remove Folder (a workspace needs at least one folder) (disabled)' },
			footer: false,
			calls: [
				'update /user/AgentsWorkspaces/Agents.code-workspace {"folders":["/work/vscode-docs","/work/vscode"]}',
				'update /user/AgentsWorkspaces/Agents.code-workspace {"color":"terminal.ansiBlue"}',
				'update /user/AgentsWorkspaces/Agents.code-workspace {"color":"#ff8800"}',
				'update /user/AgentsWorkspaces/Agents.code-workspace {"folders":["/work/vscode"]}',
			],
		});
	});

	test('a new workspace\'s name follows its default folder until the user names it, and a previewed custom color is saved only once picked, and a preset picked meanwhile ends the preview', async () => {
		const created = createWidget({ kind: 'new' }, [vscode, docs]);
		created.button('Add Folder...').click();
		await created.widget.flush();
		const action = (container: HTMLElement, label: string) => Array.from(container.querySelectorAll<HTMLElement>('.session-workspace-editor-folder-actions .action-label')).find(candidate => candidate.textContent === label)!;
		action(created.container, 'Set as Default').click();
		await created.widget.flush();
		const nameInput = created.container.querySelector<HTMLInputElement>('.monaco-inputbox input')!;
		const named = { title: created.state().title, name: nameInput.value };
		created.button('Create').click();
		await created.widget.flush();

		// A change saved while the system's color panel previews a color keeps the workspace's color
		const edited = createWidget({ kind: 'edit', workspace: agents });
		const colorInput = edited.container.querySelector<HTMLInputElement>('.session-workspace-editor-color-input')!;
		colorInput.value = '#ff0000';
		colorInput.dispatchEvent(new Event('input'));
		action(edited.container, 'Set as Default').click();
		await edited.widget.flush();
		colorInput.dispatchEvent(new Event('change'));
		await edited.widget.flush();

		// A preset picked while the panel previews a color, which the user never picked, ends the preview
		const preset = createWidget({ kind: 'edit', workspace: agents });
		const presetInput = preset.container.querySelector<HTMLInputElement>('.session-workspace-editor-color-input')!;
		presetInput.value = '#00ff00';
		presetInput.dispatchEvent(new Event('input'));
		Array.from(preset.container.querySelectorAll<HTMLElement>('.session-workspace-editor-swatch')).find(swatch => swatch.getAttribute('aria-label') === 'Blue')!.click();
		await preset.widget.flush();
		const presetShown = {
			checked: preset.container.querySelector('.session-workspace-editor-swatch[aria-checked="true"]')?.getAttribute('aria-label'),
			custom: preset.container.querySelector<HTMLElement>('.session-workspace-editor-swatch.custom')?.hidden ? 'hidden' : 'shown',
		};

		assert.deepStrictEqual({ named, created: created.calls, edited: edited.calls, preset: preset.calls, presetShown }, {
			named: { title: 'vscode-docs', name: 'vscode-docs' },
			created: ['create {"name":"vscode-docs","folders":["/work/vscode-docs","/work/vscode"]}'],
			edited: [
				'update /user/AgentsWorkspaces/Agents.code-workspace {"folders":["/work/vscode-docs","/work/vscode"]}',
				'update /user/AgentsWorkspaces/Agents.code-workspace {"color":"#ff0000"}',
			],
			preset: ['update /user/AgentsWorkspaces/Agents.code-workspace {"color":"terminal.ansiBlue"}'],
			presetShown: { checked: 'Blue', custom: 'hidden' },
		});
	});

	test('while Create runs, Cancel is disabled and Create shows its progress; the editor closes once created, and stays open when creating fails', async () => {
		const run = async (succeed: boolean) => {
			const created = new DeferredPromise<void>();
			const { container, widget, calls, typeName, button } = createWidget({ kind: 'new' }, [vscode], created.p);
			let closes = 0;
			disposables.add(widget.onDidRequestClose(() => closes++));
			button('Add Folder...').click();
			await widget.flush();
			typeName('Agents');
			button('Create').click();
			await timeout(0);
			// Sorted, as Windows puts Create first
			const buttons = () => Array.from(container.querySelectorAll<HTMLElement>('.session-workspace-editor-footer .monaco-button'), candidate => `${candidate.textContent}${candidate.classList.contains('disabled') ? ' (disabled)' : ''}`).sort();
			const pending = buttons();
			button('Cancel').click();
			const closesWhilePending = closes;
			if (succeed) {
				created.complete();
			} else {
				created.error(new Error('disk full'));
			}
			await widget.flush();
			await timeout(0);
			return { pending, closesWhilePending, closes, after: buttons(), calls };
		};

		assert.deepStrictEqual({ success: await run(true), failure: await run(false) }, {
			// Created: the editor closes, its buttons stay disabled
			success: { pending: ['Cancel (disabled)', 'Creating... (disabled)'], closesWhilePending: 0, closes: 1, after: ['Cancel (disabled)', 'Create (disabled)'], calls: ['create {"name":"Agents","folders":["/work/vscode"]}'] },
			failure: { pending: ['Cancel (disabled)', 'Creating... (disabled)'], closesWhilePending: 0, closes: 0, after: ['Cancel', 'Create'], calls: ['create {"name":"Agents","folders":["/work/vscode"]}'] },
		});
	});

	test('a failed save shows the workspaces service\'s refusal as it is, any other error as a generic message, and nothing once the workspace was removed meanwhile', async () => {
		const save = async (error: Error) => {
			const { container, widget, errors } = createWidget({ kind: 'edit', workspace: agents }, [], undefined, error);
			Array.from(container.querySelectorAll<HTMLElement>('.session-workspace-editor-swatch')).find(swatch => swatch.getAttribute('aria-label') === 'Blue')!.click();
			await widget.flush();
			return errors;
		};

		assert.deepStrictEqual({
			refused: await save(new SessionWorkspaceError('The folders of the workspace file \'Agents.code-workspace\' were not changed.', 'foldersUnknown')),
			other: await save(new Error('EACCES: /user/AgentsWorkspaces/Agents.code-workspace')),
			// The workspace was removed while the change waited its turn
			cancelled: await save(new CancellationError()),
		}, {
			refused: ['The folders of the workspace file \'Agents.code-workspace\' were not changed.'],
			other: ['Could not save the workspace \'Agents\'. See the log for details.'],
			cancelled: [],
		});
	});

	test('a custom group edits its name and color, applied to the group as the user makes them, and has no folders', async () => {
		const release: ISessionGroup = { id: 'release', name: 'Release', createdAt: 1, color: 'terminal.ansiMagenta' };
		const { container, widget, calls, typeName } = createWidget({ kind: 'group', group: release });
		typeName('Release work');
		await widget.flush();
		Array.from(container.querySelectorAll<HTMLElement>('.session-workspace-editor-swatch')).find(swatch => swatch.getAttribute('aria-label') === 'Default')!.click();
		await widget.flush();
		typeName('');
		await widget.flush();

		assert.deepStrictEqual({
			foldersHidden: container.querySelectorAll<HTMLElement>('.session-workspace-editor-row')[3].hidden,
			footer: !!container.querySelector('.session-workspace-editor-footer'),
			calls,
		}, {
			foldersHidden: true,
			footer: false,
			// Nothing applies while the group has no name
			calls: ['renameGroup release Release work', 'setGroupColor release undefined'],
		});
	});

	test('the input is a modal fitted to its content, titled by the name, and matches its workspace across renames', () => {
		const renamed: IRecentSessionWorkspace = { ...agents, uri: URI.file('/user/AgentsWorkspaces/Agents 2.code-workspace'), name: 'Agents 2', previousUris: [agents.uri] };
		const input = disposables.add(new SessionWorkspaceEditorInput({ kind: 'new' }, extUriIgnorePathCase));
		const newName = input.getName();
		input.didApply(agents);
		const edit = disposables.add(new SessionWorkspaceEditorInput({ kind: 'edit', workspace: renamed }, extUriIgnorePathCase));
		const other = disposables.add(new SessionWorkspaceEditorInput({ kind: 'edit', workspace: { ...agents, uri: URI.file('/user/other.code-workspace'), previousUris: undefined } }, extUriIgnorePathCase));
		const fresh = disposables.add(new SessionWorkspaceEditorInput({ kind: 'new' }, extUriIgnorePathCase));

		assert.deepStrictEqual({
			newName, name: input.getName(), modal: !!(input.capabilities & EditorInputCapabilities.RequiresModal), options: input.getModalEditorOptions(),
			matchesRenamed: edit.matches(input), matchesOther: other.matches(input),
			// Workspace files compare as the workspaces service compares them, here without case
			matchesOtherCase: disposables.add(new SessionWorkspaceEditorInput({ kind: 'edit', workspace: { ...agents, uri: URI.file('/USER/AgentsWorkspaces/Agents.code-workspace') } }, extUriIgnorePathCase)).matches(input), newMatchesNew: fresh.matches(disposables.add(new SessionWorkspaceEditorInput({ kind: 'new' }, extUriIgnorePathCase))),
		}, {
			newName: 'New Workspace', name: 'Agents', modal: true,
			options: { alwaysModal: true, canMoveToEditorArea: false, canMaximize: false, compactHeader: true, fitToContent: true },
			matchesRenamed: true, matchesOther: false, matchesOtherCase: true, newMatchesNew: false,
		});
	});

	test('Remove Workspace removes it as chosen, then moves its sessions to their folders; failures show no raw error', async () => {
		const run = async (choice: boolean | undefined, { removeError, detachError, pendingRename, renameWhileAsked }: { removeError?: Error; detachError?: Error; pendingRename?: boolean; renameWhileAsked?: boolean } = {}) => {
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			const calls: string[] = [];
			let current: IRecentSessionWorkspace = { ...agents, previousUris: [URI.file('/user/AgentsWorkspaces/Old.code-workspace')] };
			// An open editor whose rename is still being saved, which moves the workspace to another file
			const input = new SessionWorkspaceEditorInput({ kind: 'edit', workspace: current }, extUriIgnorePathCase);
			const rename = new DeferredPromise<void>();
			if (pendingRename) {
				input.trackApply(rename.p.then(() => {
					calls.push('renamed');
					current = { ...current, uri: URI.file('/user/AgentsWorkspaces/Agents 2.code-workspace'), name: 'Agents 2', previousUris: [agents.uri, ...current.previousUris!] };
				}));
			}
			instantiationService.stub(ISessionWorkspacesService, upcastPartial<ISessionWorkspacesService>({
				getWorkspace: () => current,
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
			instantiationService.stub(IDialogService, upcastPartial<IDialogService>({
				prompt: async () => {
					if (renameWhileAsked) {
						// The open editor saves a rename while the user is asked, and has another save still to make
						current = { ...current, uri: URI.file('/user/AgentsWorkspaces/Agents 2.code-workspace'), name: 'Agents 2', previousUris: [agents.uri, ...current.previousUris!] };
						input.didApply(current);
						calls.push('renamed while asked');
						input.trackApply(rename.p.then(() => calls.push('saved')));
					}
					return { result: choice } as never;
				},
			}));
			instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ error: message => { calls.push(`error ${message}`); } }));
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
				getEditors: () => pendingRename || renameWhileAsked ? [{ editor: input, groupId: 0 }] : [],
				closeEditors: async editors => {
					calls.push(`close ${editors.length}`);
					input.dispose();
					// The rename finishes after the editor closed
					setTimeout(() => rename.complete(), 0);
				},
			}));
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(REMOVE_SESSION_WORKSPACE_COMMAND_ID)!.handler(accessor, agents.uri));
			if (!input.isDisposed()) {
				input.dispose();
			}
			return calls;
		};

		assert.deepStrictEqual({
			keepFile: await run(false),
			deleteFile: await run(true),
			cancelled: await run(undefined),
			refused: await run(true, { removeError: new Error('No trash') }),
			refusedWithReason: await run(true, { removeError: new SessionWorkspaceError('The workspace file cannot be moved to the trash.', 'noTrash') }),
			detachFailed: await run(false, { detachError: new Error('Failed to detach 1 of 1 sessions: vscode-agent-host://secret') }),
			pendingRenameKeepFile: await run(false, { pendingRename: true }),
			pendingRenameDeleteFile: await run(true, { pendingRename: true }),
			renameWhileAsked: await run(true, { renameWhileAsked: true }),
		}, {
			keepFile: ['remove /user/AgentsWorkspaces/Agents.code-workspace deleteFile=false', 'detach /user/AgentsWorkspaces/Agents.code-workspace, /user/AgentsWorkspaces/Old.code-workspace'],
			deleteFile: ['remove /user/AgentsWorkspaces/Agents.code-workspace deleteFile=true', 'detach /user/AgentsWorkspaces/Agents.code-workspace, /user/AgentsWorkspaces/Old.code-workspace'],
			cancelled: [],
			// A refused removal leaves the sessions with their workspace
			refused: ['remove /user/AgentsWorkspaces/Agents.code-workspace deleteFile=true', 'error Could not remove the workspace \'Agents\'. See the log for details.'],
			// The workspaces service's own refusals are shown as they are
			refusedWithReason: ['remove /user/AgentsWorkspaces/Agents.code-workspace deleteFile=true', 'error The workspace file cannot be moved to the trash.'],
			// The open editor closes and finishes saving its rename before the workspace, under its new file, is removed
			pendingRenameKeepFile: ['close 1', 'renamed', 'remove /user/AgentsWorkspaces/Agents 2.code-workspace deleteFile=false', 'detach /user/AgentsWorkspaces/Agents 2.code-workspace, /user/AgentsWorkspaces/Agents.code-workspace, /user/AgentsWorkspaces/Old.code-workspace'],
			pendingRenameDeleteFile: ['close 1', 'renamed', 'remove /user/AgentsWorkspaces/Agents 2.code-workspace deleteFile=true', 'detach /user/AgentsWorkspaces/Agents 2.code-workspace, /user/AgentsWorkspaces/Agents.code-workspace, /user/AgentsWorkspaces/Old.code-workspace'],
			// An editor that renamed the workspace while the user was asked still closes and saves first
			renameWhileAsked: ['renamed while asked', 'close 1', 'saved', 'remove /user/AgentsWorkspaces/Agents 2.code-workspace deleteFile=true', 'detach /user/AgentsWorkspaces/Agents 2.code-workspace, /user/AgentsWorkspaces/Agents.code-workspace, /user/AgentsWorkspaces/Old.code-workspace'],
			detachFailed: ['remove /user/AgentsWorkspaces/Agents.code-workspace deleteFile=false', 'detach /user/AgentsWorkspaces/Agents.code-workspace, /user/AgentsWorkspaces/Old.code-workspace', 'error Removed the workspace \'Agents\', but some of its sessions could not be moved to their folders. See the log for details.'],
		});
	});

	test('Remove offers to delete the workspace file only when there is one, and says when the file is the user\'s own', async () => {
		const prompt = async (workspace: IRecentSessionWorkspace) => {
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			let shown: { buttons: string[] | undefined; detail: string | undefined } | undefined;
			instantiationService.stub(ISessionWorkspacesService, upcastPartial<ISessionWorkspacesService>({ getWorkspace: () => workspace }));
			instantiationService.stub(IDialogService, upcastPartial<IDialogService>({
				prompt: async prompt => {
					shown = { buttons: prompt.buttons?.map(button => button.label), detail: typeof prompt.detail === 'string' ? posixLabel(prompt.detail) : undefined };
					return { result: undefined } as never;
				},
			}));
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(REMOVE_SESSION_WORKSPACE_COMMAND_ID)!.handler(accessor, workspace.uri));
			return shown;
		};

		assert.deepStrictEqual({
			owned: await prompt(agents),
			usersFile: await prompt({ ...agents, uri: URI.file('/work/agents.code-workspace'), owned: false }),
			folder: await prompt({ ...agents, uri: vscode, folders: [vscode], owned: false }),
			// A folder of its own, even named like a workspace file, has no file to delete
			folderNamedLikeFile: await prompt({ ...agents, uri: URI.file('/work/x.code-workspace'), folders: [URI.file('/work/x.code-workspace')], owned: true }),
			// A workspace whose file is gone has none to delete
			missingFile: await prompt({ ...agents, missing: true }),
		}, {
			owned: { buttons: ['&&Remove Workspace', '&&Delete Workspace and File'], detail: 'Its sessions are kept and listed by their folders. Delete Workspace and File also moves its workspace file to the trash.' },
			usersFile: { buttons: ['&&Remove Workspace', '&&Delete Workspace and Its File'], detail: `Its sessions are kept and listed by their folders. Delete Workspace and Its File also moves your workspace file ${home}/work/agents.code-workspace to the trash.` },
			folder: { buttons: ['&&Remove Workspace'], detail: 'Its sessions are kept and listed by their folders.' },
			folderNamedLikeFile: { buttons: ['&&Remove Workspace'], detail: 'Its sessions are kept and listed by their folders.' },
			missingFile: { buttons: ['&&Remove Workspace'], detail: 'Its sessions are kept and listed by their folders.' },
		});
	});

	test('a workspace row offers Open in Editor Window only for a workspace on this computer, and Edit and Remove only for one the workspaces service knows', () => {
		const items = (kind: string, local: boolean) => {
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			contextKeyService.createKey(ChatContextKeys.enabled.key, true);
			contextKeyService.createKey(SessionWorkspacesEnabledContext.key, true);
			contextKeyService.createKey(SessionWorkspaceEditorAvailableContext.key, true);
			contextKeyService.createKey(SessionSectionWorkspaceKindContext.key, kind);
			contextKeyService.createKey(SessionSectionWorkspaceIsLocalContext.key, local);
			return MenuRegistry.getMenuItems(Menus.SessionSectionContext)
				.filter(isIMenuItem)
				.filter(item => item.command.id.startsWith('sessionsView.') && item.command.id.includes('Workspace') && contextKeyService.contextMatchesRules(item.when))
				.map(item => item.command.id);
		};

		assert.deepStrictEqual({ local: items('known', true), remote: items('known', false), folder: items('folder', true), remoteFolder: items('folder', false), unknown: items('', false) }, {
			local: ['sessionsView.openWorkspaceInEditorWindow', 'sessionsView.editWorkspace', 'sessionsView.removeWorkspace'],
			remote: ['sessionsView.editWorkspace', 'sessionsView.removeWorkspace'],
			folder: ['sessionsView.openWorkspaceInEditorWindow'],
			remoteFolder: [],
			// The row of sessions without a folder lists no workspace
			unknown: [],
		});
	});

	test('Open in Editor Window opens a workspace file as a workspace and a folder as a folder, in a new window', async () => {
		const opened: unknown[] = [];
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IHostService, upcastPartial<IHostService>({
			openWindow: async (toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[], options?: IOpenWindowOptions) => {
				opened.push({ toOpen: (Array.isArray(toOpen) ? toOpen : []).map(item => isWorkspaceToOpen(item) ? { workspace: item.workspaceUri.toString(true) } : isFolderToOpen(item) ? { folder: item.folderUri.toString(true) } : item), forceNewWindow: options?.forceNewWindow });
			},
		}));
		const open = (uri: URI) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('sessionsView.openWorkspaceInEditorWindow')!.handler(accessor, { workspace: { uri, known: true } }));

		await open(URI.file('/Users/me/AgentsWorkspaces/Agents.code-workspace'));
		await open(URI.parse('file:///c:/Users/me/Agents.code-workspace'));
		await open(URI.parse('file://server/share/project'));
		// A remote row has nothing to open on this computer
		await open(URI.parse('vscode-agent-host://host/work/project'));

		assert.deepStrictEqual(opened, [
			{ toOpen: [{ workspace: 'file:///Users/me/AgentsWorkspaces/Agents.code-workspace' }], forceNewWindow: true },
			{ toOpen: [{ workspace: 'file:///c:/Users/me/Agents.code-workspace' }], forceNewWindow: true },
			{ toOpen: [{ folder: 'file://server/share/project' }], forceNewWindow: true },
		]);
	});
});
