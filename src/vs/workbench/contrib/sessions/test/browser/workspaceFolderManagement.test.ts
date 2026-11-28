/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../base/common/network.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, WorkbenchMode, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceFolderCreationData } from '../../../../../platform/workspaces/common/workspaces.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustUriInfo } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IFocusedSessionHostService, ISessionHost, ISessionHostService, SessionHostContent } from '../../../../services/sessions/browser/sessionHost.js';
import { ChatInteractivity, IChat, ISessionFolder, ISessionGitRepository, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { IWorkspaceFolderLabelService } from '../../../../services/workspaces/common/workspaceFolderLabelService.js';
import { FocusedSessionHostService } from '../../browser/sessionHostService.js';
import { WorkspaceFolderManagementContribution } from '../../browser/workspaceFolderManagement.js';
import { focusedSessionHostServiceOf, ITestSessionWithChat } from './sessionHostTestUtils.js';

const stubChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	workspace: constObservable(undefined),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changes: constObservable([]),
	changesets: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	modelSource: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	interactivity: constObservable(ChatInteractivity.Full),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
} satisfies IChat;

/** A plain in-place folder (not a worktree): `gitRepository.workTreeUri` is undefined. */
function localFolder(path: string): ISessionFolder {
	const uri = URI.file(path);
	return { root: uri, workingDirectory: uri, name: path, description: undefined };
}

/**
 * A folder whose working directory is a git worktree cut from `repoPath`
 * (working directory !== repository root, so `workTreeUri` is set).
 */
function worktreeFolder(repoPath: string, worktreePath: string): ISessionFolder {
	const root = URI.file(repoPath);
	const workingDirectory = URI.file(worktreePath);
	const gitRepository: ISessionGitRepository = {
		uri: root,
		workTreeUri: workingDirectory,
		baseBranchName: undefined,
		gitHubInfo: constObservable(undefined),
	};
	return { root, workingDirectory, name: worktreePath, description: undefined, gitRepository };
}

function makeWorkspace(folderOrFolders: ISessionFolder | readonly ISessionFolder[], requiresWorkspaceTrust: boolean): ISessionWorkspace {
	const folders = Array.isArray(folderOrFolders) ? folderOrFolders : [folderOrFolders];
	const folder = folders[0];
	return {
		uri: folder.root,
		label: folder.name,
		icon: Codicon.folder,
		folders,
		requiresWorkspaceTrust,
		isVirtualWorkspace: false,
	};
}

function makeActiveSession(sessionId: string, workspace: ISessionWorkspace | undefined, chatWorkspace = workspace): ITestSessionWithChat {
	const activeChat: IChat = { ...stubChat, workspace: constObservable(chatWorkspace) };
	return {
		resource: URI.parse(`test:///${sessionId}`),
		sessionId,
		providerId: 'test',
		sessionType: 'test',
		harness: 'copilot',
		environment: 'local',
		application: constObservable({ id: 'vscode', label: 'VS Code' }),
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(workspace),
		title: constObservable('Test'),
		updatedAt: constObservable(new Date()),
		status: constObservable(0),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable([]),
		mainChat: constObservable(activeChat),
		capabilities: constObservable({ supportsMultipleChats: false }),
		activeChat: constObservable(activeChat),
		isCreated: constObservable(true),
		sticky: constObservable(false),
		openChats: constObservable([]),
		closedChats: constObservable([]),
		lastClosedChat: undefined,
		visibleChatTabs: constObservable([]),
		shouldShowChatTabs: constObservable(false),
	};
}

class TestWorkspaceEditing extends mock<IWorkspaceEditingService>() {
	readonly addFoldersCalls: IWorkspaceFolderCreationData[][] = [];
	readonly removeFoldersCalls: URI[][] = [];
	readonly updateFoldersCalls: IWorkspaceFolderCreationData[][] = [];
	/** The currently-mounted folders, read back by the context service. */
	folders: IWorkspaceFolderCreationData[] = [];
	/** Called while a folder update is still running, like the folders change event of the context service. */
	onDidUpdateFolders: ((added: IWorkspaceFolderCreationData[], removed: IWorkspaceFolderCreationData[]) => void) | undefined;

	override async addFolders(folders: IWorkspaceFolderCreationData[]): Promise<void> {
		this.addFoldersCalls.push([...folders]);
		this.replaceFolders([...folders]);
	}

	override async removeFolders(folders: URI[]): Promise<void> {
		this.removeFoldersCalls.push([...folders]);
		this.replaceFolders([]);
	}

	override async updateFolders(_index: number, _deleteCount: number, folders: IWorkspaceFolderCreationData[] | undefined): Promise<void> {
		this.updateFoldersCalls.push(folders ? [...folders] : []);
		this.replaceFolders([...(folders ?? [])]);
	}

	private replaceFolders(folders: IWorkspaceFolderCreationData[]): void {
		const removed = this.folders.filter(folder => !folders.some(other => extUri.isEqual(other.uri, folder.uri)));
		const added = folders.filter(folder => !this.folders.some(other => extUri.isEqual(other.uri, folder.uri)));
		this.folders = folders;
		this.onDidUpdateFolders?.(added, removed);
	}
}

class TestWorkspaceTrust extends mock<IWorkspaceTrustManagementService>() {
	readonly trusted = new Set<string>();
	readonly setUrisTrustCalls: string[][] = [];

	trust(uri: URI): void {
		this.trusted.add(uri.toString());
	}

	override async getUriTrustInfo(uri: URI): Promise<IWorkspaceTrustUriInfo> {
		return { trusted: this.trusted.has(uri.toString()), uri };
	}

	override async setUrisTrust(uris: URI[], trusted: boolean): Promise<void> {
		this.setUrisTrustCalls.push(uris.map(uri => uri.toString()));
		if (trusted) {
			for (const uri of uris) {
				this.trusted.add(uri.toString());
			}
		}
	}
}

suite('WorkspaceFolderManagementContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(options: {
		mode?: WorkbenchMode;
		createFocusedSessionHostService?: () => IFocusedSessionHostService;
		canHandleResource?: IFileService['canHandleResource'];
	} = {}) {
		const activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', undefined);
		const workspaceEditing = new TestWorkspaceEditing();
		const workspaceTrust = new TestWorkspaceTrust();
		const workspaceFoldersChanged = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const toWorkspaceFolders = (folders: IWorkspaceFolderCreationData[]) => folders.map((folder, index) => new WorkspaceFolder({ uri: folder.uri, name: folder.name ?? folder.uri.path, index }));
		workspaceEditing.onDidUpdateFolders = (added, removed) => workspaceFoldersChanged.fire({ added: toWorkspaceFolders(added), removed: toWorkspaceFolders(removed), changed: [] });
		const modeChanged = disposables.add(new Emitter<WorkbenchMode>());
		let mode = options.mode ?? WorkbenchMode.Agents;
		const historyService = new class extends mock<IHistoryService>() {
			clearRecentlyOpenedCalls = 0;
			override clearRecentlyOpened(): void { this.clearRecentlyOpenedCalls++; }
		};

		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = workspaceFoldersChanged.event;
			override readonly onDidChangeWorkbenchMode = modeChanged.event;
			override getWorkbenchMode(): WorkbenchMode { return mode; }
			override getWorkspace(): IWorkspace {
				return {
					id: 'test',
					uri: undefined,
					folders: workspaceEditing.folders.map((folder, index) =>
						new WorkspaceFolder({ uri: folder.uri, name: folder.name ?? folder.uri.path, index }))
				};
			}
		};
		const uriIdentityService = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUri;
		};
		const folderLabel = new class extends mock<IWorkspaceFolderLabelService>() {
			label = 'label';
			// Mirrors the real service: the verbose label appends the branch name.
			override getWorkspaceFolderLabel(_folder: IWorkspaceFolder, verbose?: boolean): string {
				return verbose ? `${this.label} (branch)` : this.label;
			}
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFocusedSessionHostService, options.createFocusedSessionHostService?.() ?? focusedSessionHostServiceOf(activeSession));
		instantiationService.stub(IUriIdentityService, uriIdentityService);
		instantiationService.stub(IWorkspaceContextService, workspaceContextService);
		instantiationService.stub(IWorkspaceEditingService, workspaceEditing);
		instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrust);
		instantiationService.stub(IWorkspaceFolderLabelService, folderLabel);
		instantiationService.stub(IHistoryService, historyService);
		instantiationService.stub(IFileService, upcastPartial<IFileService>({
			canHandleResource: options.canHandleResource ?? (async resource => resource.scheme === Schemas.file),
		}));
		const contribution = disposables.add(instantiationService.createInstance(WorkspaceFolderManagementContribution));

		// Mirrors the facade: the workspace switches, then the mode change is announced
		const setMode = (newMode: WorkbenchMode, switchWorkspace?: () => void) => {
			mode = newMode;
			switchWorkspace?.();
			modeChanged.fire(newMode);
		};
		return { contribution, activeSession, workspaceEditing, workspaceTrust, folderLabel, historyService, workspaceFoldersChanged, setMode, workspaceContextService };
	}

	// Lets the reactive autorun's queued folder-management work run to completion.
	async function settle(): Promise<void> {
		for (let i = 0; i < 50; i++) {
			await Promise.resolve();
		}
	}

	test('clears recently opened editors only when the focused session replaces the window\'s folders, not when entering Agents mode from a folder window', async () => {
		const { activeSession, historyService, workspaceEditing, workspaceFoldersChanged, setMode } = createContribution({ mode: WorkbenchMode.Editor });
		const windowFolder = new WorkspaceFolder({ uri: URI.file('/window'), name: 'window', index: 0 });

		// The facade announces the mode before the window's own folder goes away
		setMode(WorkbenchMode.Agents);
		workspaceFoldersChanged.fire({ added: [], removed: [windowFolder], changed: [] });
		const onEntry = historyService.clearRecentlyOpenedCalls;
		activeSession.set(makeActiveSession('first', makeWorkspace(localFolder('/first'), false)), undefined);
		await settle();
		const onFirstMount = historyService.clearRecentlyOpenedCalls;
		activeSession.set(makeActiveSession('second', makeWorkspace(localFolder('/second'), false)), undefined);
		await settle();

		assert.deepStrictEqual({
			onEntry,
			onFirstMount,
			onSwitch: historyService.clearRecentlyOpenedCalls,
			mounted: workspaceEditing.folders.map(folder => folder.uri.path),
		}, { onEntry: 0, onFirstMount: 0, onSwitch: 1, mounted: ['/second'] });
	});

	test('mounts the focused chat only in the Agents mode and drops an update that outlives the mode', async () => {
		const slowFolder = localFolder('/slow');
		const probeStarted = new DeferredPromise<void>();
		const probeResult = new DeferredPromise<boolean>();
		const { activeSession, workspaceEditing, workspaceFoldersChanged, historyService, setMode } = createContribution({
			mode: WorkbenchMode.Editor,
			canHandleResource: async uri => {
				if (extUri.isEqual(uri, slowFolder.workingDirectory)) {
					await probeStarted.complete();
					return probeResult.p;
				}
				return true;
			},
		});
		const first = localFolder('/first');
		activeSession.set(makeActiveSession('first', makeWorkspace(first, false)), undefined);
		await settle();
		const beforeEntry = workspaceEditing.folders.map(folder => folder.uri.path);
		setMode(WorkbenchMode.Agents);
		await settle();
		const inMode = workspaceEditing.folders.map(folder => folder.uri.path);

		activeSession.set(makeActiveSession('slow', makeWorkspace(slowFolder, false)), undefined);
		await probeStarted.p;
		setMode(WorkbenchMode.Editor, () => {
			workspaceEditing.folders = [];
			workspaceFoldersChanged.fire({ added: [], removed: [new WorkspaceFolder({ uri: first.workingDirectory, name: 'first', index: 0 })], changed: [] });
		});
		await probeResult.complete(true);
		await settle();

		assert.deepStrictEqual({
			beforeEntry,
			inMode,
			afterExit: workspaceEditing.folders.map(folder => folder.uri.path),
			clearedHistory: historyService.clearRecentlyOpenedCalls,
		}, { beforeEntry: [], inMode: ['/first'], afterExit: [], clearedHistory: 0 });
	});

	test('does not mount a previous focus while its folders are still being checked', async () => {
		const previous = localFolder('/previous');
		const current = localFolder('/current');
		const probeStarted = new DeferredPromise<void>();
		const probeResult = new DeferredPromise<boolean>();
		const { activeSession, workspaceEditing } = createContribution({
			canHandleResource: async uri => {
				if (extUri.isEqual(uri, previous.workingDirectory)) {
					await probeStarted.complete();
					return probeResult.p;
				}
				return true;
			},
		});

		activeSession.set(makeActiveSession('previous', makeWorkspace(previous, false)), undefined);
		await probeStarted.p;
		activeSession.set(makeActiveSession('current', makeWorkspace(current, false)), undefined);
		await probeResult.complete(true);
		await settle();

		assert.deepStrictEqual({
			added: workspaceEditing.addFoldersCalls.map(folders => folders.map(folder => folder.uri.path)),
			updated: workspaceEditing.updateFoldersCalls,
		}, { added: [['/current']], updated: [] });
	});

	test('mounts a session that does not require workspace trust without granting trust', async () => {
		const { activeSession, workspaceEditing, workspaceTrust } = createContribution();
		const folder = localFolder('/repo-virtual');

		activeSession.set(makeActiveSession('a', makeWorkspace(folder, false)), undefined);
		await settle();

		assert.deepStrictEqual({
			added: workspaceEditing.addFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
			granted: workspaceTrust.setUrisTrustCalls,
		}, {
			added: [[folder.workingDirectory.toString()]],
			granted: [],
		});
	});

	test('mounts every folder from a multi-folder session workspace', async () => {
		const { activeSession, workspaceEditing } = createContribution();
		const primary = localFolder('/repo-primary');
		const secondary = localFolder('/repo-secondary');

		activeSession.set(makeActiveSession('a', makeWorkspace([primary, secondary], false)), undefined);
		await settle();

		assert.deepStrictEqual(
			workspaceEditing.addFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
			[[primary.workingDirectory.toString(), secondary.workingDirectory.toString()]],
		);
	});

	test('mounts only the active chat workspace subset', async () => {
		const { activeSession, workspaceEditing } = createContribution();
		const primary = localFolder('/repo-primary');
		const secondary = localFolder('/repo-secondary');

		activeSession.set(makeActiveSession(
			'a',
			makeWorkspace([primary, secondary], false),
			makeWorkspace(secondary, false),
		), undefined);
		await settle();

		assert.deepStrictEqual(
			workspaceEditing.addFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
			[[secondary.workingDirectory.toString()]],
		);
	});

	test('replaces workspace folders when the active chat changes', async () => {
		const { activeSession, workspaceEditing } = createContribution();
		const primary = localFolder('/repo-primary');
		const secondary = localFolder('/repo-secondary');
		const firstChat: IChat = { ...stubChat, resource: URI.parse('test:///chat-first'), workspace: constObservable(makeWorkspace(primary, false)) };
		const secondChat: IChat = { ...stubChat, resource: URI.parse('test:///chat-second'), workspace: constObservable(makeWorkspace(secondary, false)) };
		const activeChat = observableValue<IChat>('activeChat', firstChat);

		activeSession.set({ ...makeActiveSession('a', makeWorkspace([primary, secondary], false)), activeChat }, undefined);
		await settle();
		activeChat.set(secondChat, undefined);
		await settle();

		assert.deepStrictEqual({
			added: workspaceEditing.addFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
			updated: workspaceEditing.updateFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
		}, {
			added: [[primary.workingDirectory.toString()]],
			updated: [[secondary.workingDirectory.toString()]],
		});
	});

	test('updates a mounted workspace folder when its label changes', async () => {
		const { activeSession, workspaceEditing, folderLabel } = createContribution();
		const folder = worktreeFolder('/repo', '/repo.worktrees/session');

		folderLabel.label = 'session';
		activeSession.set(makeActiveSession('a', makeWorkspace(folder, false)), undefined);
		await settle();

		folderLabel.label = 'repo';
		activeSession.set(makeActiveSession('a', makeWorkspace(folder, false)), undefined);
		await settle();

		assert.deepStrictEqual({
			added: workspaceEditing.addFoldersCalls,
			updated: workspaceEditing.updateFoldersCalls,
		}, {
			added: [[{ uri: folder.workingDirectory, name: 'session' }]],
			updated: [[{ uri: folder.workingDirectory, name: 'repo' }]],
		});
	});

	test('trusts and mounts an added worktree when the active chat changes', async () => {
		const { activeSession, workspaceEditing, workspaceTrust } = createContribution();
		const primary = localFolder('/repo-primary');
		const secondary = worktreeFolder('/repo-secondary', '/repo-secondary.worktrees/feature');
		const firstChat: IChat = { ...stubChat, resource: URI.parse('test:///chat-first'), workspace: constObservable(makeWorkspace(primary, true)) };
		const secondChat: IChat = { ...stubChat, resource: URI.parse('test:///chat-second'), workspace: constObservable(makeWorkspace(secondary, true)) };
		const activeChat = observableValue<IChat>('activeChat', firstChat);
		workspaceTrust.trust(primary.workingDirectory);
		workspaceTrust.trust(secondary.root);

		activeSession.set({ ...makeActiveSession('a', makeWorkspace([primary, secondary], true)), activeChat }, undefined);
		await settle();
		activeChat.set(secondChat, undefined);
		await settle();

		assert.deepStrictEqual({
			granted: workspaceTrust.setUrisTrustCalls,
			added: workspaceEditing.addFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
			updated: workspaceEditing.updateFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
		}, {
			granted: [[secondary.workingDirectory.toString()]],
			added: [[primary.workingDirectory.toString()]],
			updated: [[secondary.workingDirectory.toString()]],
		});
	});

	test('replaces the complete workspace folder set when switching sessions', async () => {
		const { activeSession, workspaceEditing } = createContribution();
		const firstPrimary = localFolder('/repo-a');
		const firstSecondary = localFolder('/repo-b');
		const secondPrimary = localFolder('/repo-c');
		const secondSecondary = localFolder('/repo-d');

		activeSession.set(makeActiveSession('a', makeWorkspace([firstPrimary, firstSecondary], false)), undefined);
		await settle();
		activeSession.set(makeActiveSession('b', makeWorkspace([secondPrimary, secondSecondary], false)), undefined);
		await settle();

		assert.deepStrictEqual({
			added: workspaceEditing.addFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
			updated: workspaceEditing.updateFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
		}, {
			added: [[firstPrimary.workingDirectory.toString(), firstSecondary.workingDirectory.toString()]],
			updated: [[secondPrimary.workingDirectory.toString(), secondSecondary.workingDirectory.toString()]],
		});
	});

	test('mounts an already-trusted folder without granting trust', async () => {
		const { activeSession, workspaceEditing, workspaceTrust } = createContribution();
		const folder = localFolder('/repo-trusted');
		workspaceTrust.trust(folder.workingDirectory);

		activeSession.set(makeActiveSession('a', makeWorkspace(folder, true)), undefined);
		await settle();

		assert.deepStrictEqual({
			added: workspaceEditing.addFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
			granted: workspaceTrust.setUrisTrustCalls,
		}, {
			added: [[folder.workingDirectory.toString()]],
			granted: [],
		});
	});

	test('does not partially mount a multi-folder session when one folder is untrusted', async () => {
		const { activeSession, workspaceEditing, workspaceTrust } = createContribution();
		const primary = localFolder('/repo-trusted');
		const secondary = localFolder('/repo-untrusted');
		workspaceTrust.trust(primary.workingDirectory);

		activeSession.set(makeActiveSession('a', makeWorkspace([primary, secondary], true)), undefined);
		await settle();

		assert.deepStrictEqual({
			added: workspaceEditing.addFoldersCalls.length,
			updated: workspaceEditing.updateFoldersCalls.length,
			granted: workspaceTrust.setUrisTrustCalls,
		}, {
			added: 0,
			updated: 0,
			granted: [],
		});
	});

	test('does not mount an untrusted folder and never silently grants trust', async () => {
		const { activeSession, workspaceEditing, workspaceTrust } = createContribution();
		const folder = localFolder('/repo-untrusted');

		activeSession.set(makeActiveSession('a', makeWorkspace(folder, true)), undefined);
		await settle();

		assert.deepStrictEqual({
			added: workspaceEditing.addFoldersCalls.length,
			updated: workspaceEditing.updateFoldersCalls.length,
			granted: workspaceTrust.setUrisTrustCalls,
		}, {
			added: 0,
			updated: 0,
			granted: [],
		});
	});

	test('auto-trusts and mounts a worktree cut from a trusted repository', async () => {
		const { activeSession, workspaceEditing, workspaceTrust } = createContribution();
		const folder = worktreeFolder('/repo', '/repo.worktrees/feature');
		// The user trusted the base repo; the worktree itself is not yet trusted.
		workspaceTrust.trust(folder.root);

		activeSession.set(makeActiveSession('a', makeWorkspace(folder, true)), undefined);
		await settle();

		assert.deepStrictEqual({
			granted: workspaceTrust.setUrisTrustCalls,
			added: workspaceEditing.addFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
		}, {
			granted: [[folder.workingDirectory.toString()]],
			added: [[folder.workingDirectory.toString()]],
		});
	});

	test('does not auto-trust or mount a worktree cut from an untrusted repository', async () => {
		const { activeSession, workspaceEditing, workspaceTrust } = createContribution();
		const folder = worktreeFolder('/repo-untrusted', '/repo-untrusted.worktrees/feature');

		activeSession.set(makeActiveSession('a', makeWorkspace(folder, true)), undefined);
		await settle();

		assert.deepStrictEqual({
			granted: workspaceTrust.setUrisTrustCalls,
			added: workspaceEditing.addFoldersCalls.length,
		}, {
			granted: [],
			added: 0,
		});
	});

	test('does not auto-trust a workTree folder outside the repository .worktrees sibling', async () => {
		const { activeSession, workspaceEditing, workspaceTrust } = createContribution();
		// `workTreeUri` is set but the working directory is not under `<repo>.worktrees`,
		// so VS Code did not create it; a trusted base repo must not grant it trust
		// (structural provenance guard).
		const folder = worktreeFolder('/repo', '/elsewhere/checkout');
		workspaceTrust.trust(folder.root);

		activeSession.set(makeActiveSession('a', makeWorkspace(folder, true)), undefined);
		await settle();

		assert.deepStrictEqual({
			granted: workspaceTrust.setUrisTrustCalls,
			added: workspaceEditing.addFoldersCalls.length,
		}, {
			granted: [],
			added: 0,
		});
	});

	test('does not auto-trust the shared .worktrees container itself', async () => {
		const { activeSession, workspaceEditing, workspaceTrust } = createContribution();
		// A malformed session whose working directory is exactly `<repo>.worktrees`
		// must not be trusted: workspace trust applies to all descendants, so
		// trusting the container would silently trust every worktree under it. Only
		// a strict descendant (`<repo>.worktrees/<name>`) may inherit trust.
		const folder = worktreeFolder('/repo', '/repo.worktrees');
		workspaceTrust.trust(folder.root);

		activeSession.set(makeActiveSession('a', makeWorkspace(folder, true)), undefined);
		await settle();

		assert.deepStrictEqual({
			granted: workspaceTrust.setUrisTrustCalls,
			added: workspaceEditing.addFoldersCalls.length,
		}, {
			granted: [],
			added: 0,
		});
	});

	test('does not mount a session that has no workspace folder', async () => {
		const { activeSession, workspaceEditing } = createContribution();

		activeSession.set(makeActiveSession('a', undefined), undefined);
		await settle();

		assert.deepStrictEqual({
			added: workspaceEditing.addFoldersCalls.length,
			updated: workspaceEditing.updateFoldersCalls.length,
		}, {
			added: 0,
			updated: 0,
		});
	});

	test('mounts only the folders the window can read, not a repository\'s web address', async () => {
		const { activeSession, workspaceEditing } = createContribution();
		const repository = URI.parse('https://github.com/microsoft/vscode');
		const webAddress: ISessionFolder = { root: repository, workingDirectory: repository, name: 'microsoft/vscode', description: undefined };
		const checkout = localFolder('/checkout');

		activeSession.set(makeActiveSession('a', makeWorkspace(webAddress, false)), undefined);
		await settle();
		const projectOnly = workspaceEditing.folders.map(folder => folder.uri.toString());
		activeSession.set(makeActiveSession('b', makeWorkspace([webAddress, checkout], false)), undefined);
		await settle();

		assert.deepStrictEqual({ projectOnly, withCheckout: workspaceEditing.folders.map(folder => folder.uri.toString()) }, {
			projectOnly: [],
			withCheckout: [checkout.workingDirectory.toString()],
		});
	});

	test('unmounts the current folder when switching to an untrusted session', async () => {
		const { activeSession, workspaceEditing, workspaceTrust } = createContribution();
		const trustedFolder = localFolder('/repo-trusted');
		const untrustedFolder = localFolder('/repo-untrusted');
		workspaceTrust.trust(trustedFolder.workingDirectory);

		activeSession.set(makeActiveSession('a', makeWorkspace(trustedFolder, true)), undefined);
		await settle();
		activeSession.set(makeActiveSession('b', makeWorkspace(untrustedFolder, true)), undefined);
		await settle();

		assert.deepStrictEqual({
			added: workspaceEditing.addFoldersCalls.map(call => call.map(entry => entry.uri.toString())),
			removed: workspaceEditing.removeFoldersCalls.map(call => call.map(uri => uri.toString())),
		}, {
			added: [[trustedFolder.workingDirectory.toString()]],
			removed: [[trustedFolder.workingDirectory.toString()]],
		});
	});

	test('follows the focused host to the main window when focus returns from a chat window', async () => {
		const mainWindowId = mainWindow.vscodeWindowId;
		const chatWindowId = mainWindowId + 1000;
		const onDidChangeActiveWindow = disposables.add(new Emitter<number>());
		const mainChat = observableValue<IChat | undefined>('mainChat', undefined);
		const windowChat = observableValue<IChat | undefined>('windowChat', undefined);
		const makeHost = (windowId: number, chat: IObservable<IChat | undefined>) => upcastPartial<ISessionHost>({
			windowId: constObservable(windowId),
			parent: undefined,
			content: constObservable({ kind: 'chat' } as SessionHostContent),
			chat,
		});
		const mainHost = makeHost(mainWindowId, mainChat);
		const chatWindowHost = makeHost(chatWindowId, windowChat);
		const sessionHostService = upcastPartial<ISessionHostService>({
			hosts: constObservable([mainHost, chatWindowHost]),
			getHostOfWindow: (windowId: number) => windowId === chatWindowId ? chatWindowHost : mainHost,
		});
		const hostService = upcastPartial<IHostService>({ onDidChangeActiveWindow: onDidChangeActiveWindow.event });
		const { workspaceEditing } = createContribution({ createFocusedSessionHostService: () => disposables.add(new FocusedSessionHostService(sessionHostService, hostService)) });
		const chatOf = (path: string): IChat => ({ ...stubChat, workspace: constObservable(makeWorkspace(localFolder(path), false)) });

		windowChat.set(chatOf('/alpha'), undefined);
		onDidChangeActiveWindow.fire(chatWindowId);
		await settle();
		const whileChatWindowFocused = workspaceEditing.folders.map(folder => folder.uri.path);
		mainChat.set(chatOf('/beta'), undefined);
		await settle();
		const afterMainChatChanged = workspaceEditing.folders.map(folder => folder.uri.path);
		onDidChangeActiveWindow.fire(mainWindowId);
		await settle();

		assert.deepStrictEqual({
			whileChatWindowFocused,
			afterMainChatChanged,
			afterMainFocused: workspaceEditing.folders.map(folder => folder.uri.path),
		}, {
			whileChatWindowFocused: ['/alpha'],
			afterMainChatChanged: ['/alpha'],
			afterMainFocused: ['/beta'],
		});
	});
});
