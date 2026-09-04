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

function repository(remoteUrl: string): IGitRepository {
	return new class extends mock<IGitRepository>() {
		override readonly rootUri = URI.file(`/workspace/${remoteUrl.length}`);
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
	constructor(override readonly repositories: readonly IGitRepository[]) {
		super();
	}

	override async openRepository(uri: URI): Promise<IGitRepository | undefined> {
		return this.repositories.find(repository => repository.rootUri.toString() === uri.toString());
	}
}

class WorkspaceLoadingGitService extends mock<IGitService>() {
	private readonly openedRepositories: IGitRepository[] = [];

	constructor(private readonly availableRepositories: readonly IGitRepository[]) {
		super();
	}

	override get repositories(): readonly IGitRepository[] {
		return this.openedRepositories;
	}

	override async openRepository(uri: URI): Promise<IGitRepository | undefined> {
		const repository = this.availableRepositories.find(repository => repository.rootUri.toString() === uri.toString());
		if (repository && !this.openedRepositories.includes(repository)) {
			this.openedRepositories.push(repository);
		}
		return repository;
	}
}

class TestCommandService extends mock<ICommandService>() {
	result: object | undefined;
	command: { id: string; repoId: string | undefined } | undefined;

	override async executeCommand<T>(id: string, repoId?: string): Promise<T> {
		this.command = { id, repoId };
		return this.result as T;
	}
}

class TestGitHubContextValuePick extends GitHubContextValuePick {
	repositoryPicks: readonly string[] | undefined;
	selectedRepository: string | undefined;

	protected override async pickRepository(repositories: readonly string[]): Promise<string | undefined> {
		this.repositoryPicks = repositories;
		return this.selectedRepository;
	}
}

function workspaceContextService(folderUris: readonly URI[] = []): IWorkspaceContextService {
	return new class extends mock<IWorkspaceContextService>() {
		override getWorkspace(): IWorkspace {
			return upcastPartial<IWorkspace>({
				folders: folderUris.map(uri => upcastPartial<IWorkspaceFolder>({ uri })),
			});
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
				repoId: undefined,
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
				repoId: 'microsoft/vscode',
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
			repository('git@github.com:microsoft/vscode.git'),
			repository('https://github.com/microsoft/typescript.git'),
		];
		const pick = new TestGitHubContextValuePick(
			'pullRequest',
			new WorkspaceLoadingGitService(repositories),
			new class extends mock<IQuickInputService>() { }(),
			commandService,
			workspaceContextService(repositories.map(repository => repository.rootUri)),
		);
		pick.selectedRepository = 'microsoft/vscode';

		await pick.asAttachment();
		assert.deepStrictEqual({
			repositoryPicks: pick.repositoryPicks,
			commandRepoId: commandService.command?.repoId,
		}, {
			repositoryPicks: ['microsoft/typescript', 'microsoft/vscode'],
			commandRepoId: 'microsoft/vscode',
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
