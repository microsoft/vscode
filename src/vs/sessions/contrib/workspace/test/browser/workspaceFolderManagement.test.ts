/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceFolderCreationData } from '../../../../../platform/workspaces/common/workspaces.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustUriInfo } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkspaceEditingService } from '../../../../../workbench/services/workspaces/common/workspaceEditing.js';
import { IWorkspaceFolderLabelService } from '../../../../../workbench/services/workspaces/common/workspaceFolderLabelService.js';
import { ChatInteractivity, IChat, ISessionFolder, ISessionGitRepository, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { WorkspaceFolderManagementContribution } from '../../browser/workspaceFolderManagement.js';

const stubChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changes: constObservable([]),
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

function makeWorkspace(folder: ISessionFolder, requiresWorkspaceTrust: boolean): ISessionWorkspace {
	return {
		uri: folder.root,
		label: folder.name,
		icon: Codicon.folder,
		folders: [folder],
		requiresWorkspaceTrust,
		isVirtualWorkspace: false,
	};
}

function makeActiveSession(sessionId: string, workspace: ISessionWorkspace | undefined): IActiveSession {
	return {
		resource: URI.parse(`test:///${sessionId}`),
		sessionId,
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(workspace),
		title: constObservable('Test'),
		updatedAt: constObservable(new Date()),
		status: constObservable(0),
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable([]),
		mainChat: constObservable(stubChat),
		capabilities: constObservable({ supportsMultipleChats: false }),
		activeChat: constObservable(stubChat),
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
	folders: URI[] = [];

	override async addFolders(folders: IWorkspaceFolderCreationData[]): Promise<void> {
		this.addFoldersCalls.push([...folders]);
		this.folders = folders.map(folder => folder.uri);
	}

	override async removeFolders(folders: URI[]): Promise<void> {
		this.removeFoldersCalls.push([...folders]);
		this.folders = [];
	}

	override async updateFolders(_index: number, _deleteCount: number, folders: IWorkspaceFolderCreationData[] | undefined): Promise<void> {
		this.updateFoldersCalls.push(folders ? [...folders] : []);
		this.folders = (folders ?? []).map(folder => folder.uri);
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

	function createContribution() {
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const workspaceEditing = new TestWorkspaceEditing();
		const workspaceTrust = new TestWorkspaceTrust();

		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
		};
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override getWorkspace(): IWorkspace {
				return { folders: workspaceEditing.folders.map(uri => ({ uri })) } as unknown as IWorkspace;
			}
		};
		const uriIdentityService = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUri;
		};
		const folderLabel = new class extends mock<IWorkspaceFolderLabelService>() {
			override getWorkspaceFolderLabel(): string { return 'label'; }
		};

		const contribution = disposables.add(new WorkspaceFolderManagementContribution(
			sessionsService,
			uriIdentityService,
			workspaceContextService,
			workspaceEditing,
			workspaceTrust,
			folderLabel,
		));

		return { contribution, activeSession, workspaceEditing, workspaceTrust };
	}

	// Lets the reactive autorun's queued folder-management work run to completion.
	async function settle(): Promise<void> {
		for (let i = 0; i < 50; i++) {
			await Promise.resolve();
		}
	}

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
});
