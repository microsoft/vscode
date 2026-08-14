/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
	const actual = await import('../../../../vscodeTypes');
	return {
		...actual,
		commands: {
			executeCommand: vi.fn().mockResolvedValue(undefined),
		},
	};
});

import * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IGitExtensionService } from '../../../../platform/git/common/gitExtensionService';
import { API, Repository } from '../../../../platform/git/vscode/git';
import { ILogService } from '../../../../platform/log/common/logService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { mock } from '../../../../util/common/test/simpleMock';
import { ChatSessionsUriHandler } from '../chatSessionsUriHandler';

const PENDING_CHAT_SESSION_STORAGE_KEY = 'github.copilot.pendingChatSession';

class MockGlobalState implements vscode.Memento {
	private readonly data = new Map<string, unknown>();

	get<T>(key: string, defaultValue?: T): T {
		return (this.data.get(key) ?? defaultValue) as T;
	}

	async update(key: string, value: unknown): Promise<void> {
		if (value === undefined) {
			this.data.delete(key);
		} else {
			this.data.set(key, value);
		}
	}

	keys(): readonly string[] {
		return [...this.data.keys()];
	}

	setKeysForSync(_keys: readonly string[]): void { }
}

class MockExtensionContext extends mock<IVSCodeExtensionContext>() {
	override readonly globalState = new MockGlobalState();
}

class MockRepository extends mock<Repository>() {
	override readonly kind = 'repository' as const;
	override readonly state: Repository['state'];

	constructor(remoteUrl: string) {
		super();
		this.state = {
			remotes: [{ name: 'origin', fetchUrl: remoteUrl, isReadOnly: false }],
		} as Repository['state'];
	}
}

class MockGitApi extends mock<API>() {
	override readonly state = 'initialized' as const;
	override readonly repositories: Repository[];

	constructor(remoteUrls: readonly string[]) {
		super();
		this.repositories = remoteUrls.map(remoteUrl => new MockRepository(remoteUrl));
	}
}

class MockGitExtensionService extends mock<IGitExtensionService>() {
	private api: API | undefined;

	override get extensionAvailable(): boolean {
		return this.api !== undefined;
	}

	setApi(api: API): void {
		this.api = api;
	}

	override getExtensionApi(): API | undefined {
		return this.api;
	}
}
class MockLogService extends mock<ILogService>() { }
class MockFileSystemService extends mock<IFileSystemService>() { }
class MockTelemetryService extends mock<ITelemetryService>() { }

describe('ChatSessionsUriHandler', () => {
	let extensionContext: MockExtensionContext;
	let gitExtensionService: MockGitExtensionService;
	let handler: ChatSessionsUriHandler;

	beforeEach(() => {
		vi.mocked(vscode.commands.executeCommand).mockClear();
		extensionContext = new MockExtensionContext();
		gitExtensionService = new MockGitExtensionService();
		handler = new ChatSessionsUriHandler(
			gitExtensionService,
			extensionContext,
			new MockLogService(),
			new MockFileSystemService(),
			new MockTelemetryService(),
		);
	});

	it('opens a task resource directly', async () => {
		await handler.openPendingSession({ id: 'task-123', type: 'copilot-cloud-agent' });

		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			'vscode.open',
			vscode.Uri.parse('copilot-cloud-agent:/task/task-123'),
		);
	});

	it('opens a task resource saved before a workspace reload', async () => {
		gitExtensionService.setApi(new MockGitApi(['https://github.com/microsoft/vscode']));
		await extensionContext.globalState.update(PENDING_CHAT_SESSION_STORAGE_KEY, {
			type: 'copilot-cloud-agent',
			id: 'task-456',
			url: 'https://github.com/microsoft/vscode',
			branch: 'main',
			timestamp: Date.now(),
		});

		await handler.openPendingSession();

		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			'vscode.open',
			vscode.Uri.parse('copilot-cloud-agent:/task/task-456'),
		);
		expect(extensionContext.globalState.get(PENDING_CHAT_SESSION_STORAGE_KEY)).toBeUndefined();
	});

	it('keeps a pending task until its repository workspace is open', async () => {
		gitExtensionService.setApi(new MockGitApi(['https://github.com/microsoft/TypeScript']));
		const pendingSession = {
			type: 'copilot-cloud-agent',
			id: 'task-456',
			url: 'https://github.com/microsoft/vscode',
			branch: 'main',
			timestamp: Date.now(),
		};
		await extensionContext.globalState.update(PENDING_CHAT_SESSION_STORAGE_KEY, pendingSession);

		await handler.openPendingSession();

		expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
		expect(extensionContext.globalState.get(PENDING_CHAT_SESSION_STORAGE_KEY)).toEqual(pendingSession);
	});
});
