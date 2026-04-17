/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ISessionCustomization, ICustomizationRef } from '../../common/state/sessionState.js';
import { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { CopilotAgent, getCopilotWorktreeBranchName, getCopilotWorktreeName, getCopilotWorktreesRoot } from '../../node/copilot/copilotAgent.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';

class TestAgentPluginManager implements IAgentPluginManager {
	declare readonly _serviceBrand: undefined;

	async syncCustomizations(_clientId: string, _customizations: ICustomizationRef[], _progress?: (status: ISessionCustomization[]) => void): Promise<ISyncedCustomization[]> {
		return [];
	}
}

class TestAgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	async isInsideWorkTree(): Promise<boolean> { return false; }
	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
	async getDefaultBranch(): Promise<string | undefined> { return undefined; }
	async getBranches(): Promise<string[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return undefined; }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(): Promise<void> { }
	async removeWorktree(): Promise<void> { }
}

class TestAgentHostTerminalManager implements IAgentHostTerminalManager {
	declare readonly _serviceBrand: undefined;

	async createTerminal(): Promise<void> { }
	writeInput(): void { }
	onData(): IDisposable { return Disposable.None; }
	onExit(): IDisposable { return Disposable.None; }
	onClaimChanged(): IDisposable { return Disposable.None; }
	onCommandFinished(): IDisposable { return Disposable.None; }
	getContent(): string | undefined { return undefined; }
	getClaim(): undefined { return undefined; }
	hasTerminal(): boolean { return false; }
	getExitCode(): number | undefined { return undefined; }
	supportsCommandDetection(): boolean { return false; }
	disposeTerminal(): void { }
	getTerminalInfos(): [] { return []; }
	getTerminalState(): undefined { return undefined; }
}

function createTestAgent(disposables: DisposableStore): CopilotAgent {
	const services = new ServiceCollection();
	const logService = new NullLogService();
	const fileService = disposables.add(new FileService(logService));
	services.set(ILogService, logService);
	services.set(IFileService, fileService);
	services.set(ISessionDataService, createNullSessionDataService());
	services.set(IAgentPluginManager, new TestAgentPluginManager());
	services.set(IAgentHostGitService, new TestAgentHostGitService());
	services.set(IAgentHostTerminalManager, new TestAgentHostTerminalManager());
	const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
	services.set(IInstantiationService, instantiationService);
	return instantiationService.createInstance(CopilotAgent);
}

async function disposeAgent(agent: CopilotAgent): Promise<void> {
	agent.dispose();
	await Promise.resolve();
}

suite('CopilotAgent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the Copilot CLI sibling worktrees root convention', () => {
		assert.strictEqual(
			getCopilotWorktreesRoot(URI.file('/Users/me/src/vscode')).fsPath,
			URI.file('/Users/me/src/vscode.worktrees').fsPath,
		);
	});

	test('uses Agents-window Copilot CLI branch prefix', () => {
		assert.strictEqual(getCopilotWorktreeBranchName('12345678-aaaa-bbbb-cccc-123456789abc', 'add-agent-host-config'), 'agents/add-agent-host-config-12345678');
		assert.strictEqual(getCopilotWorktreeBranchName('12345678-aaaa-bbbb-cccc-123456789abc', undefined), 'agents/12345678-aaaa-bbbb-cccc-123456789abc');
	});

	test('uses Git extension branch-derived worktree folder names', () => {
		assert.strictEqual(getCopilotWorktreeName('agents/add-agent-host-config-12345678'), 'agents-add-agent-host-config-12345678');
	});

	test('keeps hinted branch names short', () => {
		assert.strictEqual(getCopilotWorktreeBranchName('12345678-aaaa-bbbb-cccc-123456789abc', 'a'.repeat(48)).length, 'agents/'.length + 48 + '-12345678'.length);
	});

	test('returns empty models and sessions before authentication', async () => {
		const disposables = new DisposableStore();
		const agent = createTestAgent(disposables);
		try {
			assert.deepStrictEqual(agent.models.get(), []);
			assert.deepStrictEqual(await agent.listSessions(), []);
		} finally {
			await disposeAgent(agent);
			disposables.dispose();
		}
	});

	test('requires authentication before creating a session', async () => {
		const disposables = new DisposableStore();
		const agent = createTestAgent(disposables);
		try {
			await assert.rejects(
				() => agent.createSession({ workingDirectory: URI.file('/workspace') }),
				(error: Error) => error instanceof ProtocolError && error.code === AHP_AUTH_REQUIRED,
			);
		} finally {
			await disposeAgent(agent);
			disposables.dispose();
		}
	});
});
