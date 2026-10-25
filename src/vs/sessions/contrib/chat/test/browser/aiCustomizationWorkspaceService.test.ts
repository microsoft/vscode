/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotification, INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { GitCommitOptions, IGitRepository, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { SessionsAICustomizationWorkspaceService } from '../../browser/aiCustomizationWorkspaceService.js';
import { IChat, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

suite('SessionsAICustomizationWorkspaceService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the repository label for virtual workspaces', () => {
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const service = new SessionsAICustomizationWorkspaceService(
			upcastPartial<ISessionsService>({ activeSession }),
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IPromptsService>({}),
			upcastPartial<IGitService>({}),

			upcastPartial<ILogService>({}),
			upcastPartial<IFileService>({}),
			upcastPartial<INotificationService>({}),
			upcastPartial<ILabelService>({}),
		);
		const labels = [service.activeProjectLabel.get()];

		activeSession.set(createActiveSession({
			uri: URI.file('/workspace'),
			label: 'workspace',
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
			}],
			icon: { id: 'folder' },
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		}), undefined);
		labels.push(service.activeProjectLabel.get());

		activeSession.set(createActiveSession({
			uri: URI.parse('github-remote-file://github/microsoft/vscode/HEAD'),
			label: 'microsoft/vscode',
			folders: [{
				root: URI.parse('github-remote-file://github/microsoft/vscode/HEAD'),
				workingDirectory: URI.parse('github-remote-file://github/microsoft/vscode/HEAD'),
				name: 'HEAD',
				description: undefined,
			}],
			icon: { id: 'repo' },
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: true,
		}), undefined);
		labels.push(service.activeProjectLabel.get());

		assert.deepStrictEqual(labels, [undefined, 'workspace', 'microsoft/vscode']);
	});

	suite('committing customizations', () => {
		const repositoryRoot = URI.file('/repo');
		const worktreeRoot = URI.file('/worktree');
		const worktreeFile = URI.file('/worktree/.github/skills/foo.md');

		function createService(options: { openRepository?: (root: URI) => Promise<IGitRepository | undefined>; notifications?: INotification[] }) {
			const activeSession = observableValue<IActiveSession | undefined>('activeSession', createActiveSession({
				uri: repositoryRoot,
				label: 'repo',
				folders: [{ root: repositoryRoot, workingDirectory: worktreeRoot, name: 'repo', description: undefined }],
				icon: { id: 'folder' },
				requiresWorkspaceTrust: true,
				isVirtualWorkspace: false,
			}));
			return new SessionsAICustomizationWorkspaceService(
				upcastPartial<ISessionsService>({ activeSession }),
				upcastPartial<IInstantiationService>({}),
				upcastPartial<IPromptsService>({}),
				upcastPartial<IGitService>({ openRepository: options.openRepository ?? (async () => undefined) }),
				upcastPartial<ILogService>({ error: () => { }, debug: () => { } }),
				upcastPartial<IFileService>({
					readFile: async () => ({ value: VSBuffer.fromString('content') }) as IFileContent,
					writeFile: async () => ({}) as IFileStatWithMetadata,
					exists: async () => true,
					del: async () => { },
				}),
				upcastPartial<INotificationService>({ notify: notification => { options.notifications?.push(notification); return undefined!; } }),
				upcastPartial<ILabelService>({}),
			);
		}

		test('commits a saved file to the repository and the worktree', async () => {
			const commits: { root: string; files: string[]; message: string; options: GitCommitOptions | undefined }[] = [];
			const service = createService({
				openRepository: async root => upcastPartial<IGitRepository>({
					commitFiles: async (files, message, options) => { commits.push({ root: root.path, files: files.map(f => f.path), message, options }); },
				}),
			});

			const succeeded = await service.commitFiles(worktreeRoot, [worktreeFile]);

			const options = { noVerify: true, signCommit: false };
			assert.deepStrictEqual({ succeeded, commits }, {
				succeeded: true,
				commits: [
					{ root: '/repo', files: ['/repo/.github/skills/foo.md'], message: 'Update customization: foo.md', options },
					{ root: '/worktree', files: ['/worktree/.github/skills/foo.md'], message: 'Update customization: foo.md', options },
				],
			});
		});

		test('commits a deleted file to the repository and the worktree', async () => {
			const commits: string[] = [];
			const service = createService({
				openRepository: async root => upcastPartial<IGitRepository>({
					commitFiles: async files => { commits.push(`${root.path} ${files.map(f => f.path).join()}`); },
				}),
			});

			await service.deleteFiles(worktreeRoot, [worktreeFile]);

			assert.deepStrictEqual(commits, ['/repo /repo/.github/skills/foo.md', '/worktree /worktree/.github/skills/foo.md']);
		});

		test('skips folders that are not git repositories', async () => {
			const notifications: INotification[] = [];
			const service = createService({ notifications });

			await service.commitFiles(worktreeRoot, [worktreeFile]);

			assert.deepStrictEqual(notifications, []);
		});

		test('reports failure when the commit to the default branch fails but still commits to the worktree', async () => {
			const notifications: INotification[] = [];
			const committedRoots: string[] = [];
			const service = createService({
				notifications,
				openRepository: async root => upcastPartial<IGitRepository>({
					commitFiles: async () => {
						committedRoots.push(root.path);
						if (root.path === '/repo') {
							throw new Error('conflict');
						}
					},
				}),
			});

			const succeeded = await service.commitFiles(worktreeRoot, [worktreeFile]);

			assert.deepStrictEqual({ succeeded, committedRoots, notifications: notifications.map(n => n.severity) }, {
				succeeded: false,
				committedRoots: ['/repo', '/worktree'],
				notifications: [Severity.Warning],
			});
		});

		test('reports failure when only the worktree commit fails', async () => {
			const service = createService({
				openRepository: async root => upcastPartial<IGitRepository>({
					commitFiles: async () => {
						if (root.path === '/worktree') {
							throw new Error('index.lock exists');
						}
					},
				}),
			});

			assert.deepStrictEqual({
				commit: await service.commitFiles(worktreeRoot, [worktreeFile]),
				deletion: await service.deleteFiles(worktreeRoot, [worktreeFile]),
			}, { commit: false, deletion: false });
		});
	});
});

function createActiveSession(workspace: ISessionWorkspace): IActiveSession {
	const chat = upcastPartial<IChat>({ workspace: constObservable(workspace) });
	return upcastPartial<IActiveSession>({ activeChat: constObservable(chat) });
}
