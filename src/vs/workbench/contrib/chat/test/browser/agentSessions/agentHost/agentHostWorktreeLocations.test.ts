/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { extUri } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { WorkbenchState } from '../../../../../../../platform/workspace/common/workspace.js';
import { BrowserWorkspaceEditingService } from '../../../../../../services/workspaces/browser/workspaceEditingService.js';
import { AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID, AgentHostWorktreeLocationProvider, getAgentHostSessionWorkingDirectories } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeLocations.js';
import { IAgentSession } from '../../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { IChatSessionsService, SessionType } from '../../../../common/chatSessionsService.js';

suite('AgentHostWorktreeLocations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function session(providerType: string, workingDirectoryPath: string | undefined, archived = false): IAgentSession {
		return upcastPartial<IAgentSession>({ providerType, metadata: workingDirectoryPath ? { workingDirectoryPath } : undefined, isArchived: () => archived });
	}

	/**
	 * A provider over git entries: `true` is a `.git` directory, and a string the content of a file, such as a worktree's
	 * `.git` file or its entry's `gitdir` file in the repository.
	 */
	/**
	 * @param uncached the sessions of the local agent host provider that the sessions list has only once that provider resolves,
	 * which `loading` holds, while another provider, `remote`, has resolved.
	 */
	function createProvider(entries: Record<string, string | boolean>, sessions: readonly IAgentSession[], uncached: readonly IAgentSession[] = [], links: Record<string, string> = {}, loading?: Promise<void>) {
		// A path through a symbolic link, such as `links['/link/vscode'] = '/work/vscode'`, is the path it links to
		const real = (path: string) => {
			const link = Object.keys(links).find(candidate => path === candidate || path.startsWith(`${candidate}/`));
			return link ? links[link] + path.slice(link.length) : path;
		};
		const fileService = upcastPartial<IFileService>({
			stat: async (resource: URI) => {
				const entry = entries[real(resource.path)];
				if (entry === undefined) {
					throw new FileOperationError('not found', FileOperationResult.FILE_NOT_FOUND);
				}
				return upcastPartial<IFileStatWithMetadata>({ isDirectory: entry === true });
			},
			realpath: async (resource: URI) => URI.file(real(resource.path)),
			readFile: async (resource: URI) => {
				const entry = entries[real(resource.path)];
				if (typeof entry !== 'string') {
					throw new FileOperationError('not found', FileOperationResult.FILE_NOT_FOUND);
				}
				return upcastPartial<IFileContent>({ value: VSBuffer.fromString(entry) });
			},
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
		// The sessions it cached, and those the list has only once the local agent host provider resolved
		const onDidResolve = store.add(new Emitter<string>());
		const resolving: string[] = [];
		const model = {
			sessions: [...sessions],
			resolved: false,
			onDidResolve: onDidResolve.event,
			resolve: async (providers: string[]) => {
				resolving.push(...providers);
				await loading;
				model.sessions.push(...uncached);
				model.resolved = true;
				providers.forEach(provider => onDidResolve.fire(provider));
			},
		};
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({ model: upcastPartial<IAgentSessionsService['model']>(model) }));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getRegisteredChatSessionItemProviders: () => ['remote', SessionType.AgentHostCopilot] }));
		const provider = store.add(instantiationService.createInstance(AgentHostWorktreeLocationProvider));
		// Another provider resolved first
		model.resolved = true;
		onDidResolve.fire('remote');
		return Object.assign(provider, { resolving });
	}

	const repository = {
		'/work/vscode/.git': true,
		// A worktree whose repository entry names it back
		'/work/vscode.worktrees/feature/.git': 'gitdir: /work/vscode/.git/worktrees/feature\n',
		'/work/vscode/.git/worktrees/feature/gitdir': '/work/vscode.worktrees/feature/.git\n',
		'/work/vscode/.git/worktrees/feature/HEAD': 'ref: refs/heads/agents/feature\n',
		// A worktree at a detached commit
		'/work/vscode.worktrees/detached/.git': 'gitdir: /work/vscode/.git/worktrees/detached\n',
		'/work/vscode/.git/worktrees/detached/gitdir': '/work/vscode.worktrees/detached/.git\n',
		'/work/vscode/.git/worktrees/detached/HEAD': '0123456789abcdef0123456789abcdef01234567\n',
		// One with a relative link back
		'/work/vscode.worktrees/relative/.git': 'gitdir: /work/vscode/.git/worktrees/relative',
		'/work/vscode/.git/worktrees/relative/gitdir': '../../../../vscode.worktrees/relative/.git',
		// A folder that points into the repository, but that the repository does not name back
		'/work/impostor/.git': 'gitdir: /work/vscode/.git/worktrees/feature',
		// A worktree of another repository
		'/work/tools/.git': true,
		'/work/tools.worktrees/fix/.git': 'gitdir: /work/tools/.git/worktrees/fix',
		'/work/tools/.git/worktrees/fix/gitdir': '/work/tools.worktrees/fix/.git',
	};

	test('the working directories of the local agent host\'s sessions, without duplicates, archived sessions or other providers\' sessions', () => {
		const directories = getAgentHostSessionWorkingDirectories([
			session(SessionType.AgentHostCopilot, '/work/vscode.worktrees/feature'),
			session(SessionType.AgentHostClaude, '/work/vscode.worktrees/feature'),
			session(SessionType.AgentHostCopilot, '/work/vscode.worktrees/archived', true),
			session(SessionType.Local, '/work/vscode.worktrees/local'),
			session(SessionType.CopilotCLI, '/work/vscode.worktrees/extension'),
			session(SessionType.AgentHostCopilot, undefined),
			session(SessionType.AgentHostCopilot, '/work/vscode'),
		]);
		assert.deepStrictEqual(directories.map(directory => directory.path), ['/work/vscode.worktrees/feature', '/work/vscode']);
	});

	test('offers the worktrees of the folder\'s repository that sessions work in, which the repository names back, and resolves any of them', async () => {
		const provider = createProvider(repository, [
			session(SessionType.AgentHostCopilot, '/work/vscode.worktrees/feature'),
			session(SessionType.AgentHostCopilot, '/work/vscode.worktrees/relative'),
			session(SessionType.AgentHostCopilot, '/work/vscode'),
			session(SessionType.AgentHostCopilot, '/work/impostor'),
			session(SessionType.AgentHostCopilot, '/work/tools.worktrees/fix'),
			session(SessionType.AgentHostCopilot, '/work/missing'),
			session(SessionType.Local, '/work/vscode.worktrees/local'),
		]);
		const resolve = async (location: string) => (await provider.resolveLocation(URI.file('/work/vscode'), URI.file(location), CancellationToken.None))?.label;

		assert.deepStrictEqual({
			locations: (await provider.provideLocations(URI.file('/work/vscode'), CancellationToken.None)).map(location => ({ path: location.uri.path, label: location.label })),
			ofAFolderWithoutRepository: await provider.provideLocations(URI.file('/work/plain'), CancellationToken.None),
			// A location that no session lists any more still resolves, as to restore it
			resolved: await resolve('/work/vscode.worktrees/relative'),
			impostor: await resolve('/work/impostor'),
			otherRepository: await resolve('/work/tools.worktrees/fix'),
			primary: await resolve('/work/vscode'),
		}, {
			locations: [{ path: '/work/vscode.worktrees/feature', label: 'feature' }, { path: '/work/vscode.worktrees/relative', label: 'relative' }],
			ofAFolderWithoutRepository: [],
			resolved: 'relative',
			impostor: undefined,
			otherRepository: undefined,
			primary: undefined,
		});
	});

	test('waits for the local agent host sessions to resolve, also once another provider resolved, before reading the working directories of sessions it did not cache', async () => {
		const loading = new DeferredPromise<void>();
		const provider = createProvider(repository, [session(SessionType.AgentHostCopilot, '/work/vscode.worktrees/feature')], [session(SessionType.AgentHostCopilot, '/work/vscode.worktrees/relative')], {}, loading.p);
		let locations: string[] | undefined;
		const providing = provider.provideLocations(URI.file('/work/vscode'), CancellationToken.None).then(result => locations = result.map(location => location.label));
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		const whileLoading = locations;
		await loading.complete();
		await providing;
		const resolvingBefore = [...provider.resolving];
		// Once resolved, it reads the sessions as the list has them
		await provider.provideLocations(URI.file('/work/vscode'), CancellationToken.None);

		assert.deepStrictEqual({ whileLoading, locations, resolving: resolvingBefore, again: provider.resolving }, {
			whileLoading: undefined,
			locations: ['feature', 'relative'],
			resolving: [SessionType.AgentHostCopilot],
			again: [SessionType.AgentHostCopilot],
		});
	});

	test('a worktree is described by its branch, the short commit of a detached HEAD, or nothing without HEAD', async () => {
		const provider = createProvider(repository, []);
		const describe = async (path: string) => (await provider.resolveLocation(URI.file('/work/vscode'), URI.file(path), CancellationToken.None))?.description;
		assert.deepStrictEqual({ branch: await describe('/work/vscode.worktrees/feature'), detached: await describe('/work/vscode.worktrees/detached'), withoutHead: await describe('/work/vscode.worktrees/relative') }, { branch: 'agents/feature', detached: '0123456', withoutHead: undefined });
	});

	test('compares the folder and its worktrees by their real paths, such as through a symbolic link', async () => {
		const provider = createProvider(repository, [session(SessionType.AgentHostCopilot, '/alias/feature')], [], { '/link/vscode': '/work/vscode', '/alias/feature': '/work/vscode.worktrees/feature' });
		const resolve = async (primary: string, location: string) => (await provider.resolveLocation(URI.file(primary), URI.file(location), CancellationToken.None))?.label ?? 'none';
		assert.deepStrictEqual({
			throughLinkedPrimary: await resolve('/link/vscode', '/work/vscode.worktrees/feature'),
			linkedWorktree: await resolve('/work/vscode', '/alias/feature'),
			primaryItself: await resolve('/link/vscode', '/work/vscode'),
			offered: (await provider.provideLocations(URI.file('/link/vscode'), CancellationToken.None)).map(location => location.uri.path),
		}, { throughLinkedPrimary: 'feature', linkedWorktree: 'feature', primaryItself: 'none', offered: ['/alias/feature'] });
	});

	test('follows symbolic links of the repository\'s worktrees folder and of a worktree\'s .git file, and grants the primary\'s trust only to the checkout git links back, not to another folder whose .git links to the same file', async () => {
		// The repository's `.git/worktrees` is a link to another folder, and the worktree's `.git` file a link to another
		// file; git names the worktree's own `.git` back. The impostor's `.git` links to the same file.
		const linked = {
			'/work/vscode/.git': true,
			'/store/worktrees/feature/gitdir': '/work/vscode.worktrees/feature/.git\n',
			'/store/feature.git': 'gitdir: /work/vscode/.git/worktrees/feature\n',
		};
		const provider = createProvider(linked, [], [], {
			'/work/vscode/.git/worktrees': '/store/worktrees',
			'/work/vscode.worktrees/feature/.git': '/store/feature.git',
			'/work/impostor/.git': '/store/feature.git',
		});
		const resolve = async (path: string) => (await provider.resolveLocation(URI.file('/work/vscode'), URI.file(path), CancellationToken.None))?.uri.path ?? 'none';

		// The workspace grants a location of a built-in provider the trust of the primary location
		const primary = URI.file('/work/vscode');
		const trusted: string[] = [];
		let current = primary;
		const workspaceEditingService = store.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
			undefined,
			{
				getWorkbenchState: () => WorkbenchState.FOLDER,
				getWorkspace: () => ({ folders: [{ uri: current }], uri: primary }),
				setFolderLocation: async (location: URI, o?: { onApplied?: () => void }) => { current = location; o?.onApplied?.(); return true; },
			},
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
			{ confirm: async () => ({ confirmed: false }) },
			undefined,
			{ extUri },
			{ isWorkspaceTrusted: () => true, getUriTrustInfo: async (uri: URI) => ({ trusted: extUri.isEqual(uri, primary) }), setUrisTrust: async (uris: URI[]) => { trusted.push(...uris.map(uri => uri.path)); } },
			undefined, undefined, undefined,
			{
				canSetLocation: () => true,
				resolveLocation: async (folder: URI, location: URI) => {
					const resolved = await provider.resolveLocation(folder, location, CancellationToken.None);
					return resolved && { ...resolved, providerId: AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID, builtIn: true };
				},
				setLocation: () => { },
			},
			{ isWorkspaceTrustEnabled: () => true }
		));
		await workspaceEditingService.setFolderLocation(URI.file('/work/impostor'));
		const impostorTrusted = [...trusted];
		await workspaceEditingService.setFolderLocation(primary);
		await workspaceEditingService.setFolderLocation(URI.file('/work/vscode.worktrees/feature'));

		assert.deepStrictEqual({ linked: await resolve('/work/vscode.worktrees/feature'), impostor: await resolve('/work/impostor'), impostorTrusted, trusted }, {
			linked: '/work/vscode.worktrees/feature',
			impostor: 'none',
			impostorTrusted: [],
			trusted: ['/work/vscode.worktrees/feature'],
		});
	});
});
