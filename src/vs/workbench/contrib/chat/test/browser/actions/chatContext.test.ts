/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { GitHubContextValuePick, shouldShowOpenEditorsContext } from '../../../browser/actions/chatContext.js';
import { ChatContextPickService } from '../../../browser/attachments/chatContextPickService.js';
import { IChatWidget } from '../../../browser/chat.js';
import { IGitRepository, IGitService } from '../../../../git/common/gitService.js';

function widget(overrides: Partial<Pick<IChatWidget, 'viewModel' | 'lockedAgentId'>>): Pick<IChatWidget, 'viewModel' | 'lockedAgentId'> {
	return {
		viewModel: undefined,
		lockedAgentId: undefined,
		...overrides,
	} as Pick<IChatWidget, 'viewModel' | 'lockedAgentId'>;
}

function widgetWithSession(sessionResource: URI): Pick<IChatWidget, 'viewModel' | 'lockedAgentId'> {
	return widget({
		viewModel: { sessionResource } as IChatWidget['viewModel'],
	});
}

function repository(remoteUrl: string, rootUri = URI.file(`/workspace/${remoteUrl.length}`)): IGitRepository {
	return new class extends mock<IGitRepository>() {
		override readonly rootUri = rootUri;
		override readonly state = observableValue('test', {
			remotes: [{ name: 'origin', fetchUrl: remoteUrl, isReadOnly: false }],
			mergeChanges: [],
			indexChanges: [],
			workingTreeChanges: [],
			untrackedChanges: [],
		});
	}();
}

class TestGitService extends mock<IGitService>() {
	readonly openRepositoryCalls: URI[] = [];

	constructor(override readonly repositories: readonly IGitRepository[]) {
		super();
	}

	override async openRepository(uri: URI): Promise<IGitRepository | undefined> {
		this.openRepositoryCalls.push(uri);
		return this.repositories.find(repository => repository.rootUri.toString() === uri.toString());
	}
}

class TestCommandService extends mock<ICommandService>() {
	result: object | undefined;
	command: { id: string; repository: string | URI | undefined } | undefined;

	override async executeCommand<T>(id: string, repository?: string | URI): Promise<T> {
		this.command = { id, repository };
		return this.result as T;
	}
}

class TestGitHubContextValuePick extends GitHubContextValuePick {
	repositoryPicks: readonly { readonly label: string; readonly description?: string; readonly repoId?: string; readonly folderUri?: URI }[] | undefined;
	selectedRepository: string | undefined;

	protected override async pickRepository(repositories: readonly { readonly label: string; readonly description?: string; readonly repoId?: string; readonly folderUri?: URI }[]): Promise<{ readonly label: string; readonly description?: string; readonly repoId?: string; readonly folderUri?: URI } | undefined> {
		this.repositoryPicks = repositories;
		return repositories.find(repository => (repository.repoId ?? repository.folderUri?.toString()) === this.selectedRepository);
	}
}

function workspaceContextService(folders: readonly { readonly uri: URI; readonly name?: string }[] = []): IWorkspaceContextService {
	return new class extends mock<IWorkspaceContextService>() {
		override getWorkspace(): IWorkspace {
			return upcastPartial<IWorkspace>({
				folders: folders.map(folder => upcastPartial<IWorkspaceFolder>({
					uri: folder.uri,
					name: folder.name ?? folder.uri.path.split('/').pop() ?? folder.uri.path,
				})),
			});
		}

		override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
			return this.getWorkspace().folders.find(folder => resource.toString().startsWith(folder.uri.toString())) ?? null;
		}
	}();
}

suite('ChatContext', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows Open Editors for regular Copilot CLI sessions with eligible editors', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widgetWithSession(URI.parse('copilotcli:/session-1')), true),
			true
		);
	});

	test('hides Open Editors for Agent Host sessions with eligible editors', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widgetWithSession(URI.parse('agent-host-copilotcli:/session-1')), true),
			false
		);
	});

	test('hides Open Editors for locked Agent Host ids without a session resource', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widget({ lockedAgentId: 'agent-host-copilotcli' }), true),
			false
		);
	});

	test('hides Open Editors when there are no eligible editors', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widgetWithSession(URI.parse('copilotcli:/session-1')), false),
			false
		);
	});

	test('opens global GitHub context search without a GitHub repository', async () => {
		const commandService = new TestCommandService();
		const pick = new GitHubContextValuePick(
			'issue',
			new TestGitService([repository('https://example.com/owner/repository.git')]),
			new class extends mock<IQuickInputService>() { }(),
			commandService,
			workspaceContextService(),
		);

		await pick.asAttachment();
		assert.deepStrictEqual({
			enabled: pick.isEnabled(),
			command: commandService.command,
		}, {
			enabled: true,
			command: {
				id: 'github.copilot.chat.cloudSessions.openIssue',
				repository: undefined,
			},
		});
	});

	test('opens GitHub context picker directly for one repository', async () => {
		const commandService = new TestCommandService();
		commandService.result = {
			repoId: 'microsoft/vscode',
			url: 'https://github.com/microsoft/vscode/issues/123',
			label: 'microsoft/vscode#123',
		};
		const pick = new GitHubContextValuePick(
			'issue',
			new TestGitService([repository('https://github.com/microsoft/vscode.git')]),
			new class extends mock<IQuickInputService>() { }(),
			commandService,
			workspaceContextService(),
		);

		const attachment = await pick.asAttachment();
		assert.deepStrictEqual({
			command: commandService.command,
			attachment: attachment && {
				id: attachment.id,
				name: attachment.name,
				value: URI.isUri(attachment.value) ? attachment.value.toString() : undefined,
				icon: attachment.icon?.id,
			}
		}, {
			command: {
				id: 'github.copilot.chat.cloudSessions.openIssue',
				repository: 'microsoft/vscode',
			},
			attachment: {
				id: 'https://github.com/microsoft/vscode/issues/123',
				name: 'microsoft/vscode#123',
				value: 'https://github.com/microsoft/vscode/issues/123',
				icon: 'issues',
			}
		});
	});

	test('selects a repository before opening GitHub context picker for multiple repositories', async () => {
		const commandService = new TestCommandService();
		const repositories = [
			repository('git@github.com:microsoft/vscode.git', URI.file('/workspace/vscode')),
			repository('https://github.com/microsoft/typescript.git', URI.file('/workspace/typescript')),
		];
		const gitService = new TestGitService(repositories);
		const pick = new TestGitHubContextValuePick(
			'pullRequest',
			gitService,
			new class extends mock<IQuickInputService>() { }(),
			commandService,
			workspaceContextService([
				{ uri: repositories[0].rootUri, name: 'VS Code' },
				{ uri: repositories[1].rootUri, name: 'TypeScript' },
			]),
		);
		pick.selectedRepository = 'microsoft/vscode';

		await pick.asAttachment();
		assert.deepStrictEqual({
			repositoryPicks: pick.repositoryPicks,
			commandRepository: commandService.command?.repository,
			openRepositoryCalls: gitService.openRepositoryCalls,
		}, {
			repositoryPicks: [
				{ label: 'VS Code', description: 'microsoft/vscode', repoId: 'microsoft/vscode', folderUri: repositories[0].rootUri },
				{ label: 'TypeScript', description: 'microsoft/typescript', repoId: 'microsoft/typescript', folderUri: repositories[1].rootUri },
			],
			commandRepository: 'microsoft/vscode',
			openRepositoryCalls: [],
		});
	});

	test('selects a folder before opening GitHub context for multiple roots of the same repository', async () => {
		const commandService = new TestCommandService();
		const repositories = [
			repository('https://github.com/microsoft/vscode.git', URI.file('/workspace/client')),
			repository('https://github.com/microsoft/vscode.git', URI.file('/workspace/server')),
		];
		const pick = new TestGitHubContextValuePick(
			'issue',
			new TestGitService(repositories),
			new class extends mock<IQuickInputService>() { }(),
			commandService,
			workspaceContextService([
				{ uri: repositories[0].rootUri, name: 'Client' },
				{ uri: repositories[1].rootUri, name: 'Server' },
			]),
		);
		pick.selectedRepository = 'microsoft/vscode';

		await pick.asAttachment();

		assert.deepStrictEqual(pick.repositoryPicks, [
			{ label: 'Client', description: 'microsoft/vscode', repoId: 'microsoft/vscode', folderUri: repositories[0].rootUri },
			{ label: 'Server', description: 'microsoft/vscode', repoId: 'microsoft/vscode', folderUri: repositories[1].rootUri },
		]);
	});

	test('selects a folder before opening GitHub context when repository metadata is incomplete', async () => {
		const commandService = new TestCommandService();
		const repositoryRoot = URI.file('/workspace/vscode');
		const docsRoot = URI.file('/workspace/docs');
		const pick = new TestGitHubContextValuePick(
			'pullRequest',
			new TestGitService([
				repository('https://github.com/microsoft/vscode.git', repositoryRoot),
			]),
			new class extends mock<IQuickInputService>() { }(),
			commandService,
			workspaceContextService([
				{ uri: repositoryRoot, name: 'VS Code' },
				{ uri: docsRoot, name: 'Docs' },
			]),
		);
		pick.selectedRepository = docsRoot.toString();

		await pick.asAttachment();

		assert.deepStrictEqual({
			repositoryPicks: pick.repositoryPicks,
			commandRepository: commandService.command?.repository,
		}, {
			repositoryPicks: [
				{ label: 'VS Code', description: 'microsoft/vscode', repoId: 'microsoft/vscode', folderUri: repositoryRoot },
				{ label: 'Docs', folderUri: docsRoot },
			],
			commandRepository: docsRoot,
		});
	});

	test('orders sessions before GitHub context picks', () => {
		const service = new ChatContextPickService();
		disposables.add(service.registerChatContextItem(new GitHubContextValuePick(
			'issue',
			new TestGitService([]),
			new class extends mock<IQuickInputService>() { }(),
			new TestCommandService(),
			workspaceContextService(),
		)));
		disposables.add(service.registerChatContextItem({
			type: 'valuePick',
			label: 'Sessions...',
			icon: Codicon.comment,
			ordinal: -400,
			asAttachment: async () => undefined,
		}));

		assert.deepStrictEqual(Array.from(service.items, item => item.label), [
			'Sessions...',
			'Issue...',
		]);
	});
});
