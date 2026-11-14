/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { AgentHostWorktreeLocationProvider, getAgentHostSessionWorkingDirectories } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeLocations.js';
import { IAgentSession } from '../../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { SessionType } from '../../../../common/chatSessionsService.js';

suite('AgentHostWorktreeLocations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function session(providerType: string, workingDirectoryPath: string | undefined, archived = false): IAgentSession {
		return upcastPartial<IAgentSession>({ providerType, metadata: workingDirectoryPath ? { workingDirectoryPath } : undefined, isArchived: () => archived });
	}

	/**
	 * A provider over git entries: `true` is a `.git` directory, and a string the content of a file, such as a worktree's
	 * `.git` file or its entry's `gitdir` file in the repository.
	 */
	function createProvider(entries: Record<string, string | boolean>, sessions: readonly IAgentSession[]) {
		const fileService = upcastPartial<IFileService>({
			stat: async (resource: URI) => {
				const entry = entries[resource.path];
				if (entry === undefined) {
					throw new FileOperationError('not found', FileOperationResult.FILE_NOT_FOUND);
				}
				return upcastPartial<IFileStatWithMetadata>({ isDirectory: entry === true });
			},
			readFile: async (resource: URI) => {
				const entry = entries[resource.path];
				if (typeof entry !== 'string') {
					throw new FileOperationError('not found', FileOperationResult.FILE_NOT_FOUND);
				}
				return upcastPartial<IFileContent>({ value: VSBuffer.fromString(entry) });
			},
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({ model: upcastPartial<IAgentSessionsService['model']>({ sessions: [...sessions] }) }));
		return instantiationService.createInstance(AgentHostWorktreeLocationProvider);
	}

	const repository = {
		'/work/vscode/.git': true,
		// A worktree whose repository entry names it back
		'/work/vscode.worktrees/feature/.git': 'gitdir: /work/vscode/.git/worktrees/feature\n',
		'/work/vscode/.git/worktrees/feature/gitdir': '/work/vscode.worktrees/feature/.git\n',
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
});
