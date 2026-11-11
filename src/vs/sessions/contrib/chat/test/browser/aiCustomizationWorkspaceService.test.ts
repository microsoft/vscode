/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotification, INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { GitCommitOptions, IGitRepository, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { SessionsAICustomizationWorkspaceService } from '../../browser/aiCustomizationWorkspaceService.js';
import { IChat, ISessionWorkspace } from '../../../../../workbench/services/sessions/common/session.js';
import { focusedSessionHostServiceOf, ITestSessionWithChat } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { INewSessionComposer, INewSessionComposerService } from '../../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ICustomizationHarnessService } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';

suite('SessionsAICustomizationWorkspaceService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the repository label for virtual workspaces', () => {
		const activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', undefined);
		const service = new SessionsAICustomizationWorkspaceService(
			focusedSessionHostServiceOf(activeSession),
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IPromptsService>({}),
			upcastPartial<IGitService>({}),

			upcastPartial<ILogService>({}),
			upcastPartial<IFileService>({}),
			upcastPartial<INotificationService>({}),
			upcastPartial<ILabelService>({}),
			upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }),
			upcastPartial<INewSessionComposerService>({ getComposer: () => undefined }),
			upcastPartial<ISessionsManagementService>({ getSession: () => undefined, getSessionForChatResource: () => undefined }),
			upcastPartial<ICustomizationHarnessService>({ activeSessionResource: constObservable(URI.parse('test:/none')) }),
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

	test('separates harness, workspace, and environment labels', () => {
		const activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', createActiveSession({
			uri: URI.file('/workspace'),
			label: 'workspace',
			folders: [{
				root: URI.file('/workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'vscode',
				description: undefined,
			}],
			icon: { id: 'folder' },
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		}, {
			sessionId: 'session',
			providerId: 'cloud',
			harness: 'copilot',
			environment: 'cloud',
		}));
		const provider = upcastPartial<ISessionsProvider>({
			environment: { id: 'cloud', label: 'Cloud' },
			getHarnessPresentation: harness => harness === 'copilot' ? { label: 'Copilot', icon: { id: 'copilot' } } : undefined,
		});
		const service = new SessionsAICustomizationWorkspaceService(
			focusedSessionHostServiceOf(activeSession),
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IPromptsService>({}),
			upcastPartial<IGitService>({}),
			upcastPartial<ILogService>({}),
			upcastPartial<IFileService>({}),
			upcastPartial<INotificationService>({}),
			upcastPartial<ILabelService>({}),
			new class extends mock<ISessionsProvidersService>() {
				override getProvider<T extends ISessionsProvider>(): T | undefined {
					return provider as T;
				}
			}(),
			upcastPartial<INewSessionComposerService>({ getComposer: () => undefined }),
			upcastPartial<ISessionsManagementService>({ getSession: () => undefined, getSessionForChatResource: () => undefined }),
			upcastPartial<ICustomizationHarnessService>({ activeSessionResource: constObservable(URI.parse('test:/none')) }),
		);

		assert.deepStrictEqual(service.activeTargetLabels.get(), {
			harness: 'Copilot',
			workspace: 'vscode',
			environment: 'Cloud',
		});
	});

	test('uses new-session picker labels before a draft exists', () => {
		const targetLabels = {
			harness: 'Copilot',
			workspace: 'vscode',
			environment: 'Cloud',
		};
		const service = new SessionsAICustomizationWorkspaceService(
			focusedSessionHostServiceOf(observableValue<ITestSessionWithChat | undefined>('activeSession', undefined)),
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IPromptsService>({}),
			upcastPartial<IGitService>({}),
			upcastPartial<ILogService>({}),
			upcastPartial<IFileService>({}),
			upcastPartial<INotificationService>({}),
			upcastPartial<ILabelService>({}),
			upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }),
			upcastPartial<INewSessionComposerService>({
				getComposer: () => upcastPartial<INewSessionComposer>({
					targetLabels: constObservable(targetLabels),
				}),
			}),
			upcastPartial<ISessionsManagementService>({ getSession: () => undefined, getSessionForChatResource: () => undefined }),
			upcastPartial<ICustomizationHarnessService>({ activeSessionResource: constObservable(URI.parse('test:/none')) }),
		);

		assert.deepStrictEqual({
			project: service.activeProjectLabel.get(),
			target: service.activeTargetLabels.get(),
		}, {
			project: 'vscode',
			target: targetLabels,
		});
	});

	test('does not use new-session labels for a workspace-less existing session', () => {
		const session = createActiveSession(undefined, {
			resource: URI.parse('test:/quick-chat'),
			sessionId: 'quick-chat',
			providerId: 'local',
			harness: 'claude',
			environment: 'local',
		});
		const provider = upcastPartial<ISessionsProvider>({
			environment: { id: 'local', label: 'This Computer' },
			getHarnessPresentation: () => ({ label: 'Claude', icon: { id: 'claude' } }),
		});
		const service = new SessionsAICustomizationWorkspaceService(
			focusedSessionHostServiceOf(constObservable(session)),
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IPromptsService>({}),
			upcastPartial<IGitService>({}),
			upcastPartial<ILogService>({}),
			upcastPartial<IFileService>({}),
			upcastPartial<INotificationService>({}),
			upcastPartial<ILabelService>({}),
			new class extends mock<ISessionsProvidersService>() {
				override getProvider<T extends ISessionsProvider>(): T | undefined {
					return provider as T;
				}
			}(),
			upcastPartial<INewSessionComposerService>({
				getComposer: () => upcastPartial<INewSessionComposer>({
					targetLabels: constObservable({ harness: 'Copilot', workspace: 'unrelated', environment: 'Cloud' }),
				}),
			}),
			upcastPartial<ISessionsManagementService>({ getSession: () => undefined, getSessionForChatResource: () => undefined }),
			upcastPartial<ICustomizationHarnessService>({ activeSessionResource: constObservable(session.resource) }),
		);

		assert.deepStrictEqual({
			project: service.activeProjectLabel.get(),
			target: service.activeTargetLabels.get(),
		}, {
			project: undefined,
			target: { harness: 'Claude', workspace: undefined, environment: 'This Computer' },
		});
	});

	test('uses the explicit customization session instead of the focused session', () => {
		const focused = createActiveSession(createWorkspace('/focused', 'focused'), {
			resource: URI.parse('test:/focused'),
			sessionId: 'focused',
			providerId: 'copilot',
			harness: 'copilot',
			environment: 'local',
		});
		const target = createActiveSession(createWorkspace('/target', 'target'), {
			resource: URI.parse('test:/target'),
			sessionId: 'target',
			providerId: 'claude',
			harness: 'claude',
			environment: 'remote',
		});
		const providers = new Map<string, ISessionsProvider>([
			['copilot', upcastPartial<ISessionsProvider>({
				environment: { id: 'local', label: 'This Computer' },
				getHarnessPresentation: () => ({ label: 'Copilot', icon: { id: 'copilot' } }),
			})],
			['claude', upcastPartial<ISessionsProvider>({
				environment: { id: 'remote', label: 'devbox-1' },
				getHarnessPresentation: () => ({ label: 'Claude', icon: { id: 'claude' } }),
			})],
		]);
		const service = new SessionsAICustomizationWorkspaceService(
			focusedSessionHostServiceOf(constObservable(focused)),
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IPromptsService>({}),
			upcastPartial<IGitService>({}),
			upcastPartial<ILogService>({}),
			upcastPartial<IFileService>({}),
			upcastPartial<INotificationService>({}),
			upcastPartial<ILabelService>({}),
			new class extends mock<ISessionsProvidersService>() {
				override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
					return providers.get(providerId) as T | undefined;
				}
			}(),
			upcastPartial<INewSessionComposerService>({ getComposer: () => undefined }),
			upcastPartial<ISessionsManagementService>({
				getSession: resource => resource.toString() === target.resource.toString() ? target : undefined,
				getSessionForChatResource: () => undefined,
			}),
			upcastPartial<ICustomizationHarnessService>({ activeSessionResource: constObservable(target.resource) }),
		);

		assert.deepStrictEqual(service.activeTargetLabels.get(), {
			harness: 'Claude',
			workspace: 'target',
			environment: 'devbox-1',
		});
	});

	suite('committing customizations', () => {
		const repositoryRoot = URI.file('/repo');
		const worktreeRoot = URI.file('/worktree');
		const worktreeFile = URI.file('/worktree/.github/skills/foo.md');

		function createService(options: { openRepository?: (root: URI) => Promise<IGitRepository | undefined>; notifications?: INotification[] }) {
			const activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', createActiveSession({
				uri: repositoryRoot,
				label: 'repo',
				folders: [{ root: repositoryRoot, workingDirectory: worktreeRoot, name: 'repo', description: undefined }],
				icon: { id: 'folder' },
				requiresWorkspaceTrust: true,
				isVirtualWorkspace: false,
			}));
			return new SessionsAICustomizationWorkspaceService(
				focusedSessionHostServiceOf(activeSession),
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
				upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }),
				upcastPartial<INewSessionComposerService>({ getComposer: () => undefined }),
				upcastPartial<ISessionsManagementService>({ getSession: () => undefined, getSessionForChatResource: () => undefined }),
				upcastPartial<ICustomizationHarnessService>({ activeSessionResource: constObservable(URI.parse('test:/none')) }),
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

function createWorkspace(path: string, name: string): ISessionWorkspace {
	const root = URI.file(path);
	return {
		uri: root,
		label: name,
		folders: [{ root, workingDirectory: root, name, description: undefined }],
		icon: { id: 'folder' },
		requiresWorkspaceTrust: true,
		isVirtualWorkspace: false,
	};
}

function createActiveSession(workspace: ISessionWorkspace | undefined, session?: Partial<ITestSessionWithChat>): ITestSessionWithChat {
	const chat = upcastPartial<IChat>({ workspace: constObservable(workspace) });
	return upcastPartial<ITestSessionWithChat>({ activeChat: constObservable(chat), workspace: constObservable(workspace), ...session });
}
